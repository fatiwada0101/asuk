import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createHotspotUser, isMikroTikConfigured } from '@/lib/mikrotik';

/**
 * Helper: Generate a collision-resistant 6-char voucher code with retry
 */
async function generateUniqueCode(maxRetries = 3) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let code = 'WIFI-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Check if code already exists in Supabase
    const { data: existing } = await supabaseAdmin
      .from('vouchers')
      .select('id')
      .eq('voucher_code', code)
      .maybeSingle();

    if (!existing) return code;
  }
  // Fallback: timestamp-based code
  return 'WIFI-' + Date.now().toString(36).toUpperCase().slice(-6);
}

/**
 * Helper: Read global hotspot settings from app_settings
 */
async function getHotspotSettings() {
  try {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'hotspot_settings')
      .maybeSingle();
    return data?.value || { sharing_enabled: false, default_devices: 1, default_upload_speed: '12M', default_download_speed: '12M' };
  } catch {
    return { sharing_enabled: false, default_devices: 1, default_upload_speed: '12M', default_download_speed: '12M' };
  }
}

export async function POST(request) {
  try {
    const { plan_id, plan_name, price, duration, user_id } = await request.json();

    if (!plan_name || !price) {
      return NextResponse.json({ error: 'Missing plan name or price' }, { status: 400 });
    }

    const numericPrice = Number(price);

    if (!user_id) {
      return NextResponse.json({
        error: 'Payment required. Please complete card/bank transfer payment or sign in to use your wallet.',
      }, { status: 402 });
    }

    // 1. Fetch plan details + global hotspot settings in parallel
    const [planResult, hotspotSettings] = await Promise.all([
      plan_id
        ? supabaseAdmin.from('plans').select('devices, upload_speed, download_speed').eq('id', plan_id).maybeSingle()
        : Promise.resolve({ data: null }),
      getHotspotSettings(),
    ]);

    const planData = planResult?.data;
    let planDevices = Number(planData?.devices) || 1;
    let planUploadSpeed = planData?.upload_speed || '12M';
    let planDownloadSpeed = planData?.download_speed || '12M';

    // If sharing is disabled globally, force 1 device
    if (!hotspotSettings.sharing_enabled) {
      planDevices = 1;
    }

    // 2. ATOMIC wallet deduction — prevents race condition
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin
      .rpc('adjust_wallet_balance', {
        p_user_id: user_id,
        p_amount: numericPrice,
        p_operation: 'deduct',
      });

    if (rpcErr) {
      console.error('RPC wallet deduction error:', rpcErr);
      return NextResponse.json({ error: 'Database error processing payment' }, { status: 500 });
    }

    const newBalance = Number(rpcResult);
    if (newBalance < 0) {
      // Insufficient funds — the RPC returns -1
      return NextResponse.json({
        error: 'Insufficient wallet balance. Please top up your wallet first.',
      }, { status: 400 });
    }

    // 3. Generate unique voucher code
    let code = await generateUniqueCode();

    const uptimeMap = {
      '1h': '1h', '3h': '3h', '24h': '1d',
      '3d': '3d', '7d': '7d', '30d': '30d',
    };

    const rateLimit = `${planUploadSpeed}/${planDownloadSpeed}`;

    // 4. Provision voucher — MikroTik router API first, fallback voucher pool when API fails or router is unconfigured
    let routerResult = null;
    let isFallback = false;
    const mikrotikConfigured = await isMikroTikConfigured();

    if (mikrotikConfigured) {
      try {
        routerResult = await createHotspotUser({
          code,
          password: code,
          profile: plan_name,
          limitUptime: uptimeMap[duration] || '1d',
          comment: `User ${user_id} - ${plan_name} - ₦${numericPrice}`,
          shared_users: planDevices,
          rate_limit: rateLimit,
        });
      } catch (routerErr) {
        console.warn('MikroTik router API failed during wallet purchase, checking fallback pool:', routerErr.message);

        // Atomic, race-condition safe claim from fallback pool (strict plan isolation)
        const { data: claimedRows, error: claimErr } = await supabaseAdmin
          .rpc('claim_fallback_voucher', {
            p_profile_name: plan_name,
            p_plan_id: plan_id || null,
            p_user_id: user_id,
          });

        if (!claimErr && claimedRows && claimedRows.length > 0) {
          const claimed = claimedRows[0];
          console.log(`Atomically claimed fallback voucher ${claimed.voucher_code} for ${plan_name} after router API failure`);
          code = claimed.voucher_code;
          isFallback = true;
        } else {
          // Router failed AND no fallback vouchers — refund wallet!
          console.error('No fallback voucher available, refunding wallet:', routerErr.message);
          await supabaseAdmin.rpc('adjust_wallet_balance', {
            p_user_id: user_id,
            p_amount: numericPrice,
            p_operation: 'add',
          });

          return NextResponse.json({
            error: `Router connection failed: ${routerErr.message}. No fallback vouchers in reserve for "${plan_name}". Your wallet has been refunded.`,
            router_error: true,
          }, { status: 502 });
        }
      }
    } else {
      // Router is NOT configured in settings: trigger fallback pool directly
      console.log(`MikroTik router is not configured in settings. Triggering fallback pool directly for "${plan_name}"`);

      const { data: claimedRows, error: claimErr } = await supabaseAdmin
        .rpc('claim_fallback_voucher', {
          p_profile_name: plan_name,
          p_plan_id: plan_id || null,
          p_user_id: user_id,
        });

      if (!claimErr && claimedRows && claimedRows.length > 0) {
        const claimed = claimedRows[0];
        console.log(`Atomically claimed fallback voucher ${claimed.voucher_code} for ${plan_name} (Router not configured)`);
        code = claimed.voucher_code;
        isFallback = true;
      } else {
        // Router not configured AND no fallback vouchers available — refund wallet!
        console.error('Router not configured and no fallback vouchers available, refunding wallet');
        await supabaseAdmin.rpc('adjust_wallet_balance', {
          p_user_id: user_id,
          p_amount: numericPrice,
          p_operation: 'add',
        });

        return NextResponse.json({
          error: `The Wi-Fi router is not yet configured in settings and no fallback vouchers are in reserve for "${plan_name}". Your wallet has been refunded.`,
          router_error: true,
        }, { status: 502 });
      }
    }

    // 5. Record transaction
    const { data: tx } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id,
        type: 'voucher_purchase',
        amount: numericPrice,
        status: 'successful',
      })
      .select('id')
      .single();

    // 6. Record voucher in Supabase
    await supabaseAdmin
      .from('vouchers')
      .insert({
        user_id,
        voucher_code: code,
        profile_name: plan_name,
        price: numericPrice,
        transaction_id: tx?.id || null,
        is_used: false,
      });

    // 7. Create notification
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id,
        title: isFallback ? 'Wi-Fi Pass Purchased (Backup Pool)' : 'Wi-Fi Pass Purchased',
        message: `${plan_name} pass activated. Your voucher code: ${code}`,
        type: 'voucher_purchase',
      });
    } catch (e) {}

    return NextResponse.json({
      success: true,
      voucher_code: code,
      plan: plan_name,
      price: numericPrice,
      router_id: routerResult?.routerId || null,
      profile: routerResult?.profile || plan_name,
      new_balance: newBalance,
      is_fallback: isFallback,
    });
  } catch (error) {
    console.error('Purchase route exception:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
