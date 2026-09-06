import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createHotspotUser } from '@/lib/mikrotik';

export async function POST(request) {
  try {
    const { transaction_id, tx_ref, plan_name, price, duration, email, phone, user_id, plan_id } = await request.json();

    if (!transaction_id || !plan_name || !price) {
      return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
    }

    const numericPrice = Number(price);

    // 1. Fetch plan details for devices & speed
    let planDevices = 1;
    let planUploadSpeed = '12M';
    let planDownloadSpeed = '12M';

    // Try to find plan by plan_id or by name
    const planQuery = plan_id
      ? supabaseAdmin.from('plans').select('devices, upload_speed, download_speed').eq('id', plan_id).maybeSingle()
      : supabaseAdmin.from('plans').select('devices, upload_speed, download_speed').eq('name', plan_name).maybeSingle();

    const { data: planData } = await planQuery;
    if (planData) {
      planDevices = Number(planData.devices) || 1;
      planUploadSpeed = planData.upload_speed || '12M';
      planDownloadSpeed = planData.download_speed || '12M';
    }

    // Check global hotspot sharing toggle
    try {
      const { data: hsData } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'hotspot_settings')
        .maybeSingle();
      if (hsData?.value && !hsData.value.sharing_enabled) {
        planDevices = 1;
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

    // 3. Verify with Flutterwave API if secret key is present
    if (secretKey) {
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

        if (Number(flwData.data?.amount) < numericPrice) {
          return NextResponse.json({ error: 'Payment amount does not match plan price' }, { status: 400 });
        }
      } catch (flwErr) {
        console.error('Flutterwave verify error:', flwErr);
        return NextResponse.json({ error: 'Unable to verify payment with gateway: ' + flwErr.message }, { status: 502 });
      }
    }

    // 4. Generate random voucher code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'WIFI-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const uptimeMap = {
      '1h': '1h', '3h': '3h', '24h': '1d',
      '3d': '3d', '7d': '7d', '30d': '30d',
    };

    // Build rate limit string
    const rateLimit = `${planUploadSpeed}/${planDownloadSpeed}`;

    // 5. Provision on MikroTik router
    let routerResult;
    try {
      routerResult = await createHotspotUser({
        code,
        password: code,
        profile: plan_name,
        limitUptime: uptimeMap[duration] || '1d',
        comment: `Online Pay: ${email || phone || 'Guest'} - ${plan_name} - ₦${numericPrice} [Ref: ${tx_ref}]`,
        shared_users: planDevices,
        rate_limit: rateLimit,
      });
    } catch (routerErr) {
      console.error('Router provisioning error after payment:', routerErr.message);
      // Payment was taken, but router provisioning had an error
      // Record as pending in Supabase so admin can see and fulfill
      await supabaseAdmin
        .from('vouchers')
        .insert({
          user_id: user_id || null,
          voucher_code: code,
          profile_name: plan_name,
          price: numericPrice,
          is_used: false,
        });

      return NextResponse.json({
        success: false,
        voucher_code: code,
        error: `Payment was verified (Ref: ${tx_ref}), but the router reported: "${routerErr.message}". Please contact support or check router in Super Admin.`,
        pending_router: true,
      }, { status: 502 });
    }

    // 6. Record successful voucher in Supabase
    await supabaseAdmin
      .from('vouchers')
      .insert({
        user_id: user_id || null,
        voucher_code: code,
        profile_name: plan_name,
        price: numericPrice,
        is_used: false,
      });

    // 7. Create notification if user is logged in
    if (user_id) {
      try {
        await supabaseAdmin.from('notifications').insert({
          user_id,
          title: 'Wi-Fi Pass Purchased',
          message: `${plan_name} pass activated via card payment. Your code: ${code}`,
          type: 'voucher_purchase',
        });
      } catch (e) {}
    }

    return NextResponse.json({
      success: true,
      voucher_code: code,
      plan: plan_name,
      price: numericPrice,
      router_id: routerResult.routerId,
      profile: routerResult.profile,
    });
  } catch (error) {
    console.error('Verify payment exception:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
