import { NextResponse } from 'next/server';
import { pushHotspotLoginPageToRouter, generateHotspotLoginHtml, getMikroTikConfig } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logChange } from '@/lib/changeHistory';

/**
 * GET /api/mikrotik/push-login-page
 * Returns or downloads the generated hotspot login.html template.
 * Supports templateId, logoUrl, businessName, contactFooter, primaryColor.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const download = searchParams.get('download') === 'true';
    const config = await getMikroTikConfig();

    // Load saved portal config and branding from app_settings
    let savedConfig = {};
    let savedBranding = {};
    try {
      const { data } = await supabaseAdmin
        .from('app_settings')
        .select('key, value')
        .in('key', ['portal_template', 'branding']);
      (data || []).forEach(r => {
        if (r.key === 'portal_template') savedConfig = r.value || {};
        if (r.key === 'branding') savedBranding = r.value || {};
      });
    } catch {}

    const defaultBuyUrl = savedConfig.buyUrl
      || (savedBranding.app_url ? `${savedBranding.app_url.replace(/\/+$/, '')}/packages` : '')
      || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/packages` : '')
      || 'https://www.asuk.tech/packages';

    const defaultName = savedConfig.businessName || savedBranding.app_name || config.wifi_ssid || 'Asuk Tech Wi-Fi';
    const defaultLogo = savedConfig.logoUrl || savedBranding.logo_url || '';

    const templateId = searchParams.get('template_id') || savedConfig.templateId || 'midnight-glass';
    const wifiSsid = searchParams.get('wifi_ssid') || savedConfig.wifiSsid || config.wifi_ssid || 'Asuk Tech Wi-Fi';
    const buyUrl = searchParams.get('buy_url') || defaultBuyUrl;
    const logoUrl = searchParams.get('logo_url') !== null && searchParams.get('logo_url') !== undefined ? searchParams.get('logo_url') : defaultLogo;
    const businessName = searchParams.get('business_name') || defaultName;
    const contactFooter = searchParams.get('contact_footer') || savedConfig.contactFooter || '';
    const primaryColor = searchParams.get('primary_color') || savedConfig.primaryColor || '';

    const html = generateHotspotLoginHtml({
      templateId, wifiSsid, buyUrl, logoUrl, businessName, contactFooter, primaryColor,
    });

    if (download) {
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'attachment; filename="login.html"',
        },
      });
    }

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/mikrotik/push-login-page
 * Pushes the selected login template to MikroTik router storage.
 * Also persists the portal template config to app_settings.
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const config = await getMikroTikConfig();

    // Fetch existing portal config and branding before updating (for rollback & defaults)
    let beforeConfig = {};
    let savedBranding = {};
    try {
      const { data } = await supabaseAdmin
        .from('app_settings')
        .select('key, value')
        .in('key', ['portal_template', 'branding']);
      (data || []).forEach(r => {
        if (r.key === 'portal_template') beforeConfig = r.value || {};
        if (r.key === 'branding') savedBranding = r.value || {};
      });
    } catch {}

    const defaultBuyUrl = (savedBranding.app_url ? `${savedBranding.app_url.replace(/\/+$/, '')}/packages` : '')
      || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/packages` : '')
      || 'https://www.asuk.tech/packages';

    const templateId = body.template_id || beforeConfig.templateId || 'midnight-glass';
    const wifiSsid = body.wifi_ssid || beforeConfig.wifiSsid || config.wifi_ssid || 'Asuk Tech Wi-Fi';
    const buyUrl = body.buy_url || beforeConfig.buyUrl || defaultBuyUrl;
    const logoUrl = body.logo_url !== undefined ? body.logo_url : (beforeConfig.logoUrl || savedBranding.logo_url || '');
    const businessName = body.business_name || beforeConfig.businessName || savedBranding.app_name || wifiSsid;
    const contactFooter = body.contact_footer !== undefined ? body.contact_footer : (beforeConfig.contactFooter || '');
    const primaryColor = body.primary_color || beforeConfig.primaryColor || '';

    // Save the portal config for persistence
    const portalConfig = { templateId, wifiSsid, buyUrl, logoUrl, businessName, contactFooter, primaryColor };
    try {
      await supabaseAdmin
        .from('app_settings')
        .upsert({ key: 'portal_template', value: portalConfig }, { onConflict: 'key' });
    } catch {}

    const result = await pushHotspotLoginPageToRouter({
      templateId, wifiSsid, buyUrl, logoUrl, businessName, contactFooter, primaryColor,
    });


    // Record change history
    await logChange({
      category: 'login-design',
      action: 'push',
      summary: `Pushed "${templateId}" template to router (${businessName || wifiSsid})`,
      beforeState: beforeConfig,
      afterState: portalConfig,
      metadata: { templateId, wifiSsid, buyUrl, businessName, primaryColor },
    });

    return NextResponse.json({
      success: true,
      message: `Login template "${templateId}" pushed to MikroTik router`,
      templateId,
      ...result,
    });
  } catch (error) {
    console.error('Push login page error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to push login page to router',
    }, { status: 500 });
  }
}

