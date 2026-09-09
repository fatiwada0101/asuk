import { NextResponse } from 'next/server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { getChangeHistory, logChange, rollbackChange } from '@/lib/changeHistory';

/**
 * GET — Fetch change history entries
 * Query params: ?category=...&limit=...&offset=...
 */
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await getChangeHistory({ category, limit, offset });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Change history GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch change history' }, { status: 500 });
  }
}

/**
 * POST — Manually record a change history entry
 * Body: { category, action, summary, beforeState, afterState, metadata }
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json();
    const result = await logChange(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to log change' }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Change history POST error:', error);
    return NextResponse.json({ error: 'Failed to log change' }, { status: 500 });
  }
}

/**
 * PATCH — Rollback a change entry by ID
 * Body: { id }
 */
export async function PATCH(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Change ID is required' }, { status: 400 });
    }

    const result = await rollbackChange(id);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Rollback failed' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Change history PATCH rollback error:', error);
    return NextResponse.json({ error: error.message || 'Rollback failed' }, { status: 500 });
  }
}
