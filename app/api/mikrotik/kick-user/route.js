import { NextResponse } from 'next/server';
import { kickActiveSession } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();
  try {
    const { session_id } = await request.json();

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    await kickActiveSession(session_id);
    return NextResponse.json({ success: true, message: 'User disconnected' });
  } catch (error) {
    console.error('MikroTik kick-user error:', error.message);
    return NextResponse.json(
      { error: 'Failed to disconnect user', details: error.message },
      { status: 502 }
    );
  }
}
