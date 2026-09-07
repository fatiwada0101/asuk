import { NextResponse } from 'next/server';
import { createOrQueueHotspotUser } from '@/lib/mikrotik';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

export async function POST(request) {
  // Require admin authentication
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { plan_id, plan_name, price, duration, custom_code } = await request.json();

    if (!plan_name || !price) {
      return NextResponse.json({ error: 'Missing plan_name or price' }, { status: 400 });
    }

    // Generate 6-char code or use custom
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = custom_code || 'WIFI-';
    if (!custom_code) {
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    // Fetch plan details for devices & speed
    let planDevices = 1;
    let planUploadSpeed = '12M';
    let planDownloadSpeed = '12M';

    if (plan_id) {
      const { data: planData } = await supabaseAdmin
        .from('plans')
        .select('devices, upload_speed, download_speed')
        .eq('id', plan_id)
        .maybeSingle();

      if (planData) {
        planDevices = Number(planData.devices) || 1;
        planUploadSpeed = planData.upload_speed || '12M';
        planDownloadSpeed = planData.download_speed || '12M';
      }
    }

    // Read global hotspot sharing setting and expiry mode
    let expiryMode = 'elapsed';
    try {
      const { data: hsData } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'hotspot_settings')
        .maybeSingle();

      if (hsData?.value) {
        if (!hsData.value.sharing_enabled) planDevices = 1;
        expiryMode = hsData.value.expiry_mode || 'elapsed';
      }
    } catch (e) {}

    const uptimeMap = {
      '1h': '1h', '3h': '3h', '24h': '1d',
      '3d': '3d', '7d': '7d', '30d': '30d',
    };

    const rateLimit = `${planUploadSpeed}/${planDownloadSpeed}`;

    // Real call to router (or queue for polling mode)
    const routerResult = await createOrQueueHotspotUser({
      code,
      password: code,
      profile: plan_name || 'default',
      limitUptime: uptimeMap[duration] || '1d',
      comment: `Admin: ${plan_name} (₦${price})`,
      shared_users: planDevices,
      rate_limit: rateLimit,
      expiry_mode: expiryMode,
    });

    // Record in Supabase
    await supabaseAdmin
      .from('vouchers')
      .insert({
        voucher_code: code,
        profile_name: plan_name,
        price: Number(price),
        is_used: false,
      });

    return NextResponse.json({
      success: true,
      voucher_code: code,
      router_id: routerResult.routerId,
      profile: routerResult.profile,
    });
  } catch (error) {
    console.error('MikroTik create-voucher error:', error.message);
    return NextResponse.json(
      { error: 'Failed to create voucher on router', details: error.message },
      { status: 502 }
    );
  }
}
