import { NextResponse } from 'next/server.js';
import { testConnection, getHotspotProfiles } from '@/lib/mikrotik.js';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth.js';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();
  try {
    const result = await testConnection();
    const profiles = await getHotspotProfiles();
    return NextResponse.json({
      connected: true,
      ...result,
      profiles: Array.isArray(profiles) ? profiles.map(p => p.name) : [],
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      error: error.message,
    }, { status: 502 });
  }
}
