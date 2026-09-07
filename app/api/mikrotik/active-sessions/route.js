import { NextResponse } from 'next/server.js';
import { getActiveSessions } from '@/lib/mikrotik.js';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth.js';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();
  try {
    const sessions = await getActiveSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('MikroTik active-sessions error:', error.message);
    return NextResponse.json({
      sessions: [],
      error: error.message,
    }, { status: 502 });
  }
}
