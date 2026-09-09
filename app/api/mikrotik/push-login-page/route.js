import { NextResponse } from 'next/server';
import { pushHotspotLoginPageToRouter, generateHotspotLoginHtml, getMikroTikConfig } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

/**
 * GET /api/mikrotik/push-login-page
 * Returns or downloads the generated hotspot login.html template
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const download = searchParams.get('download') === 'true';
    const config = await getMikroTikConfig();

    const wifiSsid = searchParams.get('wifi_ssid') || config.wifi_ssid || 'Asuk Tech Wi-Fi';
    const buyUrl = searchParams.get('buy_url') || 'https://www.asuk.tech/packages';

    const html = generateHotspotLoginHtml({ wifiSsid, buyUrl });

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
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/mikrotik/push-login-page
 * Pushes the updated login.html with www.asuk.tech directly to MikroTik router storage
 * without touching DHCP, firewall NAT, or wireless interfaces!
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const config = await getMikroTikConfig();

    const wifiSsid = body.wifi_ssid || config.wifi_ssid || 'Asuk Tech Wi-Fi';
    const buyUrl = body.buy_url || 'https://www.asuk.tech/packages';

    const result = await pushHotspotLoginPageToRouter({
      wifiSsid,
      buyUrl,
    });

    return NextResponse.json({
      success: true,
      message: 'Hotspot login.html pushed directly to MikroTik router storage with buy link pointing to www.asuk.tech',
      ...result,
    });
  } catch (error) {
    console.error('Push login page error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to push login page to router',
    }, { status: 500 });
  }
}
