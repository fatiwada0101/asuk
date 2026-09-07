import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * MikroTik Polling API — consumed by the RouterOS polling script.
 * 
 * GET  /api/mikrotik/polling?action=fetch&secret=xxx  — Fetch pending tasks
 * POST /api/mikrotik/polling                           — Report task completion
 * 
 * Authentication: shared secret stored in app_settings key 'polling_config'
 */

async function validatePollingSecret(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || '';

  // Also check POST body for secret
  let bodySecret = '';
  if (request.method === 'POST') {
    try {
      const cloned = request.clone();
      const body = await cloned.json();
      bodySecret = body.secret || '';
    } catch {}
  }

  const providedSecret = secret || bodySecret;
  if (!providedSecret) return false;

  try {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'polling_config')
      .maybeSingle();

    if (!data?.value?.secret) return false;
    return data.value.secret === providedSecret;
  } catch {
    return false;
  }
}

/**
 * GET — Fetch pending tasks for the router to process
 * Returns up to 5 pending tasks, marks them as 'processing'
 */
export async function GET(request) {
  if (!(await validatePollingSecret(request))) {
    return NextResponse.json({ error: 'Invalid polling secret' }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'heartbeat') {
    // Just record that router polled
    await supabaseAdmin
      .from('app_settings')
      .upsert({
        key: 'polling_last_seen',
        value: { timestamp: new Date().toISOString(), status: 'online' },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  try {
    // Fetch up to 5 pending tasks
    const { data: tasks, error } = await supabaseAdmin
      .from('pending_router_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) throw error;

    if (!tasks || tasks.length === 0) {
      // Record heartbeat even when no tasks
      await supabaseAdmin
        .from('app_settings')
        .upsert({
          key: 'polling_last_seen',
          value: { timestamp: new Date().toISOString(), status: 'online', pending: 0 },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

      return NextResponse.json({ tasks: [], count: 0 });
    }

    // Mark them as 'processing' to prevent double-pickup
    const taskIds = tasks.map(t => t.id);
    await supabaseAdmin
      .from('pending_router_tasks')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .in('id', taskIds);

    // Record heartbeat
    await supabaseAdmin
      .from('app_settings')
      .upsert({
        key: 'polling_last_seen',
        value: { timestamp: new Date().toISOString(), status: 'online', pending: tasks.length },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    // Return tasks in a format the RouterOS script can parse
    // RouterOS has limited JSON parsing, so we flatten the structure
    const simplifiedTasks = tasks.map(t => ({
      id: t.id,
      type: t.task_type,
      code: t.payload?.code || '',
      password: t.payload?.password || '',
      profile: t.payload?.profile || 'default',
      limit_uptime: t.payload?.limitUptime || '1d',
      comment: t.payload?.comment || '',
      shared_users: String(t.payload?.shared_users || '1'),
      rate_limit: t.payload?.rate_limit || '',
    }));

    return NextResponse.json({ tasks: simplifiedTasks, count: simplifiedTasks.length });
  } catch (error) {
    console.error('Polling fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

/**
 * POST — Router reports task completion
 * Body: { secret, task_id, status: 'completed'|'failed', result?, error_message? }
 * Can also handle batch: { secret, results: [{ task_id, status, result?, error_message? }] }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate secret from body
  const providedSecret = body.secret || '';
  if (!providedSecret) {
    return NextResponse.json({ error: 'Missing secret' }, { status: 401 });
  }

  try {
    const { data: configData } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'polling_config')
      .maybeSingle();

    if (!configData?.value?.secret || configData.value.secret !== providedSecret) {
      return NextResponse.json({ error: 'Invalid polling secret' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Auth check failed' }, { status: 500 });
  }

  try {
    // Handle batch results
    const results = body.results || [{ task_id: body.task_id, status: body.status, result: body.result, error_message: body.error_message }];

    const processed = [];

    for (const item of results) {
      if (!item.task_id) continue;

      const isSuccess = item.status === 'completed';
      const updateData = {
        status: isSuccess ? 'completed' : 'failed',
        result: item.result || null,
        error_message: item.error_message || null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attempts: 1, // Will be incremented if retried
      };

      const { error: updateErr } = await supabaseAdmin
        .from('pending_router_tasks')
        .update(updateData)
        .eq('id', item.task_id);

      if (updateErr) {
        console.error(`Failed to update task ${item.task_id}:`, updateErr);
        continue;
      }

      processed.push({ task_id: item.task_id, status: updateData.status });
    }

    // Record heartbeat
    await supabaseAdmin
      .from('app_settings')
      .upsert({
        key: 'polling_last_seen',
        value: {
          timestamp: new Date().toISOString(),
          status: 'online',
          last_completed: processed.length,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    return NextResponse.json({ success: true, processed: processed.length, results: processed });
  } catch (error) {
    console.error('Polling completion error:', error);
    return NextResponse.json({ error: 'Failed to process results' }, { status: 500 });
  }
}
