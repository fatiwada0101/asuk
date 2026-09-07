import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { createHotspotUser, isMikroTikOnline } from '@/lib/mikrotik';

// GET — List fallback vouchers with server-side pagination, search, and summary
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '20', 10)));
    const profile_name = searchParams.get('profile_name');
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    // 1. Fetch full counts & summary (lightweight query for KPI cards)
    const { data: allRows, error: summaryErr } = await supabaseAdmin
      .from('fallback_vouchers')
      .select('profile_name, duration, is_used');

    if (summaryErr) throw summaryErr;

    const summary = {};
    let totalCount = 0;
    let availableCount = 0;
    let usedCount = 0;

    (allRows || []).forEach((v) => {
      totalCount++;
      if (v.is_used) {
        usedCount++;
      } else {
        availableCount++;
      }

      const p = v.profile_name || 'Default';
      if (!summary[p]) {
        summary[p] = { profile_name: p, duration: v.duration, total: 0, available: 0, used: 0 };
      }
      summary[p].total++;
      if (v.is_used) {
        summary[p].used++;
      } else {
        summary[p].available++;
      }
    });

    // 2. Build filtered paginated query for ledger
    let query = supabaseAdmin
      .from('fallback_vouchers')
      .select('*', { count: 'exact' });

    if (profile_name && profile_name !== 'all') {
      query = query.eq('profile_name', profile_name);
    }

    if (status === 'available') {
      query = query.eq('is_used', false);
    } else if (status === 'used') {
      query = query.eq('is_used', true);
    }

    if (search) {
      query = query.or(`voucher_code.ilike.%${search}%,profile_name.ilike.%${search}%`);
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
    const { action, profile_name, duration } = body;

    if (!profile_name || !duration) {
      return NextResponse.json(
        { error: 'Profile name and duration are required' },
        { status: 400 }
      );
    }

    // ── ACTION A: 1-Click Auto-Generate on MikroTik Router ──────────────
    if (action === 'auto_generate') {
      const quantity = Math.min(100, Math.max(1, parseInt(body.quantity || '10', 10)));
      const devices = Number(body.devices) || 1;
      const uploadSpeed = body.upload_speed || '12M';
      const downloadSpeed = body.download_speed || '12M';
      const rateLimit = `${uploadSpeed}/${downloadSpeed}`;

      // 1. Pre-check router connectivity
      const online = await isMikroTikOnline(3000);
      if (!online) {
        return NextResponse.json({
          error: 'MikroTik router is offline or unreachable. Cannot auto-generate vouchers on the router. Please ensure the router is connected, or paste existing codes manually.',
          router_offline: true,
        }, { status: 503 });
      }

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

        try {
          await createHotspotUser({
            code,
            password: code,
            profile: profile_name,
            limitUptime,
            comment: `Fallback Pool Reserve: ${profile_name}`,
            shared_users: devices,
            rate_limit: rateLimit,
          });

          createdVouchers.push({
            voucher_code: code,
            profile_name,
            duration,
            is_used: false,
          });
        } catch (err) {
          console.error(`Error provisioning router voucher ${code}:`, err.message);
          errors.push(err.message);
          // If connection failed completely, abort early
          if (err.message.includes('timeout') || err.message.includes('Cannot connect')) {
            break;
          }
        }
      }

      if (createdVouchers.length === 0) {
        return NextResponse.json({
          error: `Failed to create vouchers on router: ${errors[0] || 'Unknown router error'}`,
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
      profile_name,
      duration,
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

// DELETE — Delete fallback voucher(s)
export async function DELETE(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { id, profile_name, clear_unused } = await request.json();

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
        .eq('is_used', false);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Missing id or criteria for deletion' }, { status: 400 });
  } catch (error) {
    console.error('Fallback vouchers delete error:', error);
    return NextResponse.json({ error: 'Failed to delete fallback vouchers' }, { status: 500 });
  }
}
