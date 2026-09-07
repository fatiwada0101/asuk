import { NextResponse } from 'next/server';
import { buildMikroTikRequest, getMikroTikConfig } from '@/lib/mikrotik';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

/** Helper: make a MikroTik REST API call */
async function mikrotikCall(endpoint, method = 'GET', body = null) {
  const { url, headers } = await buildMikroTikRequest(endpoint);
  const opts = { method, headers: { ...headers }, signal: AbortSignal.timeout(8000) };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (method === 'GET' && res.ok) return await res.json();
  return res;
}

/**
 * POST /api/mikrotik/auto-setup — Full 1-click router configuration
 * Sets up WiFi, hotspot server, profiles, DNS, firewall — everything.
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  const results = [];

  try {
    const config = await getMikroTikConfig();
    const hotspotUrl = config.hotspot_url || 'asuktech.net';
    const wifiSsid = config.wifi_ssid || 'Asuk Tech Wi-Fi';

    // Get hotspot settings
    const { data: hsData } = await supabaseAdmin
      .from('app_settings').select('value').eq('key', 'hotspot_settings').maybeSingle();
    const hsSettings = hsData?.value || {};

    // ═══ Step 1: Set DNS servers ═══
    try {
      await mikrotikCall('/rest/ip/dns/set', 'POST', { servers: '8.8.8.8,1.1.1.1' });
      results.push({ step: 'DNS Servers', status: 'ok', detail: 'Set to 8.8.8.8, 1.1.1.1' });
    } catch (e) {
      results.push({ step: 'DNS Servers', status: 'warn', detail: e.message });
    }

    // ═══ Step 2: Configure WiFi SSID ═══
    try {
      // Try RouterOS v7 new WiFi first (/interface/wifi)
      let wifiInterfaces = [];
      try {
        wifiInterfaces = await mikrotikCall('/rest/interface/wifi');
      } catch {}

      if (wifiInterfaces && wifiInterfaces.length > 0) {
        // New WiFi (RouterOS v7.13+)
        for (const iface of wifiInterfaces) {
          try {
            await mikrotikCall('/rest/interface/wifi/set', 'POST', {
              '.id': iface['.id'],
              'configuration.ssid': wifiSsid,
            });
          } catch {}
        }
        results.push({ step: 'WiFi SSID', status: 'ok', detail: `"${wifiSsid}" set on ${wifiInterfaces.length} WiFi interface(s) (new WiFi)` });
      } else {
        // Try legacy wireless (/interface/wireless)
        let wirelessInterfaces = [];
        try {
          wirelessInterfaces = await mikrotikCall('/rest/interface/wireless');
        } catch {}

        if (wirelessInterfaces && wirelessInterfaces.length > 0) {
          for (const iface of wirelessInterfaces) {
            try {
              await mikrotikCall('/rest/interface/wireless/set', 'POST', {
                '.id': iface['.id'],
                ssid: wifiSsid,
              });
            } catch {}
          }
          results.push({ step: 'WiFi SSID', status: 'ok', detail: `"${wifiSsid}" set on ${wirelessInterfaces.length} wireless interface(s)` });
        } else {
          results.push({ step: 'WiFi SSID', status: 'info', detail: 'No WiFi interfaces found — set SSID manually in WinBox if using CAPsMAN' });
        }
      }
    } catch (e) {
      results.push({ step: 'WiFi SSID', status: 'warn', detail: 'Could not auto-detect WiFi interface: ' + e.message });
    }

    // ═══ Step 3: Ensure hotspot server profile exists with DNS name ═══
    let serverProfiles = [];
    try {
      serverProfiles = await mikrotikCall('/rest/ip/hotspot/profile') || [];
    } catch {}

    let profilesUpdated = 0;
    if (serverProfiles.length > 0) {
      for (const sp of serverProfiles) {
        try {
          await mikrotikCall('/rest/ip/hotspot/profile/set', 'POST', {
            '.id': sp['.id'],
            'dns-name': hotspotUrl,
            'login-by': 'cookie,http-chap,http-pap',
            'http-cookie-lifetime': '3d',
          });
          profilesUpdated++;
        } catch {}
      }
      results.push({ step: 'Hotspot Portal Domain', status: 'ok', detail: `"${hotspotUrl}" set on ${profilesUpdated} server profile(s)` });
    } else {
      // Create a new server profile
      try {
        await mikrotikCall('/rest/ip/hotspot/profile/add', 'POST', {
          name: 'asuk-profile',
          'dns-name': hotspotUrl,
          'login-by': 'cookie,http-chap,http-pap',
          'http-cookie-lifetime': '3d',
          'hotspot-address': '10.5.50.1',
        });
        results.push({ step: 'Hotspot Portal Domain', status: 'ok', detail: `Created server profile "asuk-profile" with domain "${hotspotUrl}"` });
      } catch (e) {
        results.push({ step: 'Hotspot Portal Domain', status: 'warn', detail: 'Failed to create server profile: ' + e.message });
      }
    }

    // ═══ Step 4: Check/Create hotspot server ═══
    let hotspotServers = [];
    try {
      hotspotServers = await mikrotikCall('/rest/ip/hotspot') || [];
    } catch {}

    if (hotspotServers.length > 0) {
      results.push({
        step: 'Hotspot Server',
        status: 'ok',
        detail: `${hotspotServers.length} server(s) active — interface: ${hotspotServers.map(s => s.interface || 'unknown').join(', ')}`,
      });
    } else {
      // Try to auto-create a hotspot server
      // First find the bridge interface
      let bridges = [];
      try {
        bridges = await mikrotikCall('/rest/interface/bridge') || [];
      } catch {}
      const bridgeName = bridges.length > 0 ? bridges[0].name : 'bridge1';

      // Check if IP pool exists
      let pools = [];
      try {
        pools = await mikrotikCall('/rest/ip/pool') || [];
      } catch {}

      const poolName = 'hs-pool-1';
      if (!pools.find(p => p.name === poolName)) {
        try {
          await mikrotikCall('/rest/ip/pool/add', 'POST', {
            name: poolName,
            ranges: '10.5.50.2-10.5.50.254',
          });
        } catch {}
      }

      // Add IP address to bridge for hotspot
      try {
        const addrs = await mikrotikCall('/rest/ip/address') || [];
        if (!addrs.find(a => a.address && a.address.startsWith('10.5.50.'))) {
          await mikrotikCall('/rest/ip/address/add', 'POST', {
            address: '10.5.50.1/24',
            interface: bridgeName,
          });
        }
      } catch {}

      // Check/create DHCP server
      let dhcpServers = [];
      try {
        dhcpServers = await mikrotikCall('/rest/ip/dhcp-server') || [];
      } catch {}

      if (!dhcpServers.find(d => d.name === 'dhcp-hs')) {
        try {
          await mikrotikCall('/rest/ip/dhcp-server/add', 'POST', {
            name: 'dhcp-hs',
            interface: bridgeName,
            'address-pool': poolName,
            disabled: 'no',
          });
        } catch {}

        // Add DHCP network
        try {
          await mikrotikCall('/rest/ip/dhcp-server/network/add', 'POST', {
            address: '10.5.50.0/24',
            gateway: '10.5.50.1',
            'dns-server': '10.5.50.1',
          });
        } catch {}
      }

      // Get updated server profiles for the hotspot server
      let updatedProfiles = [];
      try {
        updatedProfiles = await mikrotikCall('/rest/ip/hotspot/profile') || [];
      } catch {}
      const profileToUse = updatedProfiles.find(p => p.name === 'asuk-profile') || updatedProfiles[0];

      // Create hotspot server
      try {
        await mikrotikCall('/rest/ip/hotspot/add', 'POST', {
          name: 'hotspot1',
          interface: bridgeName,
          'address-pool': poolName,
          profile: profileToUse?.name || 'default',
          disabled: 'no',
        });
        results.push({ step: 'Hotspot Server', status: 'ok', detail: `Created hotspot server on ${bridgeName} with pool ${poolName}` });
      } catch (e) {
        results.push({ step: 'Hotspot Server', status: 'warn', detail: 'Could not auto-create hotspot: ' + e.message + '. Use WinBox → IP → Hotspot → Hotspot Setup wizard instead.' });
      }
    }

    // ═══ Step 5: Sync user profiles from plans ═══
    let existingProfiles = [];
    try {
      existingProfiles = await mikrotikCall('/rest/ip/hotspot/user/profile') || [];
    } catch {}
    const existingNames = existingProfiles.map(p => p.name);

    const { data: plans } = await supabaseAdmin
      .from('plans').select('*').eq('active', true).order('sort_order');

    let created = 0, updated = 0;
    for (const plan of (plans || [])) {
      const uploadSpeed = plan.upload_speed || hsSettings.default_upload_speed || '12M';
      const downloadSpeed = plan.download_speed || hsSettings.default_download_speed || '12M';
      const rateLimit = `${uploadSpeed}/${downloadSpeed}`;
      const sharedUsers = String(hsSettings.sharing_enabled ? (plan.devices || hsSettings.default_devices || 1) : 1);

      if (existingNames.includes(plan.name)) {
        const existing = existingProfiles.find(p => p.name === plan.name);
        try {
          await mikrotikCall('/rest/ip/hotspot/user/profile/set', 'POST', {
            '.id': existing['.id'],
            'rate-limit': rateLimit,
            'shared-users': sharedUsers,
          });
          updated++;
        } catch {}
      } else {
        try {
          await mikrotikCall('/rest/ip/hotspot/user/profile/add', 'POST', {
            name: plan.name,
            'rate-limit': rateLimit,
            'shared-users': sharedUsers,
          });
          created++;
        } catch {}
      }
    }
    results.push({
      step: 'Hotspot User Profiles',
      status: 'ok',
      detail: `${created} created, ${updated} updated from ${(plans || []).length} active plans`,
    });

    // ═══ Step 6: Add firewall rule for REST API port ═══
    try {
      const filters = await mikrotikCall('/rest/ip/firewall/filter') || [];
      const hasRule = filters.some(f => f.comment && f.comment.includes('Asuk Tech REST API'));
      if (!hasRule) {
        await mikrotikCall('/rest/ip/firewall/filter/add', 'POST', {
          chain: 'input',
          protocol: 'tcp',
          'dst-port': String(config.port || '443'),
          action: 'accept',
          comment: 'Asuk Tech REST API',
          'place-before': '0',
        });
        results.push({ step: 'Firewall Rule', status: 'ok', detail: `Port ${config.port || 443} allowed in firewall` });
      } else {
        results.push({ step: 'Firewall Rule', status: 'ok', detail: 'Rule already exists' });
      }
    } catch (e) {
      results.push({ step: 'Firewall Rule', status: 'info', detail: 'Could not add firewall rule (may already exist)' });
    }

    // ═══ Step 7: Check SSL certificate ═══
    try {
      const certs = await mikrotikCall('/rest/certificate') || [];
      results.push({
        step: 'SSL Certificate',
        status: certs.length > 0 ? 'ok' : 'info',
        detail: certs.length > 0 ? `${certs.length} certificate(s) found` : 'No certificates (fine with VPS tunnel)',
      });
    } catch {
      results.push({ step: 'SSL Certificate', status: 'info', detail: 'Could not check certificates' });
    }

    const allOk = results.every(r => r.status === 'ok' || r.status === 'skip' || r.status === 'info');

    return NextResponse.json({
      success: true,
      all_ok: allOk,
      results,
      summary: allOk
        ? '✅ Router fully configured! WiFi, hotspot, and profiles are ready.'
        : '⚠️ Setup done with some warnings — review details below.',
    });
  } catch (error) {
    console.error('Auto-setup error:', error);
    return NextResponse.json({ success: false, error: error.message, results }, { status: 500 });
  }
}
