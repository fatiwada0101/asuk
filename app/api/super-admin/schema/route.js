import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const isDownload = searchParams.get('download') === 'true';

  try {
    const schemaPath = path.join(process.cwd(), 'scripts', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      return NextResponse.json({ error: 'Schema file not found on server' }, { status: 404 });
    }

    const sqlContent = fs.readFileSync(schemaPath, 'utf8');

    if (isDownload) {
      return new NextResponse(sqlContent, {
        headers: {
          'Content-Type': 'application/sql; charset=utf-8',
          'Content-Disposition': 'attachment; filename="schema.sql"',
        },
      });
    }

    // Extract table definitions metadata for UI quick-reference
    const tables = [
      { name: 'profiles', desc: 'User accounts linked to auth.users with roles (customer/admin)', rls: 'Auth-Scoped (Users view/edit own)' },
      { name: 'wallets', desc: 'Prepaid balances with balance >= 0 check constraint', rls: 'Auth-Scoped (Users view own)' },
      { name: 'transactions', desc: 'Payment ledger with Flutterwave refs and transaction types', rls: 'Auth-Scoped (Users view own)' },
      { name: 'vouchers', desc: 'Wi-Fi credentials, profiles, limits, durations, and batch tracking', rls: 'Auth-Scoped (Users view own)' },
      { name: 'fallback_vouchers', desc: 'Pre-generated offline voucher cache for emergency router failover', rls: 'Service-Role (Secure server access)' },
      { name: 'plans', desc: 'Bandwidth passes with upload/download rate limits and devices', rls: 'Public (Read-only for active passes)' },
      { name: 'app_settings', desc: 'Central router configuration, branding, payments, and login templates', rls: 'Service-Role (Super Admin guarded)' },
      { name: 'change_history', desc: 'Audit log of admin configurations with 1-click state rollback', rls: 'Service-Role (Super Admin guarded)' },
      { name: 'pending_router_tasks', desc: 'Asynchronous task queue for router sync and polling mode', rls: 'Service-Role (Router/Server sync)' },
      { name: 'notifications', desc: 'Customer in-app alert notifications for transactions & top-ups', rls: 'Auth-Scoped (Users view/update own)' },
    ];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    let projectRef = '';
    try {
      const parsed = new URL(supabaseUrl);
      projectRef = parsed.hostname.split('.')[0];
    } catch {
      projectRef = '';
    }

    return NextResponse.json({
      sql: sqlContent,
      tables,
      projectRef,
      supabaseUrl,
      sqlEditorUrl: projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard',
    });
  } catch (error) {
    console.error('Schema route error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
