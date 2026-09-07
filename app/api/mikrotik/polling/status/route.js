import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

/**
 * GET /api/mikrotik/polling/status — Polling system stats for admin dashboard
 */
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    // Get polling config
    const { data: configData } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'polling_config')
      .maybeSingle();

    // Get last seen heartbeat
    const { data: lastSeenData } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'polling_last_seen')
      .maybeSingle();

    // Get task counts by status
    const { data: allTasks } = await supabaseAdmin
      .from('pending_router_tasks')
      .select('status, created_at, completed_at');

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: 0,
    };

    let oldestPending = null;
    let latestCompleted = null;

    (allTasks || []).forEach(t => {
      stats.total++;
      stats[t.status] = (stats[t.status] || 0) + 1;

      if (t.status === 'pending' && (!oldestPending || t.created_at < oldestPending)) {
        oldestPending = t.created_at;
      }
      if (t.status === 'completed' && (!latestCompleted || t.completed_at > latestCompleted)) {
        latestCompleted = t.completed_at;
      }
    });

    const lastSeen = lastSeenData?.value?.timestamp || null;
    const isOnline = lastSeen
      ? (Date.now() - new Date(lastSeen).getTime()) < 60000 // Online if polled in last 60s
      : false;

    return NextResponse.json({
      enabled: configData?.value?.enabled || false,
      secret_configured: Boolean(configData?.value?.secret),
      polling_interval: configData?.value?.interval || 10,
      router_online: isOnline,
      last_seen: lastSeen,
      stats,
      oldest_pending: oldestPending,
      latest_completed: latestCompleted,
    });
  } catch (error) {
    console.error('Polling status error:', error);
    return NextResponse.json({ error: 'Failed to fetch polling status' }, { status: 500 });
  }
}

/**
 * POST /api/mikrotik/polling/status — Admin actions (enable/disable, regenerate secret, cleanup)
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { action } = await request.json();

    if (action === 'cleanup') {
      // Remove completed/failed tasks older than 24 hours
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('pending_router_tasks')
        .delete({ count: 'exact' })
        .in('status', ['completed', 'failed'])
        .lt('completed_at', cutoff);

      return NextResponse.json({ success: true, cleaned: count || 0 });
    }

    if (action === 'retry_failed') {
      // Reset failed tasks back to pending
      const { count } = await supabaseAdmin
        .from('pending_router_tasks')
        .update({ status: 'pending', error_message: null, updated_at: new Date().toISOString() })
        .eq('status', 'failed');

      return NextResponse.json({ success: true, retried: count || 0 });
    }

    if (action === 'reset_stuck') {
      // Reset tasks stuck in 'processing' for more than 2 minutes
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('pending_router_tasks')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('status', 'processing')
        .lt('updated_at', cutoff);

      return NextResponse.json({ success: true, reset: count || 0 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Polling status action error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
