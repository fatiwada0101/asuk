import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { createHotspotUser, isMikroTikConfigured } from '@/lib/mikrotik.js';
import { validateUserAuth, userUnauthorizedResponse } from '@/lib/user-auth.js';
import { generateUniqueCode, generateWalletTxRef } from '@/lib/voucher-utils.js';

// generateUniqueCode and generateWalletTxRef imported from @/lib/voucher-utils.js

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
    return data?.value || {
      sharing_enabled: false, default_devices: 1,
      default_upload_speed: '12M', default_download_speed: '12M',
      expiry_mode: 'elapsed',
    };
  } catch {
    return {
      sharing_enabled: false, default_devices: 1,
      default_upload_speed: '12M', default_download_speed: '12M',
      expiry_mode: 'elapsed',
    };
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { plan_id, plan_name, duration, user_id } = body;

    // 1. Verify User Authentication (protects against wallet drain)
    const authUser = await validateUserAuth(request);
    if (!authUser) {
      return userUnauthorizedResponse('Authentication required to purchase passes with wallet balance');
    }

    if (user_id && authUser.id !== user_id) {
      return NextResponse.json({ error: 'Unauthorized: Cannot purchase using another user wallet' }, { status: 403 });
    }
    const effectiveUserId = authUser.id;

    // 2. Fetch authoritative plan details directly from DB (prevents price tampering)
    let authoritativePlan = null;
    if (plan_id) {
      const { data } = await supabaseAdmin
        .from('plans')
        .select('*')
        .eq('id', plan_id)
        .maybeSingle();
      authoritativePlan = data;
    }
    if (!authoritativePlan && plan_name) {
      const { data } = await supabaseAdmin
        .from('plans')
        .select('*')
        .eq('name', plan_name)
        .maybeSingle();
      authoritativePlan = data;
    }

    if (!authoritativePlan) {
      return NextResponse.json({ error: 'Selected internet plan was not found in catalog' }, { status: 400 });
    }

    const numericPrice = Number(authoritativePlan.price);
    const effectivePlanName = authoritativePlan.name;
    const effectiveDuration = authoritativePlan.duration || duration || '24h';

    // ── IDEMPOTENCY GUARD: prevent double-deduction from rapid double-click ──
    try {
      const windowStart = new Date(Date.now() - 15000).toISOString();
      const { data: recentPurchase } = await supabaseAdmin
        .from('vouchers')
        .select('voucher_code, profile_name, price')
        .eq('user_id', effectiveUserId)
        .eq('profile_name', effectivePlanName)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentPurchase) {
        console.log(`Idempotency hit (wallet): user ${effectiveUserId} already bought "${effectivePlanName}" within last 15s — returning existing voucher`);
        return NextResponse.json({
          success: true,
          voucher_code: recentPurchase.voucher_code,
          plan: recentPurchase.profile_name,
          price: recentPurchase.price,
          is_fallback: false,
          idempotent: true,
        });
      }
    } catch (e) {
      console.warn('Wallet idempotency check failed (non-fatal):', e.message);
    }

    // 3. Fetch global hotspot settings
    const hotspotSettings = await getHotspotSettings();

    let planDevices = Number(authoritativePlan.devices) || 1;
    let planUploadSpeed = authoritativePlan.upload_speed || '12M';
    let planDownloadSpeed = authoritativePlan.download_speed || '12M';

    // If sharing is disabled globally, force 1 device
    if (!hotspotSettings.sharing_enabled) {
      planDevices = 1;
    }

    // 4. ATOMIC wallet deduction — prevents race condition
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin
      .rpc('adjust_wallet_balance', {
        p_user_id: effectiveUserId,
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

    // 3. Generate unique voucher code and tx_ref
    let code = await generateUniqueCode();
    const walletTxRef = generateWalletTxRef();

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
          profile: effectivePlanName,
          limitUptime: uptimeMap[effectiveDuration] || '1d',
          comment: `User ${effectiveUserId} - ${effectivePlanName} - ₦${numericPrice}`,
          shared_users: planDevices,
          rate_limit: rateLimit,
          expiry_mode: hotspotSettings.expiry_mode || 'elapsed',
        });
      } catch (routerErr) {
        console.warn('MikroTik router API failed during wallet purchase, checking fallback pool:', routerErr.message);

        // Atomic, race-condition safe claim from fallback pool (strict plan isolation)
        const { data: claimedRows, error: claimErr } = await supabaseAdmin
          .rpc('claim_fallback_voucher', {
            p_profile_name: effectivePlanName,
            p_plan_id: authoritativePlan.id || null,
            p_user_id: effectiveUserId,
          });

        if (!claimErr && claimedRows && claimedRows.length > 0) {
          const claimed = claimedRows[0];
          console.log(`Atomically claimed fallback voucher ${claimed.voucher_code} for ${effectivePlanName} after router API failure`);
          code = claimed.voucher_code;
          isFallback = true;
        } else {
          // Router failed AND no fallback vouchers — refund wallet!
          console.error('No fallback voucher available, refunding wallet:', routerErr.message);
          await supabaseAdmin.rpc('adjust_wallet_balance', {
            p_user_id: effectiveUserId,
            p_amount: numericPrice,
            p_operation: 'add',
          });

          return NextResponse.json({
            error: `Router connection failed: ${routerErr.message}. No fallback vouchers in reserve for "${effectivePlanName}". Your wallet has been refunded.`,
            router_error: true,
          }, { status: 502 });
        }
      }
    } else {
      // Router is NOT configured in settings: trigger fallback pool directly
      console.log(`MikroTik router is not configured in settings. Triggering fallback pool directly for "${effectivePlanName}"`);

      const { data: claimedRows, error: claimErr } = await supabaseAdmin
        .rpc('claim_fallback_voucher', {
          p_profile_name: effectivePlanName,
          p_plan_id: authoritativePlan.id || null,
          p_user_id: effectiveUserId,
        });

      if (!claimErr && claimedRows && claimedRows.length > 0) {
        const claimed = claimedRows[0];
        console.log(`Atomically claimed fallback voucher ${claimed.voucher_code} for ${effectivePlanName} (Router not configured)`);
        code = claimed.voucher_code;
        isFallback = true;
      } else {
        // Router not configured AND no fallback vouchers available — refund wallet!
        console.error('Router not configured and no fallback vouchers available, refunding wallet');
        await supabaseAdmin.rpc('adjust_wallet_balance', {
          p_user_id: effectiveUserId,
          p_amount: numericPrice,
          p_operation: 'add',
        });

        return NextResponse.json({
          error: `The Wi-Fi router is not yet configured in settings and no fallback vouchers are in reserve for "${effectivePlanName}". Your wallet has been refunded.`,
          router_error: true,
        }, { status: 502 });
      }
    }

    // 5. Record transaction + voucher — refund wallet if DB write fails
    try {
      const { data: tx } = await supabaseAdmin
        .from('transactions')
        .insert({
          user_id: effectiveUserId,
          type: 'voucher_purchase',
          amount: numericPrice,
          status: 'successful',
          payment_method: 'wallet',
          metadata: {
            plan_name: effectivePlanName,
            voucher_code: code,
            duration: duration || null,
          },
        })
        .select('id')
        .single();

      // 6. Record voucher in Supabase (with tx_ref for idempotency)
      await supabaseAdmin
        .from('vouchers')
        .insert({
          user_id: effectiveUserId,
          voucher_code: code,
          profile_name: effectivePlanName,
          price: numericPrice,
          transaction_id: tx?.id || null,
          tx_ref: walletTxRef,
          is_used: false,
        });
    } catch (dbErr) {
      // DB insert failed after wallet was already deducted — refund immediately
      console.error('DB insert failed after provisioning — refunding wallet:', dbErr.message);
      await supabaseAdmin.rpc('adjust_wallet_balance', {
        p_user_id: effectiveUserId,
        p_amount: numericPrice,
        p_operation: 'add',
      }).catch((refundErr) => console.error('Refund also failed!', refundErr.message));

      return NextResponse.json({
        error: 'Your voucher was created on the router but we could not save your record. Your wallet has been refunded. Please contact support if you see charges.',
        router_id: routerResult?.routerId || null,
      }, { status: 500 });
    }

    // 7. Create notification (non-fatal)
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: effectiveUserId,
        title: isFallback ? 'Wi-Fi Pass Purchased (Backup Pool)' : 'Wi-Fi Pass Purchased',
        message: `${effectivePlanName} pass activated. Your voucher code: ${code}`,
        type: 'voucher_purchase',
      });
    } catch (e) {}

    return NextResponse.json({
      success: true,
      voucher_code: code,
      plan: effectivePlanName,
      price: numericPrice,
      router_id: routerResult?.routerId || null,
      profile: routerResult?.profile || effectivePlanName,
      new_balance: newBalance,
      is_fallback: isFallback,
    });
  } catch (error) {
    console.error('Purchase route exception:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
