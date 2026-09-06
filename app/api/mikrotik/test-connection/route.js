import { NextResponse } from 'next/server';
import { testConnection, getHotspotProfiles } from '@/lib/mikrotik';

export async function GET() {
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
