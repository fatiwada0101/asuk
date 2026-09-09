import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse, invalidateAdminCredsCache } from '@/lib/admin-auth';
import { sanitizeMikroTikConfig } from '@/lib/mikrotik';
import { logChange } from '@/lib/changeHistory';

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

    // Capture beforeState for audit logging if relevant category
    const categoryMap = {
      mikrotik: 'mikrotik-config',
      branding: 'branding',
      flutterwave: 'payment-gateway',
      portal_template: 'login-design',
    };

    let beforeState = {};
    if (categoryMap[key]) {
      try {
        const { data: existing } = await supabaseAdmin
          .from('app_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();
        if (existing?.value) beforeState = existing.value;
      } catch {}
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

    // Record change history if in categoryMap
    if (categoryMap[key]) {
      let summary = `Updated ${key} configuration`;
      if (key === 'mikrotik') {
        summary = `Updated MikroTik connection (${finalValue?.host || 'N/A'}, SSID: ${finalValue?.wifi_ssid || 'N/A'})`;
      } else if (key === 'branding') {
        summary = `Updated branding (${finalValue?.app_name || 'App Name'})`;
      } else if (key === 'flutterwave') {
        summary = `Updated Flutterwave payment gateway (${finalValue?.currency || 'NGN'})`;
      } else if (key === 'portal_template') {
        summary = `Updated portal template: ${finalValue?.templateId || 'default'}`;
      }

      await logChange({
        category: categoryMap[key],
        action: 'update',
        summary,
        beforeState,
        afterState: finalValue,
        metadata: { key },
      });
    }

    return NextResponse.json({ success: true, key });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

