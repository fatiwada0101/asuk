import { NextResponse } from 'next/server';
import { getActiveSessions } from '@/lib/mikrotik';

export async function GET() {
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
