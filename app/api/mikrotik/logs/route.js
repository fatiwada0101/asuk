import { NextResponse } from 'next/server.js';
import { getConnectionLogs, clearConnectionLogs, testConnection } from '@/lib/mikrotik.js';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth.js';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '30', 10);

  try {
    const data = await getConnectionLogs(limit);
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      logs: [],
    }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'clear') {
      await clearConnectionLogs();
      return NextResponse.json({
        success: true,
        message: 'Connection logs cleared successfully',
      });
    }

    if (body.action === 'test') {
      const testResult = await testConnection();
      const data = await getConnectionLogs(30);
      return NextResponse.json({
        success: true,
        testResult,
        ...data,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Supported actions: "clear", "test"',
    }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
