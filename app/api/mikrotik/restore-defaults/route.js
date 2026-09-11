import { NextResponse } from 'next/server';
import { restoreDefaultHotspotConfig, getMikroTikConfig } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logChange } from '@/lib/changeHistory';

/**
 * POST /api/mikrotik/restore-defaults
 * 
 * Safely restores MikroTik Hotspot settings and Login Page to factory defaults.
 * 
 * 🔒 ZERO RISK TO CLOUD ACCESS:
 * - /ip cloud (DDNS and Back To Home VPN tunnel) is 100% UNTOUCHED
 * - /ip service (REST API, WWW-SSL, Winbox) is 100% UNTOUCHED
 * - Router administration credentials & SSL certificates are 100% UNTOUCHED
 * - WAN IP addresses and default gateway routing are 100% UNTOUCHED
 * 
 * 🔄 REVERSIBLE ANYTIME:
 * Running "Auto-Setup Router" anytime will cleanly re-apply all customized features.
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const config = await getMikroTikConfig();
    if (!config.isConfigured) {
      return NextResponse.json({
        error: 'MikroTik router is not configured in settings. Please configure router IP and credentials first.',
      }, { status: 400 });
    }

    // Fetch previous portal config for change audit trail
    let beforePortalConfig = {};
    try {
      const { data: portalData } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'portal_template')
        .maybeSingle();
      if (portalData?.value) beforePortalConfig = portalData.value;
    } catch {}

    // Execute targeted safe restore on MikroTik router
    const result = await restoreDefaultHotspotConfig({
      businessName: body.business_name || config.wifi_ssid || 'Internet Hotspot',
      wifiSsid: body.wifi_ssid || config.wifi_ssid || 'Hotspot',
    });

    // Reset portal_template in Supabase to factory-default
    const defaultPortalConfig = {
      templateId: 'factory-default',
      businessName: config.wifi_ssid || 'Internet Hotspot',
      wifiSsid: config.wifi_ssid || 'Hotspot',
      buyUrl: '',
      logoUrl: '',
      contactFooter: '',
      primaryColor: '',
    };

    try {
      await supabaseAdmin
        .from('app_settings')
        .upsert({ key: 'portal_template', value: defaultPortalConfig }, { onConflict: 'key' });
    } catch (dbErr) {
      console.warn('Could not update portal_template in app_settings:', dbErr.message);
    }

    // Record audit trail
    await logChange({
      category: 'router-config',
      action: 'restore-defaults',
      summary: 'Safely restored MikroTik hotspot & login page to factory defaults (Cloud access preserved)',
      beforeState: beforePortalConfig,
      afterState: defaultPortalConfig,
      metadata: {
        protected: result.protectedItems,
        results: result.results,
        restoredAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
      portalConfig: defaultPortalConfig,
    });
  } catch (error) {
    console.error('Safe restore defaults error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to safely restore default hotspot configuration',
    }, { status: 500 });
  }
}
