import { NextResponse } from 'next/server';
import { getWalledGardenEntries, addWalledGardenEntry, removeWalledGardenEntry } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { logChange } from '@/lib/changeHistory';

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

    const cleanHost = dst_host.trim();
    const lowerHost = cleanHost.toLowerCase();

    // Prevent adding the router's own hotspot domain or internal IP
    if (lowerHost.includes('asuktech.net') || lowerHost.includes('10.5.50.')) {
      return NextResponse.json({
        error: 'Cannot add hotspot portal domain or internal router IP to Walled Garden. Doing so bypasses captive portal interception and causes HttpProxy Gateway Timeout loops.',
      }, { status: 400 });
    }

    const fullComment = category ? `[${category}] ${comment}`.trim() : comment;

    const result = await addWalledGardenEntry({
      dstHost: cleanHost,
      action: 'allow',
      comment: fullComment,
    });


    // Log to change history
    await logChange({
      category: 'walled-garden',
      action: 'add',
      summary: `Added "${cleanHost}" to walled garden bypass`,
      beforeState: {},
      afterState: { dst_host: cleanHost, comment: fullComment, category },
      metadata: { dst_host: cleanHost, comment: fullComment, category },
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
 * Body: { id, source?, dst_host?, comment? }
 */
export async function DELETE(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { id, source, dst_host, comment } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    await removeWalledGardenEntry(id, source);

    // Log to change history
    const targetLabel = dst_host || id;
    await logChange({
      category: 'walled-garden',
      action: 'remove',
      summary: `Removed "${targetLabel}" from walled garden bypass`,
      beforeState: { id, dst_host, comment, source },
      afterState: {},
      metadata: { id, dst_host, comment, source },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Walled garden remove error:', error.message);
    return NextResponse.json(
      { error: 'Failed to remove walled garden entry', details: error.message },
      { status: 502 }
    );
  }
}

