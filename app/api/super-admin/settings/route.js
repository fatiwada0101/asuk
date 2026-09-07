import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse, invalidateAdminCredsCache } from '@/lib/admin-auth';
import { sanitizeMikroTikConfig } from '@/lib/mikrotik';

// GET — fetch all settings
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('*');

    if (error) throw error;

    // Convert array of {key, value} to a single object
    const settings = {};
    (data || []).forEach((row) => {
      settings[row.key] = row.value;
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// POST — update a single setting by key
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { key, value } = await request.json();

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });
    }

    let finalValue = value;
    if (key === 'mikrotik' && typeof value === 'object' && value !== null) {
      finalValue = sanitizeMikroTikConfig(value);
    }

    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({
        key,
        value: finalValue,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) throw error;

    if (key === 'super_admin') {
      invalidateAdminCredsCache();
    }

    return NextResponse.json({ success: true, key });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
