import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

// GET — List all fallback vouchers & pool summary
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { data: vouchers, error } = await supabaseAdmin
      .from('fallback_vouchers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Build plan summary
    const summary = {};
    let totalCount = 0;
    let availableCount = 0;
    let usedCount = 0;

    (vouchers || []).forEach((v) => {
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

    return NextResponse.json({
      vouchers: vouchers || [],
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

// POST — Bulk add fallback vouchers
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { profile_name, duration, codes } = body;

    if (!profile_name || !duration) {
      return NextResponse.json(
        { error: 'Profile name and duration are required' },
        { status: 400 }
      );
    }

    let codeList = [];
    if (Array.isArray(codes)) {
      codeList = codes;
    } else if (typeof codes === 'string') {
      // Split by newlines, commas, or spaces
      codeList = codes.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
    }

    if (codeList.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid voucher code must be provided' },
        { status: 400 }
      );
    }

    // Deduplicate within the batch
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
    return NextResponse.json({ error: 'Failed to save fallback vouchers' }, { status: 500 });
  }
}

// DELETE — Delete fallback voucher(s)
export async function DELETE(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { id, profile_name, clear_unused } = await request.json();

    if (id) {
      // Delete single voucher
      const { error } = await supabaseAdmin
        .from('fallback_vouchers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (profile_name && clear_unused) {
      // Delete all unused vouchers for a specific profile
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
