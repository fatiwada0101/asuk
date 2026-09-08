import { NextResponse } from 'next/server';
import { getWalledGardenEntries, addWalledGardenEntry, removeWalledGardenEntry } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

/**
 * GET — List all walled garden entries from the MikroTik router
 */
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const entries = await getWalledGardenEntries();
    return NextResponse.json({ success: true, entries });
  } catch (error) {
    console.error('Walled garden list error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch walled garden entries', details: error.message },
      { status: 502 }
    );
  }
}

/**
 * POST — Add a new domain to the walled garden bypass list
 * Body: { dst_host, comment?, category? }
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { dst_host, comment = '', category = 'custom' } = await request.json();

    if (!dst_host || typeof dst_host !== 'string' || !dst_host.trim()) {
      return NextResponse.json({ error: 'dst_host is required' }, { status: 400 });
    }

    const fullComment = category ? `[${category}] ${comment}`.trim() : comment;

    const result = await addWalledGardenEntry({
      dstHost: dst_host.trim(),
      action: 'allow',
      comment: fullComment,
    });

    return NextResponse.json({ success: true, entry: result });
  } catch (error) {
    console.error('Walled garden add error:', error.message);
    return NextResponse.json(
      { error: 'Failed to add walled garden entry', details: error.message },
      { status: 502 }
    );
  }
}

/**
 * DELETE — Remove a walled garden entry by MikroTik ID
 * Body: { id }
 */
export async function DELETE(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { id, source } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    await removeWalledGardenEntry(id, source);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Walled garden remove error:', error.message);
    return NextResponse.json(
      { error: 'Failed to remove walled garden entry', details: error.message },
      { status: 502 }
    );
  }
}
