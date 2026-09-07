import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth.js';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();
  try {
    // Single RPC call — all aggregation happens server-side in PostgreSQL.
    // Replaces the old approach of loading all voucher rows into Node.js memory.
    const { data, error } = await supabaseAdmin.rpc('get_admin_stats');

    if (error) {
      console.error('Admin stats RPC error:', error);
      // Fallback: return zeros rather than a hard 500
      return NextResponse.json({
        revenue: 0, vouchers: 0, totalGenerated: 0,
        walletLiability: 0, planDistribution: [], dailySales: [],
        recentVouchers: [], trendPct: 0,
      });
    }

    // RPC returns a JSON object directly
    const stats = data || {};

    return NextResponse.json({
      revenue:          Number(stats.revenue || 0),
      vouchers:         Number(stats.vouchers || 0),
      totalGenerated:   Number(stats.totalGenerated || 0),
      walletLiability:  Number(stats.walletLiability || 0),
      planDistribution: stats.planDistribution || [],
      dailySales:       (stats.dailySales || []).map(d => ({
        date:    d.date,
        day:     d.day_label,
        revenue: Number(d.revenue || 0),
        count:   Number(d.count || 0),
        isToday: !!d.is_today,
      })),
      recentVouchers: stats.recentVouchers || [],
      trendPct:       Number(stats.trendPct || 0),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
