import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    // Build query for paid vouchers only (user_id IS NOT NULL)
    let query = supabaseAdmin
      .from('vouchers')
      .select('id, voucher_code, profile_name, price, created_at, user_id, is_used')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00`);
    }
    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59`);
    }

    const { data: vouchers, error } = await query;
    if (error) throw error;

    const transactions = vouchers || [];
    const totalRevenue = transactions.reduce((s, v) => s + (Number(v.price) || 0), 0);
    const totalSales = transactions.length;
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

    // Top plan
    const planMap = {};
    transactions.forEach(v => {
      const name = v.profile_name || 'Unknown';
      if (!planMap[name]) planMap[name] = { name, count: 0, revenue: 0 };
      planMap[name].count++;
      planMap[name].revenue += Number(v.price) || 0;
    });
    const topPlan = Object.values(planMap).sort((a, b) => b.revenue - a.revenue)[0] || null;

    // Daily breakdown
    const dailyMap = {};
    transactions.forEach(v => {
      const day = v.created_at ? v.created_at.split('T')[0] : 'unknown';
      if (!dailyMap[day]) dailyMap[day] = { date: day, count: 0, revenue: 0 };
      dailyMap[day].count++;
      dailyMap[day].revenue += Number(v.price) || 0;
    });
    const dailyBreakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      transactions: transactions.map(v => ({
        id: v.id,
        voucher_code: v.voucher_code,
        plan: v.profile_name,
        amount: Number(v.price) || 0,
        date: v.created_at,
        used: v.is_used,
      })),
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
