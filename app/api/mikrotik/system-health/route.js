import { NextResponse } from 'next/server';
import { getSystemHealth, getDHCPLeases, getRouterLogs, getInterfaces } from '@/lib/mikrotik';

// GET — Aggregated system health, DHCP leases, interfaces, and logs
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const logTopics = searchParams.get('log_topics') || null;

  try {
    // Fetch all data in parallel for efficiency
    const [health, leases, logs, interfaces] = await Promise.allSettled([
      getSystemHealth(),
      getDHCPLeases(),
      getRouterLogs(logTopics),
      getInterfaces(),
    ]);

    return NextResponse.json({
      success: true,
      health: health.status === 'fulfilled' ? health.value : [],
      leases: leases.status === 'fulfilled' ? leases.value : [],
      logs: logs.status === 'fulfilled' ? logs.value : [],
      interfaces: interfaces.status === 'fulfilled' ? interfaces.value : [],
    });
  } catch (error) {
    console.error('System health aggregate error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 502 }
    );
  }
}
