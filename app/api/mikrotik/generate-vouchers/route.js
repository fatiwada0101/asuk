import { NextResponse } from 'next/server';
import { createOrQueueHotspotUser } from '@/lib/mikrotik';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

/**
 * POST — Bulk generate vouchers with configurable expiry
 * Body: { quantity, profile, expiry_type, custom_duration, price, plan_name }
 * 
 * expiry_type: '1h' | '3h' | '6h' | '12h' | 'daily' | 'weekly' | 'monthly' | 'custom'
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();
  try {
    const {
      quantity = 1,
      profile = 'default',
      expiry_type = 'daily',
      custom_duration,
      price = 0,
      plan_name = 'Generated Voucher',
      devices = 1,
      upload_speed = '12M',
      download_speed = '12M',
      code_length = 6,
    } = await request.json();

    // Validate quantity (1-100)
    const count = Math.min(Math.max(Number(quantity) || 1, 1), 100);
    const codeLen = Math.min(Math.max(Number(code_length) || 6, 4), 12);

    // Map expiry_type to RouterOS uptime format
    const expiryMap = {
      '1h': '1h',
      '3h': '3h',
      '6h': '6h',
      '12h': '12h',
      'daily': '1d',
      'weekly': '7d',
      'monthly': '30d',
      'custom': custom_duration || '1d',
    };

    const limitUptime = expiryMap[expiry_type] || '1d';

    // Expiry label for comments
    const expiryLabels = {
      '1h': '1 Hour',
      '3h': '3 Hours',
      '6h': '6 Hours',
      '12h': '12 Hours',
      'daily': '1 Day',
      'weekly': '7 Days',
      'monthly': '30 Days',
      'custom': custom_duration || 'Custom',
    };
    const expiryLabel = expiryLabels[expiry_type] || expiry_type;

    // Check global hotspot sharing setting and expiry mode
    let effectiveDevices = Number(devices) || 1;
    let expiryMode = 'elapsed';
    try {
      const { data: hsData } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'hotspot_settings')
        .maybeSingle();
      if (hsData?.value) {
        if (!hsData.value.sharing_enabled) effectiveDevices = 1;
        expiryMode = hsData.value.expiry_mode || 'elapsed';
      }
    } catch (e) {}

    // Generate voucher codes with configurable length
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const usedCodes = new Set();
    const generateCode = () => {
      let code, attempts = 0;
      do {
        code = 'WIFI-';
        for (let i = 0; i < codeLen; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        attempts++;
      } while (usedCodes.has(code) && attempts < 20);
      usedCodes.add(code);
      return code;
    };

    const results = [];
    const errors = [];

    // Create vouchers sequentially to avoid overwhelming the router
    for (let i = 0; i < count; i++) {
      const code = generateCode();

      try {
        // Provision on router (or queue for polling mode)
        const routerResult = await createOrQueueHotspotUser({
          code,
          password: code,
          profile: profile !== 'default' ? profile : undefined,
          limitUptime,
          comment: `Batch: ${plan_name} (${expiryLabel}) — ₦${price}`,
          shared_users: effectiveDevices,
          rate_limit: `${upload_speed}/${download_speed}`,
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

        results.push({
          code,
          router_id: routerResult.routerId,
          profile: routerResult.profile,
          expiry: expiryLabel,
        });
      } catch (err) {
        errors.push({
          code,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      generated: results.length,
      failed: errors.length,
      vouchers: results,
      errors: errors.length > 0 ? errors : undefined,
      expiry_type,
      expiry_label: expiryLabel,
      limit_uptime: limitUptime,
    });
  } catch (error) {
    console.error('Bulk voucher generation error:', error.message);
    return NextResponse.json(
      { error: 'Failed to generate vouchers', details: error.message },
      { status: 502 }
    );
  }
}
