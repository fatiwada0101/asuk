import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { createHotspotUser, isMikroTikOnline } from '@/lib/mikrotik';

// GET — List fallback vouchers with server-side pagination, search, and plan summary
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '20', 10)));
    const profile_name = searchParams.get('profile_name');
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    // 0. Auto-expire any outdated vouchers (fire-and-forget — non-blocking on error)
    try {
      await supabaseAdmin.rpc('expire_outdated_vouchers');
    } catch (expireErr) {
      console.warn('expire_outdated_vouchers RPC error (non-fatal):', expireErr.message);
    }

    // 1. Fetch full counts & summary (lightweight query for KPI cards)
    const { data: allRows, error: summaryErr } = await supabaseAdmin
      .from('fallback_vouchers')
      .select('profile_name, plan_id, duration, is_used, status');

    if (summaryErr) throw summaryErr;

    const summary = {};
    let totalCount = 0;
    let availableCount = 0;
    let usedCount = 0;
    let expiredCount = 0;

    (allRows || []).forEach((v) => {
      totalCount++;
      const vStatus = v.status || (v.is_used ? 'used' : 'available');
      if (vStatus === 'used') {
        usedCount++;
      } else if (vStatus === 'expired') {
        expiredCount++;
      } else {
        availableCount++;
      }

      const p = v.profile_name || 'Default';
      if (!summary[p]) {
        summary[p] = {
          profile_name: p,
          plan_id: v.plan_id || null,
          duration: v.duration,
          total: 0,
          available: 0,
          used: 0,
          expired: 0,
        };
      }
      if (!summary[p].plan_id && v.plan_id) summary[p].plan_id = v.plan_id;
      summary[p].total++;
      if (vStatus === 'used') summary[p].used++;
      else if (vStatus === 'expired') summary[p].expired++;
      else summary[p].available++;
    });

    // 2. Build filtered paginated query for ledger
    let query = supabaseAdmin
      .from('fallback_vouchers')
      .select('*', { count: 'exact' });

    if (profile_name && profile_name !== 'all') {
      query = query.or(`profile_name.eq."${profile_name}",plan_id.eq."${profile_name}"`);
    }

    if (status === 'available') {
      // Available = not used AND status is either null (legacy) or 'available'
      // Note: neq('status','expired') alone excludes NULLs in PostgreSQL,
      // so we explicitly filter to is_used=false AND (status IS NULL OR status='available')
      query = query.eq('is_used', false)
        .or('status.is.null,status.eq.available');
    } else if (status === 'used') {
      query = query.eq('is_used', true);
    } else if (status === 'expired') {
      query = query.eq('status', 'expired').eq('is_used', false);
    }

    if (search) {
      query = query.or(`voucher_code.ilike.%${search}%,profile_name.ilike.%${search}%,plan_id.ilike.%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: vouchers, count, error: listErr } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (listErr) throw listErr;

    const totalMatching = count || 0;
    const totalPages = Math.ceil(totalMatching / limit) || 1;

    return NextResponse.json({
      vouchers: vouchers || [],
      pagination: {
        page,
        limit,
        total: totalMatching,
        totalPages,
      },
      summary: Object.values(summary),
      stats: {
        total: totalCount,
        available: availableCount,
        used: usedCount,
        expired: expiredCount,
      },
    });
  } catch (error) {
    console.error('Fallback vouchers fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch fallback vouchers' }, { status: 500 });
  }
}

// POST — Bulk add OR auto-generate vouchers on router and seed pool
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { action, profile_name, plan_id, duration } = body;

    if (!profile_name || !duration) {
      return NextResponse.json(
        { error: 'Profile name and duration are required' },
        { status: 400 }
      );
    }

    // ── ACTION A: 1-Click Auto-Generate on MikroTik Router ──────────────
    if (action === 'auto_generate') {
      const quantity = Math.min(100, Math.max(1, parseInt(body.quantity || '10', 10)));

      // Read default hotspot settings for fallback values
      let defaultDevices = 1;
      let defaultUploadSpeed = '12M';
      let defaultDownloadSpeed = '12M';
      try {
        const { data: hsSetting } = await supabaseAdmin
          .from('app_settings')
          .select('value')
          .eq('key', 'hotspot_settings')
          .maybeSingle();
        if (hsSetting?.value) {
          defaultDevices = Number(hsSetting.value.default_devices) || 1;
          defaultUploadSpeed = hsSetting.value.default_upload_speed || '12M';
          defaultDownloadSpeed = hsSetting.value.default_download_speed || '12M';
          if (!hsSetting.value.sharing_enabled) defaultDevices = 1;
        }
      } catch (e) {}

      const devices = body.devices !== undefined ? Number(body.devices) : defaultDevices;
      const uploadSpeed = body.upload_speed || defaultUploadSpeed;
      const downloadSpeed = body.download_speed || defaultDownloadSpeed;
      const rateLimit = `${uploadSpeed}/${downloadSpeed}`;

      // 1. Check router connectivity
      const online = await isMikroTikOnline(2500);

      const uptimeMap = {
        '1h': '1h', '3h': '3h', '24h': '1d',
        '3d': '3d', '7d': '7d', '30d': '30d',
      };
      const limitUptime = uptimeMap[duration] || duration;

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const createdVouchers = [];
      const errors = [];

      for (let i = 0; i < quantity; i++) {
        let code = 'WIFI-';
        for (let c = 0; c < 6; c++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        if (online) {
          try {
            await createHotspotUser({
              code,
              password: code,
              profile: profile_name,
              limitUptime,
              comment: `Fallback Pool Reserve: ${profile_name}${plan_id ? ` [${plan_id}]` : ''}`,
              shared_users: devices,
              rate_limit: rateLimit,
            });
          } catch (err) {
            console.error(`Error provisioning router voucher ${code}:`, err.message);
            errors.push(err.message);
          }
        }

        createdVouchers.push({
          voucher_code: code,
          plan_id: plan_id || null,
          profile_name,
          duration,
          status: 'available',
          is_used: false,
        });
      }

      if (createdVouchers.length === 0) {
        return NextResponse.json({
          error: `Failed to generate vouchers: ${errors[0] || 'Unknown error'}`,
        }, { status: 502 });
      }

      // Insert all successfully created vouchers into Supabase fallback pool
      const { data, error: insertErr } = await supabaseAdmin
        .from('fallback_vouchers')
        .insert(createdVouchers)
        .select('id');

      if (insertErr) throw insertErr;

      return NextResponse.json({
        success: true,
        action: 'auto_generate',
        added: createdVouchers.length,
        requested: quantity,
        partial: createdVouchers.length < quantity,
      });
    }

    // ── ACTION B: Manual Bulk Paste Codes ──────────────────────────────
    const { codes } = body;
    let codeList = [];
    if (Array.isArray(codes)) {
      codeList = codes;
    } else if (typeof codes === 'string') {
      codeList = codes.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
    }

    if (codeList.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid voucher code must be provided' },
        { status: 400 }
      );
    }

    const uniqueCodes = Array.from(new Set(codeList));

    const rows = uniqueCodes.map((code) => ({
      voucher_code: code,
      plan_id: plan_id || null,
      profile_name,
      duration,
      status: 'available',
      is_used: false,
    }));

    const { data, error } = await supabaseAdmin
      .from('fallback_vouchers')
      .upsert(rows, { onConflict: 'voucher_code', ignoreDuplicates: true })
      .select('id');

    if (error) throw error;

    return NextResponse.json({
      success: true,
      added: data ? data.length : rows.length,
      requested: uniqueCodes.length,
    });
  } catch (error) {
    console.error('Fallback vouchers save error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save fallback vouchers' }, { status: 500 });
  }
}

// DELETE — Delete fallback voucher(s) or prune used vouchers
export async function DELETE(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { id, profile_name, clear_unused, prune_used } = await request.json();

    // Maintenance action: Prune used + expired vouchers
    if (prune_used) {
      let usedQuery = supabaseAdmin
        .from('fallback_vouchers')
        .delete({ count: 'exact' })
        .eq('is_used', true);

      let expiredQuery = supabaseAdmin
        .from('fallback_vouchers')
        .delete({ count: 'exact' })
        .eq('status', 'expired')
        .eq('is_used', false);

      if (profile_name && profile_name !== 'all') {
        usedQuery = usedQuery.eq('profile_name', profile_name);
        expiredQuery = expiredQuery.eq('profile_name', profile_name);
      }

      const [{ count: usedPruned, error: err1 }, { count: expiredPruned, error: err2 }] =
        await Promise.all([usedQuery, expiredQuery]);

      if (err1) throw err1;
      if (err2) throw err2;

      return NextResponse.json({
        success: true,
        pruned: (usedPruned || 0) + (expiredPruned || 0),
        used_pruned: usedPruned || 0,
        expired_pruned: expiredPruned || 0,
      });
    }

    if (id) {
      const { error } = await supabaseAdmin
        .from('fallback_vouchers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (profile_name && clear_unused) {
      const { error } = await supabaseAdmin
        .from('fallback_vouchers')
        .delete()
        .eq('profile_name', profile_name)
        .eq('is_used', false)
        .or('status.is.null,status.eq.available'); // Only clear genuinely available, NOT expired

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Missing id or criteria for deletion' }, { status: 400 });
  } catch (error) {
    console.error('Fallback vouchers delete error:', error);
    return NextResponse.json({ error: 'Failed to delete fallback vouchers' }, { status: 500 });
  }
}
