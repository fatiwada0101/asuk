// Quick migration script - run from wifi-app directory
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  // Check if table exists
  const { error } = await supabase.from('pending_router_tasks').select('id').limit(1);
  
  if (!error) {
    console.log('✅ Table pending_router_tasks already exists!');
    process.exit(0);
  }

  console.log('Table does not exist. Error:', error.message);
  console.log('\n⚠️ You need to create it manually in Supabase SQL Editor.');
  console.log('Opening: https://supabase.com/dashboard/project/vtvzxbyxgotcathjxivo/sql/new\n');
  console.log('Paste this SQL and click Run:\n');
  console.log(`CREATE TABLE IF NOT EXISTS pending_router_tasks (
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

CREATE POLICY "allow_all_pending_router_tasks" ON pending_router_tasks FOR ALL USING (true) WITH CHECK (true);`);
}

migrate();
