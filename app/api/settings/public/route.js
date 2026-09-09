import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { checkMikroTikHealth, isMikroTikConfigured } from '@/lib/mikrotik.js';

export async function GET() {
  try {
    // Fetch settings and check router & fallback status concurrently
    const [settingsRes, healthRes, fallbackRes, configuredRes] = await Promise.allSettled([
      supabaseAdmin
        .from('app_settings')
        .select('key, value')
        .in('key', ['flutterwave', 'branding', 'mikrotik']),
      checkMikroTikHealth(2500),
      supabaseAdmin
        .from('fallback_vouchers')
        .select('profile_name, plan_id')
        .eq('is_used', false)
        .or('status.is.null,status.eq.available'),
      isMikroTikConfigured(),
    ]);

    const settings = settingsRes.status === 'fulfilled' && settingsRes.value.data ? settingsRes.value.data : [];
    const mikrotikOnline = healthRes.status === 'fulfilled' ? !!healthRes.value : false;
    const mikrotikConfigured = configuredRes.status === 'fulfilled' ? !!configuredRes.value : false;
    const fallbackRows = fallbackRes.status === 'fulfilled' && fallbackRes.value.data ? fallbackRes.value.data : [];

    const fallbackCounts = {};
    for (const row of fallbackRows) {
      if (row.profile_name) {
        fallbackCounts[row.profile_name] = (fallbackCounts[row.profile_name] || 0) + 1;
      }
      if (row.plan_id) {
        fallbackCounts[row.plan_id] = (fallbackCounts[row.plan_id] || 0) + 1;
      }
    }
    const hasFallbackVouchers = fallbackRows.length > 0;

    let flwPublicKey = process.env.FLUTTERWAVE_PUBLIC_KEY || '';
    let flwEnabled = false;
    let branding = {
      app_name: 'Asuk Tech',
      logo_url: '',
      theme: 'violet',
      app_url: process.env.NEXT_PUBLIC_APP_URL || '',
    };

    let hotspotUrl = '';
    let wifiSsid = 'Asuk Tech Wi-Fi';

    if (settings) {
      for (const s of settings) {
        if (s.key === 'flutterwave' && s.value) {
          if (s.value.public_key) flwPublicKey = s.value.public_key;
          flwEnabled = !!s.value.enabled;
        }
        if (s.key === 'branding' && s.value) {
          branding = {
            app_name: s.value.app_name || branding.app_name,
            logo_url: s.value.logo_url || branding.logo_url,
            theme: s.value.theme || branding.theme,
            app_url: s.value.app_url || process.env.NEXT_PUBLIC_APP_URL || '',
          };
        }
        if (s.key === 'mikrotik' && s.value) {
          if (s.value.hotspot_url) hotspotUrl = s.value.hotspot_url.trim();
          if (s.value.wifi_ssid) wifiSsid = s.value.wifi_ssid.trim();
        }
      }
    }

    return NextResponse.json({
      flutterwave: {
        publicKey: flwPublicKey,
        enabled: flwEnabled,
      },
      branding,
      mikrotik: {
        configured: mikrotikConfigured,
        online: mikrotikOnline,
        has_fallback_vouchers: hasFallbackVouchers,
        fallback_counts: fallbackCounts,
        hotspot_url: hotspotUrl,
        wifi_ssid: wifiSsid,
      },
    });
  } catch (error) {
    return NextResponse.json({
      flutterwave: { publicKey: '', enabled: false },
      branding: { app_name: 'Asuk Tech', logo_url: '', theme: 'violet' },
      mikrotik: {
        configured: false,
        online: false,
        has_fallback_vouchers: false,
        fallback_counts: {},
        hotspot_url: 'asuktech.net',
        wifi_ssid: 'Asuk Tech Wi-Fi',
      },
    });
  }
}
