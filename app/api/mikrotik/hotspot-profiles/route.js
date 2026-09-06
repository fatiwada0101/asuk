import { NextResponse } from 'next/server';
import {
  getHotspotProfiles,
  createHotspotProfile,
  updateHotspotProfile,
  deleteHotspotProfile,
} from '@/lib/mikrotik';

// GET — List all hotspot user profiles
export async function GET() {
  try {
    const profiles = await getHotspotProfiles();
    return NextResponse.json({ success: true, profiles });
  } catch (error) {
    console.error('Hotspot profiles fetch error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message, profiles: [] },
      { status: 502 }
    );
  }
}

// PUT — Create a new hotspot user profile
export async function PUT(request) {
  try {
    const profileData = await request.json();

    if (!profileData.name) {
      return NextResponse.json({ error: 'Profile name is required' }, { status: 400 });
    }

    // Build the RouterOS profile object
    const routerProfile = {
      name: profileData.name,
    };

    if (profileData['rate-limit']) routerProfile['rate-limit'] = profileData['rate-limit'];
    if (profileData['shared-users']) routerProfile['shared-users'] = String(profileData['shared-users']);
    if (profileData['session-timeout']) routerProfile['session-timeout'] = profileData['session-timeout'];
    if (profileData['idle-timeout']) routerProfile['idle-timeout'] = profileData['idle-timeout'];
    if (profileData['keepalive-timeout']) routerProfile['keepalive-timeout'] = profileData['keepalive-timeout'];

    const result = await createHotspotProfile(routerProfile);
    return NextResponse.json({ success: true, profile: result });
  } catch (error) {
    console.error('Create profile error:', error.message);
    return NextResponse.json(
      { error: 'Failed to create profile', details: error.message },
      { status: 502 }
    );
  }
}

// PATCH — Update an existing profile
export async function PATCH(request) {
  try {
    const { profile_id, ...updateData } = await request.json();
    if (!profile_id) {
      return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 });
    }

    // Build clean update object
    const cleanData = {};
    if (updateData['rate-limit'] !== undefined) cleanData['rate-limit'] = updateData['rate-limit'];
    if (updateData['shared-users'] !== undefined) cleanData['shared-users'] = String(updateData['shared-users']);
    if (updateData['session-timeout'] !== undefined) cleanData['session-timeout'] = updateData['session-timeout'];
    if (updateData['idle-timeout'] !== undefined) cleanData['idle-timeout'] = updateData['idle-timeout'];
    if (updateData['keepalive-timeout'] !== undefined) cleanData['keepalive-timeout'] = updateData['keepalive-timeout'];

    const result = await updateHotspotProfile(profile_id, cleanData);
    return NextResponse.json({ success: true, profile: result });
  } catch (error) {
    console.error('Update profile error:', error.message);
    return NextResponse.json(
      { error: 'Failed to update profile', details: error.message },
      { status: 502 }
    );
  }
}

// DELETE — Remove a hotspot user profile
export async function DELETE(request) {
  try {
    const { profile_id } = await request.json();
    if (!profile_id) {
      return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 });
    }

    await deleteHotspotProfile(profile_id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete profile error:', error.message);
    return NextResponse.json(
      { error: 'Failed to delete profile', details: error.message },
      { status: 502 }
    );
  }
}
