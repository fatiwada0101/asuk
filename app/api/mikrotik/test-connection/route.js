import { NextResponse } from 'next/server.js';
import { testConnection, getHotspotProfiles } from '@/lib/mikrotik.js';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth.js';

export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();
  try {
    const result = await testConnection();
    let profiles = [];
    if (result.connected) {
      try {
        const pList = await getHotspotProfiles();
        profiles = Array.isArray(pList) ? pList.map(p => p.name) : [];
      } catch (e) {
        console.warn('Could not fetch profiles during test-connection:', e.message);
      }
    }
    return NextResponse.json({
      ...result,
      profiles: result.profiles || profiles,
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      success: false,
      error: error.message,
    });
  }
}
