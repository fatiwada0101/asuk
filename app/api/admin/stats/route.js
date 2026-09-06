import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  try {
    // 1. Fetch all vouchers
    const { data: vouchers, error: vErr } = await supabaseAdmin
      .from('vouchers')
      .select('id, voucher_code, profile_name, price, is_used, created_at, user_id')
      .order('created_at', { ascending: false });

    if (vErr) console.error('Error fetching vouchers:', vErr);

    const allVouchers = vouchers || [];

    // Revenue = only USER-PURCHASED vouchers (user_id is NOT null)
    const paidVouchers = allVouchers.filter(v => v.user_id);
    const totalRevenue = paidVouchers.reduce((sum, v) => sum + (Number(v.price) || 0), 0);
    const totalSold = paidVouchers.length;
    const totalGenerated = allVouchers.length;

    // 2. Wallet liability
    const { data: wallets, error: wErr } = await supabaseAdmin
      .from('wallets')
      .select('balance');

    if (wErr) console.error('Error fetching wallets:', wErr);

    const walletLiability = wallets
      ? wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0)
      : 0;

    // 3. Plan distribution (paid only)
    const planCounts = {};
    paidVouchers.forEach((v) => {
      const name = v.profile_name || 'Standard Pass';
      if (!planCounts[name]) planCounts[name] = { name, count: 0, revenue: 0 };
      planCounts[name].count += 1;
      planCounts[name].revenue += Number(v.price) || 0;
    });

    const planDistribution = Object.values(planCounts)
      .map((p) => ({
        ...p,
        percentage: totalSold > 0 ? Math.round((p.count / totalSold) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 4. 7-Day sales velocity (paid only)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const last7Days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = dayNames[d.getDay()];

      const dayVouchers = paidVouchers.filter((v) => {
        if (!v.created_at) return false;
        return v.created_at.startsWith(dateStr);
      });

      const dayRevenue = dayVouchers.reduce((sum, v) => sum + (Number(v.price) || 0), 0);

      last7Days.push({
        date: dateStr,
        day: dayLabel,
        revenue: dayRevenue,
        count: dayVouchers.length,
        isToday: i === 0,
      });
    }

    // 5. Calculate real trend (this week vs last week)
    const thisWeekRevenue = last7Days.reduce((s, d) => s + d.revenue, 0);

    const lastWeekDays = [];
    for (let i = 13; i >= 7; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      lastWeekDays.push(dateStr);
    }
    const lastWeekRevenue = paidVouchers
      .filter(v => v.created_at && lastWeekDays.some(d => v.created_at.startsWith(d)))
      .reduce((s, v) => s + (Number(v.price) || 0), 0);

    let trendPct = 0;
    if (lastWeekRevenue > 0) {
      trendPct = Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100);
    } else if (thisWeekRevenue > 0) {
      trendPct = 100;
    }

    // 6. Recent 10 vouchers (all types for admin visibility)
    const recentVouchers = allVouchers.slice(0, 10);

    return NextResponse.json({
      revenue: totalRevenue,
      vouchers: totalSold,
      totalGenerated,
      walletLiability,
      planDistribution,
      dailySales: last7Days,
      recentVouchers,
      trendPct,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
