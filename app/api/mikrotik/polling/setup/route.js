import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

/**
 * POST /api/mikrotik/polling/setup — Creates the pending_router_tasks table
 * Called once when admin enables polling mode for the first time.
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    // Check if table already exists by trying to query it
    const { error: checkErr } = await supabaseAdmin
      .from('pending_router_tasks')
      .select('id')
      .limit(1);

    if (!checkErr) {
      return NextResponse.json({ success: true, message: 'Table already exists', created: false });
    }

    // Table doesn't exist — create it via Supabase SQL RPC
    // We'll use a workaround: create the table by attempting an insert and catching the error,
    // or we can use the Supabase Management API
    
    // Since we can't run raw SQL through the PostgREST API, we need to guide the user
    // to run the SQL manually or use the Supabase Dashboard.
    // However, we can try using the rpc endpoint if we have a function.

    // Dynamically derive Supabase project ref from environment
    const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = rawSupabaseUrl.replace(/^https?:\/\//i, '').split('.')[0] || 'your-project';
    const sql = `
      CREATE TABLE IF NOT EXISTS pending_router_tasks (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        task_type TEXT NOT NULL DEFAULT 'create_hotspot_user',
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result JSONB,
        error_message TEXT,
        attempts INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_pending_tasks_status ON pending_router_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_pending_tasks_created ON pending_router_tasks(created_at);
      ALTER TABLE pending_router_tasks ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "allow_all_pending_router_tasks" ON pending_router_tasks FOR ALL USING (true) WITH CHECK (true);
    `;

    return NextResponse.json({
      success: false,
      needs_migration: true,
      message: 'The pending_router_tasks table needs to be created. Please run the SQL below in your Supabase Dashboard SQL Editor.',
      dashboard_url: `https://supabase.com/dashboard/project/${projectRef}/sql/new`,
      sql: sql.trim(),
    });
  } catch (error) {
    console.error('Polling setup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
