import { NextResponse } from 'next/server.js';
import { setHotspotDnsName, getMikroTikConfig } from '@/lib/mikrotik.js';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';

export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    let dnsName = body.dns_name;
    const wifiSsid = body.wifi_ssid;

    if (!dnsName) {
      const config = await getMikroTikConfig();
      dnsName = config.hotspot_url;
    }

    if (!dnsName) {
      return NextResponse.json({ error: 'Hotspot DNS name/URL is required' }, { status: 400 });
    }

    // 1. Provision to MikroTik router
    const result = await setHotspotDnsName(dnsName);

    // 2. Persist in app_settings (key: 'mikrotik')
    const { data: currentSetting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'mikrotik')
      .maybeSingle();

    const existingValue = currentSetting?.value || {};
    const updatedValue = {
      ...existingValue,
      hotspot_url: dnsName.trim(),
    };
    if (wifiSsid) {
      updatedValue.wifi_ssid = wifiSsid.trim();
    }

    await supabaseAdmin
      .from('app_settings')
      .upsert({
        key: 'mikrotik',
        value: updatedValue,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    return NextResponse.json({
      success: true,
      message: `Hotspot domain "${result.dnsName}" configured on profiles: ${result.updatedProfiles.join(', ')}`,
      result,
    });
  } catch (error) {
    console.error('Sync hotspot error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to provision hotspot domain to router',
    }, { status: 500 });
  }
}
