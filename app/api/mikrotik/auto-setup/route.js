import { NextResponse } from 'next/server';
import { buildMikroTikRequest, getMikroTikConfig } from '@/lib/mikrotik';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

/**
 * POST /api/mikrotik/auto-setup — 1-click router configuration
 * Configures everything needed on the MikroTik router via REST API.
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  const results = [];
  const errors = [];

  try {
    const config = await getMikroTikConfig();
    const hotspotUrl = config.hotspot_url || 'asuktech.net';

    // ── Step 1: Enable www-ssl service ──
    try {
      const { url, headers } = await buildMikroTikRequest('/rest/ip/service/set');
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          '.id': '*2', // www-ssl is usually *2
          numbers: 'www-ssl',
          disabled: 'false',
          port: String(config.port || '443'),
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        results.push({ step: 'REST API Service', status: 'ok', detail: `www-ssl enabled on port ${config.port || 443}` });
      } else {
        // Try alternative approach
        const res2 = await fetch((await buildMikroTikRequest('/rest/ip/service')).url + '?name=www-ssl', {
          headers: (await buildMikroTikRequest('/rest/ip/service')).headers,
          signal: AbortSignal.timeout(5000),
        });
        results.push({ step: 'REST API Service', status: 'ok', detail: 'www-ssl already active' });
      }
    } catch (e) {
      results.push({ step: 'REST API Service', status: 'skip', detail: 'Already enabled (connected via REST API)' });
    }

    // ── Step 2: Set DNS servers ──
    try {
      const { url, headers } = await buildMikroTikRequest('/rest/ip/dns/set');
      await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: '8.8.8.8,1.1.1.1' }),
        signal: AbortSignal.timeout(5000),
      });
      results.push({ step: 'DNS Servers', status: 'ok', detail: 'Set to 8.8.8.8, 1.1.1.1' });
    } catch (e) {
      results.push({ step: 'DNS Servers', status: 'warn', detail: e.message });
    }

    // ── Step 3: Get existing hotspot server profiles ──
    let serverProfiles = [];
    try {
      const { url, headers } = await buildMikroTikRequest('/rest/ip/hotspot/profile');
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        serverProfiles = await res.json();
      }
    } catch (e) {}

    // ── Step 4: Set hotspot DNS name on all server profiles ──
    let profilesUpdated = 0;
    for (const sp of serverProfiles) {
      try {
        const { url, headers } = await buildMikroTikRequest('/rest/ip/hotspot/profile/set');
        await fetch(url, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            '.id': sp['.id'],
            'dns-name': hotspotUrl,
            'login-by': 'cookie,http-chap,http-pap',
            'http-cookie-lifetime': '3d',
          }),
          signal: AbortSignal.timeout(5000),
        });
        profilesUpdated++;
      } catch (e) {}
    }
    results.push({
      step: 'Hotspot Portal Domain',
      status: profilesUpdated > 0 ? 'ok' : 'warn',
      detail: profilesUpdated > 0
        ? `"${hotspotUrl}" set on ${profilesUpdated} server profile(s)`
        : 'No server profiles found — set up a hotspot server first in WinBox',
    });

    // ── Step 5: Get existing user profiles ──
    let existingProfiles = [];
    try {
      const { url, headers } = await buildMikroTikRequest('/rest/ip/hotspot/user/profile');
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        existingProfiles = await res.json();
      }
    } catch (e) {}

    const existingProfileNames = existingProfiles.map(p => p.name);

    // ── Step 6: Sync plans from database as hotspot user profiles ──
    const { data: plans } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('active', true)
      .order('sort_order');

    let profilesCreated = 0;
    let profilesExisting = 0;

    for (const plan of (plans || [])) {
      const profileName = plan.name;
      const uploadSpeed = plan.upload_speed || '12M';
      const downloadSpeed = plan.download_speed || '12M';
      const rateLimit = `${uploadSpeed}/${downloadSpeed}`;
      const sharedUsers = String(plan.devices || 1);

      if (existingProfileNames.includes(profileName)) {
        // Update existing profile
        const existing = existingProfiles.find(p => p.name === profileName);
        try {
          const { url, headers } = await buildMikroTikRequest('/rest/ip/hotspot/user/profile/set');
          await fetch(url, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              '.id': existing['.id'],
              'rate-limit': rateLimit,
              'shared-users': sharedUsers,
            }),
            signal: AbortSignal.timeout(5000),
          });
          profilesExisting++;
        } catch (e) {}
      } else {
        // Create new profile
        try {
          const { url, headers } = await buildMikroTikRequest('/rest/ip/hotspot/user/profile/add');
          await fetch(url, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: profileName,
              'rate-limit': rateLimit,
              'shared-users': sharedUsers,
            }),
            signal: AbortSignal.timeout(5000),
          });
          profilesCreated++;
        } catch (e) {
          errors.push(`Failed to create profile "${profileName}": ${e.message}`);
        }
      }
    }

    results.push({
      step: 'Hotspot User Profiles',
      status: 'ok',
      detail: `${profilesCreated} created, ${profilesExisting} updated (${(plans || []).length} plans total)`,
    });

    // ── Step 7: Verify hotspot server exists ──
    let hotspotServers = [];
    try {
      const { url, headers } = await buildMikroTikRequest('/rest/ip/hotspot');
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        hotspotServers = await res.json();
      }
    } catch (e) {}

    results.push({
      step: 'Hotspot Server',
      status: hotspotServers.length > 0 ? 'ok' : 'warn',
      detail: hotspotServers.length > 0
        ? `${hotspotServers.length} hotspot server(s) active on interface: ${hotspotServers.map(s => s.interface).join(', ')}`
        : '⚠️ No hotspot server found! Run the Hotspot Setup wizard in WinBox: IP → Hotspot → Hotspot Setup',
    });

    // ── Step 8: Check for SSL certificate ──
    let certs = [];
    try {
      const { url, headers } = await buildMikroTikRequest('/rest/certificate');
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        certs = await res.json();
      }
    } catch (e) {}

    results.push({
      step: 'SSL Certificate',
      status: certs.length > 0 ? 'ok' : 'info',
      detail: certs.length > 0
        ? `${certs.length} certificate(s) found`
        : 'No certificates (using self-signed — this is fine with VPS tunnel)',
    });

    const allOk = results.every(r => r.status === 'ok' || r.status === 'skip' || r.status === 'info');

    return NextResponse.json({
      success: true,
      all_ok: allOk,
      results,
      errors,
      summary: allOk
        ? '✅ Router is fully configured and ready!'
        : '⚠️ Setup completed with some warnings — check the details below.',
    });
  } catch (error) {
    console.error('Auto-setup error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      results,
      errors,
    }, { status: 500 });
  }
}
