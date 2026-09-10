import { NextResponse } from 'next/server';
import { rebootRouter } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { logChange } from '@/lib/changeHistory';

/**
 * POST /api/mikrotik/reboot
 * Reboots the MikroTik router via RouterOS REST API
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const result = await rebootRouter();

    // Log the reboot action to change history
    try {
      await logChange({
        category: 'mikrotik',
        action: 'reboot',
        summary: 'Initiated MikroTik router restart via REST API',
        beforeState: {},
        afterState: { rebooted_at: new Date().toISOString() },
      });
    } catch (logErr) {
      console.warn('Could not log router reboot to change history:', logErr.message);
    }

    return NextResponse.json({
      success: true,
      message: result.message || 'MikroTik router is rebooting now.',
    });
  } catch (error) {
    console.error('MikroTik reboot error:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to reboot router',
      },
      { status: 502 }
    );
  }
}
