import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(5, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim();
    const exportAll = searchParams.get('export_all') === 'true';

    // 1. Build query for summary KPIs across the full date range
    let summaryQuery = supabaseAdmin
      .from('vouchers')
      .select('profile_name, price, created_at')
      .not('user_id', 'is', null);

    if (startDate) {
      summaryQuery = summaryQuery.gte('created_at', `${startDate}T00:00:00`);
    }
    if (endDate) {
      summaryQuery = summaryQuery.lte('created_at', `${endDate}T23:59:59`);
    }

    const { data: summaryRows, error: sumErr } = await summaryQuery;
    if (sumErr) throw sumErr;

    const allRecords = summaryRows || [];
    const totalRevenue = allRecords.reduce((s, v) => s + (Number(v.price) || 0), 0);
    const totalSales = allRecords.length;
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

    // Top plan
    const planMap = {};
    allRecords.forEach(v => {
      const name = v.profile_name || 'Unknown';
      if (!planMap[name]) planMap[name] = { name, count: 0, revenue: 0 };
      planMap[name].count++;
      planMap[name].revenue += Number(v.price) || 0;
    });
    const topPlan = Object.values(planMap).sort((a, b) => b.revenue - a.revenue)[0] || null;

    // Daily breakdown
    const dailyMap = {};
    allRecords.forEach(v => {
      const day = v.created_at ? v.created_at.split('T')[0] : 'unknown';
      if (!dailyMap[day]) dailyMap[day] = { date: day, count: 0, revenue: 0 };
      dailyMap[day].count++;
      dailyMap[day].revenue += Number(v.price) || 0;
    });
    const dailyBreakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // 2. Build paginated query for transactions table
    let txQuery = supabaseAdmin
      .from('vouchers')
      .select('id, voucher_code, profile_name, price, created_at, user_id, is_used', { count: 'exact' })
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false });

    if (startDate) {
      txQuery = txQuery.gte('created_at', `${startDate}T00:00:00`);
    }
    if (endDate) {
      txQuery = txQuery.lte('created_at', `${endDate}T23:59:59`);
    }
    if (search) {
      txQuery = txQuery.or(`voucher_code.ilike.%${search}%,profile_name.ilike.%${search}%`);
    }

    let pagedVouchers = [];
    let matchingCount = totalSales;

    if (exportAll) {
      const { data, error } = await txQuery;
      if (error) throw error;
      pagedVouchers = data || [];
      matchingCount = pagedVouchers.length;
    } else {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      const { data, count, error } = await txQuery.range(from, to);
      if (error) throw error;
      pagedVouchers = data || [];
      matchingCount = count || 0;
    }

    const totalPages = Math.ceil(matchingCount / limit) || 1;

    return NextResponse.json({
      transactions: pagedVouchers.map(v => ({
        id: v.id,
        voucher_code: v.voucher_code,
        plan: v.profile_name,
        amount: Number(v.price) || 0,
        date: v.created_at,
        used: v.is_used,
      })),
      pagination: {
        page,
        limit,
        total: matchingCount,
        totalPages,
      },
      summary: {
        totalRevenue,
        totalSales,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        topPlan,
      },
      dailyBreakdown,
    });
  } catch (error) {
    console.error('Finance API error:', error);
    return NextResponse.json({ error: 'Failed to fetch finance data' }, { status: 500 });
  }
}
