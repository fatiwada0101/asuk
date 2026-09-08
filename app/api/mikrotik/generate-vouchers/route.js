import { NextResponse } from 'next/server';
import { createOrQueueHotspotUser } from '@/lib/mikrotik';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

function parseDataLimitToBytes(limit) {
  if (!limit || limit === 'unlimited') return null;
  const str = String(limit).trim().toUpperCase();
  const num = parseFloat(str);
  if (isNaN(num)) return null;

  if (str.includes('GB')) return Math.round(num * 1024 * 1024 * 1024);
  if (str.includes('MB')) return Math.round(num * 1024 * 1024);
  if (str.includes('KB')) return Math.round(num * 1024);
  return Math.round(num);
}

/**
 * GET — Retrieve batch history or vouchers for a specific batch
 * Query params: ?batch_id=...
 */
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batch_id')?.trim();

    if (batchId) {
      // Return all vouchers for this specific batch
      const { data: vouchers, error } = await supabaseAdmin
        .from('vouchers')
        .select('*')
        .eq('batch_id', batchId)
        .order('serial_number', { ascending: true });

      if (error) throw error;
      return NextResponse.json({ success: true, batch_id: batchId, vouchers: vouchers || [] });
    }

    // Return summary list of recent batches
    const { data: batches, error } = await supabaseAdmin
      .from('vouchers')
      .select('batch_id, profile_name, price, data_limit, created_at, is_used, status')
      .not('batch_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    // Group by batch_id
    const batchMap = new Map();
    (batches || []).forEach(v => {
      if (!batchMap.has(v.batch_id)) {
        batchMap.set(v.batch_id, {
          batch_id: v.batch_id,
          plan_name: v.profile_name,
          price: Number(v.price) || 0,
          data_limit: v.data_limit || 'Unlimited',
          created_at: v.created_at,
          total: 0,
          used: 0,
          available: 0,
        });
      }
      const b = batchMap.get(v.batch_id);
      b.total++;
      if (v.is_used || v.status === 'expired') {
        b.used++;
      } else {
        b.available++;
      }
    });

    const recentBatches = Array.from(batchMap.values()).slice(0, 20);
    return NextResponse.json({ success: true, batches: recentBatches });
  } catch (error) {
    console.error('Batch history query error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch batch history', details: error.message }, { status: 500 });
  }
}

/**
 * POST — Advanced Bulk Voucher Generation
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const {
      quantity = 1,
      prefix = 'WIFI-',
      code_format = 'alphanumeric',
      code_length = 6,
      profile = 'default',
      expiry_type = 'daily',
      custom_duration,
      data_limit = 'unlimited',
      price = 0,
      plan_name = 'Generated Voucher',
      devices = 1,
      upload_speed = '12M',
      download_speed = '12M',
    } = await request.json();

    const count = Math.min(Math.max(Number(quantity) || 1, 1), 100);
    const codeLen = Math.min(Math.max(Number(code_length) || 6, 4), 12);
    const cleanPrefix = typeof prefix === 'string' ? prefix.trim().toUpperCase() : 'WIFI-';

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

    // Parse bytes quota for RouterOS limit-bytes-total
    const limitBytesTotal = parseDataLimitToBytes(data_limit);

    // Check global hotspot settings for sharing and expiry mode
    let effectiveDevices = Number(devices) || 1;
    let expiryMode = 'elapsed';
    let hotspotUrl = 'asuktech.net';
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

      const { data: mtData } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'mikrotik')
        .maybeSingle();
      if (mtData?.value?.hotspot_url) {
        hotspotUrl = mtData.value.hotspot_url.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      }
    } catch (e) {}

    // Choose charset based on format
    let charSet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // alphanumeric (no ambiguous 0/O, 1/I)
    if (code_format === 'numbers_only') {
      charSet = '0123456789';
    } else if (code_format === 'letters_only') {
      charSet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    }

    const usedCodes = new Set();
    const generateCode = () => {
      let code, attempts = 0;
      do {
        code = cleanPrefix;
        for (let i = 0; i < codeLen; i++) {
          code += charSet.charAt(Math.floor(Math.random() * charSet.length));
        }
        attempts++;
      } while (usedCodes.has(code) && attempts < 30);
      usedCodes.add(code);
      return code;
    };

    // Unique Batch Tag (e.g. BATCH-20260908-7K2M)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randTag = Math.random().toString(36).substring(2, 6).toUpperCase();
    const batchId = `BATCH-${dateStr}-${randTag}`;

    const results = [];
    const errors = [];

    // Create vouchers sequentially to avoid overwhelming router
    for (let i = 0; i < count; i++) {
      const code = generateCode();
      const serialNum = i + 1;
      const cleanDataLabel = data_limit && data_limit !== 'unlimited' ? ` • ${data_limit}` : '';

      try {
        const routerResult = await createOrQueueHotspotUser({
          code,
          password: code,
          profile: profile !== 'default' ? profile : undefined,
          limitUptime,
          comment: `Batch: ${plan_name} (${expiryLabel}${cleanDataLabel}) [${batchId} #${serialNum}] — ₦${price}`,
          shared_users: effectiveDevices,
          rate_limit: `${upload_speed}/${download_speed}`,
          expiry_mode: expiryMode,
          limit_bytes_total: limitBytesTotal,
        });

        // Insert into Supabase vouchers table
        await supabaseAdmin
          .from('vouchers')
          .insert({
            voucher_code: code,
            profile_name: plan_name,
            price: Number(price),
            is_used: false,
            duration: limitUptime,
            status: 'active',
            batch_id: batchId,
            data_limit: data_limit || 'unlimited',
            serial_number: serialNum,
          });

        const cleanHotspot = hotspotUrl || 'asuktech.net';
        const qrUrl = `http://${cleanHotspot}/login?code=${encodeURIComponent(code)}`;

        results.push({
          code,
          serial_number: serialNum,
          router_id: routerResult.routerId,
          profile: routerResult.profile,
          expiry: expiryLabel,
          data_limit: data_limit || 'Unlimited',
          price: Number(price),
          batch_id: batchId,
          qr_url: qrUrl,
        });
      } catch (err) {
        errors.push({
          code,
          serial_number: serialNum,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      generated: results.length,
      failed: errors.length,
      vouchers: results,
      errors: errors.length > 0 ? errors : undefined,
      expiry_type,
      expiry_label: expiryLabel,
      limit_uptime: limitUptime,
      data_limit: data_limit || 'Unlimited',
      hotspot_url: hotspotUrl,
    });
  } catch (error) {
    console.error('Bulk voucher generation error:', error.message);
    return NextResponse.json(
      { error: 'Failed to generate vouchers', details: error.message },
      { status: 502 }
    );
  }
}
