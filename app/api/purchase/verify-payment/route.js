import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createOrQueueHotspotUser, isMikroTikConfigured } from '@/lib/mikrotik';
import { generateUniqueCode } from '@/lib/voucher-utils.js';

export async function POST(request) {
  try {
    const { transaction_id, tx_ref, plan_name, price, duration, email, phone, user_id, plan_id } = await request.json();

    if (!transaction_id || !plan_name || !price) {
      return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
    }

    const numericPrice = Number(price);

    // ── IDEMPOTENCY GUARD: prevent double-issue if same tx_ref is submitted twice ──
    // (can happen via webhook retry, network error, or rapid double-submit)
    // We use tx_ref (our own unique reference) rather than transaction_id (Flutterwave's numeric ID)
    if (tx_ref) {
      try {
        const { data: existing } = await supabaseAdmin
          .from('vouchers')
          .select('voucher_code, profile_name, price')
          .eq('tx_ref', tx_ref)
          .maybeSingle();

        if (existing) {
          console.log(`Idempotency hit: tx_ref ${tx_ref} already issued voucher ${existing.voucher_code}`);
          return NextResponse.json({
            success: true,
            voucher_code: existing.voucher_code,
            plan: existing.profile_name,
            price: existing.price,
            is_fallback: false,
            idempotent: true,
          });
        }
      } catch (e) {
        // Non-fatal — proceed with normal flow if check fails
        console.warn('Idempotency check failed (non-fatal):', e.message);
      }
    }


    // 1. Fetch authoritative plan details directly from DB (prevents price/speed tampering)
    const planQuery = plan_id
      ? supabaseAdmin.from('plans').select('*').eq('id', plan_id).maybeSingle()
      : supabaseAdmin.from('plans').select('*').eq('name', plan_name).maybeSingle();

    const { data: planData } = await planQuery;
    if (!planData) {
      return NextResponse.json({ error: 'Selected internet plan was not found in catalog' }, { status: 400 });
    }

    const authoritativePrice = Number(planData.price);
    const effectivePlanName = planData.name || plan_name;
    const effectiveDuration = planData.duration || duration || '24h';
    let planDevices = Number(planData.devices) || 1;
    const planUploadSpeed = planData.upload_speed || '12M';
    const planDownloadSpeed = planData.download_speed || '12M';

    // Check global hotspot sharing toggle and expiry mode
    let expiryMode = 'elapsed'; // default
    try {
      const { data: hsData } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'hotspot_settings')
        .maybeSingle();
      if (hsData?.value) {
        if (!hsData.value.sharing_enabled) {
          planDevices = 1;
        }
        expiryMode = hsData.value.expiry_mode || 'elapsed';
      }
    } catch (e) {}

    // 2. Check Flutterwave settings
    let secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    try {
      const { data: flwSetting } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'flutterwave')
        .maybeSingle();

      if (flwSetting?.value?.secret_key) {
        secretKey = flwSetting.value.secret_key.trim();
      }
    } catch (e) {
      console.warn('Could not read flutterwave setting from DB:', e.message);
    }

    // 3. Strict verification with Flutterwave API (never bypass if unconfigured)
    if (!secretKey) {
      return NextResponse.json({
        error: 'Payment verification is not available because Flutterwave Secret Key is not configured on the server. Please contact administrator.',
      }, { status: 503 });
    }

    try {
      const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!flwRes.ok) {
        return NextResponse.json({ error: 'Failed to verify payment with payment gateway' }, { status: 400 });
      }

      const flwData = await flwRes.json();
      if (flwData.status !== 'success' || flwData.data?.status !== 'successful') {
        return NextResponse.json({ error: 'Payment was not successful or was declined' }, { status: 400 });
      }

      const paidAmount = Number(flwData.data?.amount || 0);
      const expectedAmount = authoritativePrice;

      if (paidAmount < expectedAmount) {
        return NextResponse.json({ error: `Payment amount (₦${paidAmount}) does not match plan price (₦${expectedAmount})` }, { status: 400 });
      }

      // Check transaction reference if returned by gateway
      if (flwData.data?.tx_ref && tx_ref && flwData.data.tx_ref !== tx_ref) {
        return NextResponse.json({ error: 'Payment transaction reference mismatch' }, { status: 400 });
      }

      if (flwData.data?.currency && flwData.data.currency !== 'NGN') {
        return NextResponse.json({ error: 'Invalid currency for transaction' }, { status: 400 });
      }
    } catch (flwErr) {
      console.error('Flutterwave verify error:', flwErr);
      return NextResponse.json({ error: 'Unable to verify payment with gateway: ' + flwErr.message }, { status: 502 });
    }

    // 4. Generate collision-safe voucher code
    let code = await generateUniqueCode();

    const uptimeMap = {
      '1h': '1h', '3h': '3h', '24h': '1d',
      '3d': '3d', '7d': '7d', '30d': '30d',
    };

    // Build rate limit string
    const rateLimit = `${planUploadSpeed}/${planDownloadSpeed}`;

    // 5. Provision voucher — MikroTik router API first, fallback voucher pool when API fails or router is unconfigured
    let routerResult = null;
    let isFallback = false;
    const mikrotikConfigured = await isMikroTikConfigured();

    if (mikrotikConfigured) {
      try {
        routerResult = await createOrQueueHotspotUser({
          code,
          password: code,
          profile: effectivePlanName,
          limitUptime: uptimeMap[effectiveDuration] || '1d',
          comment: `Online Pay: ${email || phone || 'Guest'} - ${effectivePlanName} - ₦${authoritativePrice} [Ref: ${tx_ref}]`,
          shared_users: planDevices,
          rate_limit: rateLimit,
          expiry_mode: expiryMode,
        });
      } catch (routerErr) {
        console.warn('MikroTik router API failed after payment, triggering fallback pool:', routerErr.message);

        // Atomic, race-condition safe claim from fallback pool (strict plan isolation)
        const { data: claimedRows, error: claimErr } = await supabaseAdmin
          .rpc('claim_fallback_voucher', {
            p_profile_name: effectivePlanName,
            p_plan_id: planData.id || plan_id || null,
            p_user_id: user_id || null,
          });

        if (!claimErr && claimedRows && claimedRows.length > 0) {
          const claimed = claimedRows[0];
          console.log(`Atomically claimed fallback voucher ${claimed.voucher_code} for ${effectivePlanName} after router API failure`);
          code = claimed.voucher_code;
          isFallback = true;
        } else {
          // Payment was taken, but router provisioning had an error and no backup vouchers
          // We do NOT insert a voucher row here — the user must contact support with the tx_ref
          return NextResponse.json({
            success: false,
            error: `Payment was verified (Ref: ${tx_ref}), but the router API failed ("${routerErr.message}") and no fallback vouchers are available in stock for "${effectivePlanName}". Please contact support with Ref: ${tx_ref}.`,
            pending_router: true,
          }, { status: 502 });
        }
      }
    } else {
      // Router is NOT configured in settings: trigger fallback pool directly
      console.log(`MikroTik router is not configured in settings. Triggering fallback pool directly for "${effectivePlanName}"`);

      const { data: claimedRows, error: claimErr } = await supabaseAdmin
        .rpc('claim_fallback_voucher', {
          p_profile_name: effectivePlanName,
          p_plan_id: planData.id || plan_id || null,
          p_user_id: user_id || null,
        });

      if (!claimErr && claimedRows && claimedRows.length > 0) {
        const claimed = claimedRows[0];
        console.log(`Atomically claimed fallback voucher ${claimed.voucher_code} for ${effectivePlanName} (Router not configured)`);
        code = claimed.voucher_code;
        isFallback = true;
      } else {
        // Router not configured + no fallback vouchers — return error without inserting
        return NextResponse.json({
          success: false,
          error: `Payment was verified (Ref: ${tx_ref}), but the Wi-Fi router is not yet configured in settings and no fallback vouchers are in reserve for "${effectivePlanName}". Please contact support with Ref: ${tx_ref}.`,
          pending_router: true,
        }, { status: 502 });
      }
    }

    // 6. Record transaction for card payment (so it shows in wallet history/analytics)
    let txId = null;
    try {
      const { data: tx } = await supabaseAdmin
        .from('transactions')
        .insert({
          user_id: user_id || null,
          type: 'voucher_purchase',
          amount: authoritativePrice,
          status: 'successful',
          payment_method: 'card',
          flw_ref: tx_ref || null,
          metadata: {
            plan_name: effectivePlanName,
            voucher_code: code,
            duration: effectiveDuration || null,
          },
        })
        .select('id')
        .single();
      txId = tx?.id || null;
    } catch (e) {
      console.warn('Transaction record insert failed (non-fatal):', e.message);
    }

    // 7. Record successful voucher in Supabase (include tx_ref for idempotency)
    await supabaseAdmin
      .from('vouchers')
      .insert({
        user_id: user_id || null,
        voucher_code: code,
        profile_name: effectivePlanName,
        price: authoritativePrice,
        tx_ref: tx_ref || null,
        transaction_id: txId,
        is_used: false,
      });

    // 8. Create notification if user is logged in
    if (user_id) {
      try {
        await supabaseAdmin.from('notifications').insert({
          user_id,
          title: isFallback ? 'Wi-Fi Pass Purchased (Backup Pool)' : 'Wi-Fi Pass Purchased',
          message: `${effectivePlanName} pass activated via card payment. Your code: ${code}`,
          type: 'voucher_purchase',
        });
      } catch (e) {}
    }

    return NextResponse.json({
      success: true,
      voucher_code: code,
      plan: effectivePlanName,
      price: authoritativePrice,
      router_id: routerResult?.routerId || null,
      profile: routerResult?.profile || effectivePlanName,
      is_fallback: isFallback,
    });
  } catch (error) {
    console.error('Verify payment exception:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
