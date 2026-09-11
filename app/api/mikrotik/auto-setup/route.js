import { NextResponse } from 'next/server';
import {
  buildMikroTikRequest,
  getMikroTikConfig,
  generateHotspotLoginHtml,
  pushHotspotLoginPageToRouter,
  detectHotspotDirectory,
} from '@/lib/mikrotik';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { logChange } from '@/lib/changeHistory';

/** Helper: make a MikroTik REST API call */
async function mikrotikCall(endpoint, method = 'GET', body = null, timeoutMs = 15000) {
  const { url, headers } = await buildMikroTikRequest(endpoint);
  const opts = { method, headers: { ...headers }, signal: AbortSignal.timeout(timeoutMs) };
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
    const body = await request.json().catch(() => ({}));
    const config = await getMikroTikConfig();
    const hotspotUrl = config.hotspot_url || 'asuktech.net';
    const wifiSsid = config.wifi_ssid || 'Asuk Tech Wi-Fi';

    // Get hotspot settings
    const { data: hsData } = await supabaseAdmin
      .from('app_settings').select('value').eq('key', 'hotspot_settings').maybeSingle();
    const hsSettings = hsData?.value || {};

    // ═══ Step 1: Set DNS servers & static entry ═══
    try {
      await mikrotikCall('/rest/ip/dns/set', 'POST', {
        servers: '8.8.8.8,1.1.1.1',
        'allow-remote-requests': 'yes',
      });

      // Add static DNS mapping for hotspot portal domain
      try {
        const cleanDomain = hotspotUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        const staticRecords = await mikrotikCall('/rest/ip/dns/static') || [];
        if (!staticRecords.some(r => r.name === cleanDomain)) {
          await mikrotikCall('/rest/ip/dns/static/add', 'POST', {
            name: cleanDomain,
            address: '10.5.50.1',
            comment: 'Asuk Tech Hotspot Portal Domain',
          });
        }
      } catch {}

      results.push({ step: 'DNS & Portal Resolution', status: 'ok', detail: `Set 8.8.8.8, 1.1.1.1 with remote requests + static mapping for "${hotspotUrl}"` });
    } catch (e) {
      results.push({ step: 'DNS & Portal Resolution', status: 'warn', detail: e.message });
    }

    // ═══ Step 2: Configure WiFi SSID & Open Security (No Password) ═══
    try {
      // 1. Ensure open security profile exists (mode=none, no WPA2 password)
      try {
        const secProfiles = await mikrotikCall('/rest/interface/wireless/security-profile') || [];
        const defaultProfile = secProfiles.find(p => p.name === 'default');
        if (defaultProfile) {
          try {
            await mikrotikCall('/rest/interface/wireless/security-profile/set', 'POST', {
              '.id': defaultProfile['.id'],
              mode: 'none',
              'authentication-types': '',
              'wpa-pre-shared-key': '',
              'wpa2-pre-shared-key': '',
            });
          } catch {}
        }
        if (!secProfiles.some(p => p.name === 'asuk-open')) {
          try {
            await mikrotikCall('/rest/interface/wireless/security-profile/add', 'POST', {
              name: 'asuk-open',
              mode: 'none',
            });
          } catch {}
        }
      } catch {}

      // 2. Try RouterOS v7 new WiFi first (/interface/wifi)
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
              'security.authentication-types': '',
              'security.passphrase': '',
            });
          } catch {
            try {
              await mikrotikCall('/rest/interface/wifi/set', 'POST', {
                '.id': iface['.id'],
                'configuration.ssid': wifiSsid,
              });
            } catch {}
          }
        }
        results.push({ step: 'WiFi SSID & Open Security', status: 'ok', detail: `"${wifiSsid}" set as OPEN (no password) on ${wifiInterfaces.length} WiFi interface(s)` });
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
                'security-profile': 'asuk-open',
              });
            } catch {
              try {
                await mikrotikCall('/rest/interface/wireless/set', 'POST', {
                  '.id': iface['.id'],
                  ssid: wifiSsid,
                  'security-profile': 'default',
                });
              } catch {}
            }
          }
          results.push({ step: 'WiFi SSID & Open Security', status: 'ok', detail: `"${wifiSsid}" set as OPEN (no password) on ${wirelessInterfaces.length} wireless interface(s)` });
        } else {
          results.push({ step: 'WiFi SSID', status: 'info', detail: 'No internal WiFi found — external Access Points should have security set to OPEN (no password)' });
        }
      }
    } catch (e) {
      results.push({ step: 'WiFi SSID & Security', status: 'warn', detail: 'Could not configure WiFi: ' + e.message });
    }

    // ═══ Step 3: Ensure hotspot server profile exists with DNS name ═══
    let targetDir = 'hotspot';
    try {
      const routerFiles = await mikrotikCall('/rest/file') || [];
      targetDir = detectHotspotDirectory(routerFiles);
    } catch {}

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
            'login-by': 'cookie,http-chap,http-pap,mac-cookie',
            'http-cookie-lifetime': '3d',
            'hotspot-address': '10.5.50.1',
            'html-directory': targetDir,
          });
          profilesUpdated++;
        } catch {}
      }
      results.push({ step: 'Hotspot Portal Domain', status: 'ok', detail: `"${hotspotUrl}" set on ${profilesUpdated} server profile(s) (Storage: ${targetDir}, Auth: PAP/CHAP/Cookie)` });
    } else {
      // Create a new server profile
      try {
        await mikrotikCall('/rest/ip/hotspot/profile/add', 'POST', {
          name: 'asuk-profile',
          'dns-name': hotspotUrl,
          'login-by': 'cookie,http-chap,http-pap,mac-cookie',
          'http-cookie-lifetime': '3d',
          'hotspot-address': '10.5.50.1',
          'html-directory': targetDir,
        });
        results.push({ step: 'Hotspot Portal Domain', status: 'ok', detail: `Created server profile "asuk-profile" with domain "${hotspotUrl}" (Storage: ${targetDir})` });
      } catch (e) {
        results.push({ step: 'Hotspot Portal Domain', status: 'warn', detail: 'Failed to create server profile: ' + e.message });
      }
    }


    // ═══ Step 4: Bridge & Access Point Ports + Hotspot Server ═══
    let bridges = [];
    try {
      bridges = await mikrotikCall('/rest/interface/bridge') || [];
    } catch {}

    let bridgeName = 'bridge';
    if (bridges.length === 0) {
      try {
        await mikrotikCall('/rest/interface/bridge/add', 'POST', { name: 'bridge' });
        bridgeName = 'bridge';
      } catch {}
    } else {
      bridgeName = bridges[0].name;
    }

    // Bridge all LAN ports so any Access Point plugged into any port works
    let portsBridged = 0;
    try {
      const allInterfaces = await mikrotikCall('/rest/interface') || [];
      const existingPorts = await mikrotikCall('/rest/interface/bridge/port') || [];
      const existingPortNames = existingPorts.map(p => p.interface);

      // Detect WAN interface (usually ether1 or running dhcp-client)
      let wanInterface = 'ether1';
      try {
        const dhcpClients = await mikrotikCall('/rest/ip/dhcp-client') || [];
        if (dhcpClients.length > 0 && dhcpClients[0].interface) {
          wanInterface = dhcpClients[0].interface;
        }
      } catch {}

      for (const iface of allInterfaces) {
        const name = iface.name;
        const type = iface.type;
        const isBridge = type === 'bridge' || name.startsWith('bridge');
        const isWan = name === wanInterface;
        const isEtherOrWlan = type === 'ether' || type === 'wlan' || name.startsWith('ether') || name.startsWith('wlan');

        if (isEtherOrWlan && !isWan && !isBridge && !existingPortNames.includes(name)) {
          try {
            await mikrotikCall('/rest/interface/bridge/port/add', 'POST', {
              bridge: bridgeName,
              interface: name,
            });
            portsBridged++;
          } catch {}
        }
      }
    } catch {}

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

    // Check/Create Hotspot Server
    let hotspotServers = [];
    try {
      hotspotServers = await mikrotikCall('/rest/ip/hotspot') || [];
    } catch {}

    if (hotspotServers.length > 0) {
      results.push({
        step: 'Hotspot & Access Point Bridge',
        status: 'ok',
        detail: `Hotspot active on ${bridgeName}. ${portsBridged > 0 ? `${portsBridged} LAN port(s) bridged for Access Points` : 'All LAN ports bridged'}`,
      });
    } else {
      let updatedProfiles = [];
      try {
        updatedProfiles = await mikrotikCall('/rest/ip/hotspot/profile') || [];
      } catch {}
      const profileToUse = updatedProfiles.find(p => p.name === 'asuk-profile') || updatedProfiles[0];

      try {
        await mikrotikCall('/rest/ip/hotspot/add', 'POST', {
          name: 'hotspot1',
          interface: bridgeName,
          'address-pool': poolName,
          profile: profileToUse?.name || 'default',
          disabled: 'no',
        });
        results.push({
          step: 'Hotspot & Access Point Bridge',
          status: 'ok',
          detail: `Hotspot created on ${bridgeName} (${poolName}). Access Points plugged into LAN ports are covered.`,
        });
      } catch (e) {
        results.push({
          step: 'Hotspot & Access Point Bridge',
          status: 'warn',
          detail: 'Could not auto-create hotspot: ' + e.message,
        });
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

    // ═══ Step 6: Walled Garden — allow login page & payment domains before auth ═══
    try {
      const existingWG = await mikrotikCall('/rest/ip/hotspot/walled-garden') || [];
      const existingWGIP = await mikrotikCall('/rest/ip/hotspot/walled-garden/ip') || [];
      const existingWGHosts = existingWG.map(w => w['dst-host'] || '');

      // Determine the web application domain dynamically from branding settings or env
      const dynamicAppDomains = [];
      let configuredAppHost = '';
      let configuredAppDomain = '';

      try {
        const { data: bData } = await supabaseAdmin
          .from('app_settings')
          .select('value')
          .eq('key', 'branding')
          .single();
        const rawAppUrl = bData?.value?.app_url || process.env.NEXT_PUBLIC_APP_URL || '';
        if (rawAppUrl) {
          const parsed = new URL(rawAppUrl.startsWith('http') ? rawAppUrl : `https://${rawAppUrl}`);
          configuredAppHost = parsed.hostname;
          const parts = configuredAppHost.split('.');
          configuredAppDomain = parts.length > 2 ? parts.slice(-2).join('.') : configuredAppHost;
        }
      } catch {}

      if (configuredAppHost) {
        dynamicAppDomains.push(configuredAppHost);
        if (configuredAppDomain && configuredAppDomain !== configuredAppHost) {
          dynamicAppDomains.push(configuredAppDomain);
        }
        if (configuredAppDomain) {
          dynamicAppDomains.push(`*.${configuredAppDomain}`);
        }
      }

      // Add Supabase Project domain dynamically
      let dynamicSupabaseHost = '';
      try {
        if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
          dynamicSupabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
        }
      } catch {}

      // NOTE: hotspotUrl (e.g. asuktech.net) and router IP (10.5.50.1) MUST NEVER be added to Walled Garden.
      // Doing so forces RouterOS transparent HttpProxy into an external connection loop,
      // producing "ERROR: Gateway Timeout While trying to retrieve the URL http://asuktech.net/login: Connection refused".

      // Comprehensive domains for captive portal, banks, payment switches & 3DS ACS links
      const rawWalledGardenDomains = [
        ...dynamicAppDomains,
        ...(dynamicSupabaseHost ? [dynamicSupabaseHost] : []),
        '*.supabase.co',
        '*.supabase.in',
        '*.vercel.app',

        // Payment Gateways & Switches
        '*.flutterwave.com',
        '*.flw.io',
        '*.ravepay.co',
        '*.paystack.com',
        '*.paystack.co',
        '*.remita.net',
        '*.interswitchng.com',
        '*.quickteller.com',
        '*.interswitch.com',
        '*.unifiedpaymentsnigeria.com',
        '*.monnify.com',
        '*.squadco.com',
        '*.habaripay.com',
        '*.nomba.com',
        '*.payvessel.com',

        // 3D Secure & Hidden ACS Authentication
        '*.mastercard.com',
        '*.securecode.com',
        '*.visa.com',
        '*.visaeurope.com',
        '*.verve.com.ng',
        '*.verveinternational.com',
        '*.cardinalcommerce.com',
        '*.arcot.com',
        '*.modirum.com',
        '*.threatmetrix.com',

        // Digital Banks & Fintechs
        '*.opayweb.com',
        '*.opay.com',
        '*.operapay.com',
        '*.palmpay.com',
        '*.palmpay.co',
        '*.palmpay.app',
        '*.moniepoint.com',
        '*.teamapt.com',
        '*.kuda.com',
        '*.kudabank.com',
        '*.piggyvest.com',
        '*.pocketapp.com',
        '*.vbank.ng',
        '*.vfdtech.ng',
        '*.getcarbon.co',
        '*.carbon.ng',
        '*.fairmoney.io',
        '*.fairmoney.ng',
        '*.chippercash.com',

        // Commercial Banks
        '*.gtbank.com',
        '*.gtworld.com',
        '*.accessbankplc.com',
        '*.accessmore.com',
        '*.zenithbank.com',
        '*.zenithbank.com.ng',
        '*.firstbanknigeria.com',
        '*.firstmonie.com',
        '*.ubagroup.com',
        '*.uba.com',
        '*.stanbicibtc.com',
        '*.stanbic.com',
        '*.fidelitybank.ng',
        '*.fidelitybank.com',
        '*.sterlingbank.com',
        '*.sterling.ng',
        '*.onebank.ng',
        '*.fcmb.com',
        '*.unionbankng.com',
        '*.unionbank.com',
        '*.polarisbanklimited.com',
        '*.polaris.com.ng',
        '*.vult.ng',
        '*.alat.ng',
        '*.wemabank.com',
        '*.keystonebankng.com',
        '*.jaizbankplc.com',
        '*.tajbank.com',
        '*.lotusbank.com',
        '*.premiumtrustbank.com',
        '*.optimusbank.com',
        '*.signaturebankng.com',

        // Web Fonts & CDN Assets (Note: captive probe domains like captive.apple.com MUST NOT be here)
        '*.googleapis.com',
        '*.gstatic.com',
        '*.cloudflare.com',
      ];

      // Exclude router's own domain or IP from walled garden list
      const walledGardenDomains = rawWalledGardenDomains.filter(d => {
        const lower = String(d || '').toLowerCase();
        return !lower.includes('asuktech.net') && !lower.includes(hotspotUrl.toLowerCase()) && !lower.includes('10.5.50.');
      });

      // CRITICAL FOR IOS/ANDROID CAPTIVE POPUP DETECTION & PROXY LOOP PREVENTION:
      // 1. Remove captive probe domains (iPhones/Androids suppress captive popup if probe is allowed)
      // 2. Remove router's own hotspot domain/IP (prevents HttpProxy connection refused loop)
      const captiveProbeDomains = ['captive.apple.com', 'connectivitycheck.gstatic.com', '*.msftconnecttest.com', 'msftconnecttest.com'];
      const hotspotOwnDomains = ['asuktech.net', hotspotUrl.toLowerCase(), '10.5.50.1'];

      for (const entry of existingWG) {
        const host = (entry['dst-host'] || '').toLowerCase();
        const isProbe = captiveProbeDomains.some(cp => host === cp || host.includes('captive.apple') || host.includes('connectivitycheck.gstatic') || host.includes('msftconnecttest'));
        const isOwnHotspot = hotspotOwnDomains.some(od => od && (host === od || host.includes(od)));
        if (isProbe || isOwnHotspot) {
          try {
            await mikrotikCall(`/rest/ip/hotspot/walled-garden/${entry['.id']}`, 'DELETE');
          } catch {
            try {
              await mikrotikCall('/rest/ip/hotspot/walled-garden/remove', 'POST', { '.id': entry['.id'] });
            } catch {}
          }
        }
      }
      for (const entry of existingWGIP) {
        const host = (entry['dst-host'] || '').toLowerCase();
        const dstAddr = (entry['dst-address'] || '').toLowerCase();
        const isProbe = captiveProbeDomains.some(cp => host === cp || host.includes('captive.apple') || host.includes('connectivitycheck.gstatic') || host.includes('msftconnecttest'));
        const isOwnHotspot = hotspotOwnDomains.some(od => od && (host === od || host.includes(od) || dstAddr.includes(od)));
        if (isProbe || isOwnHotspot) {
          try {
            await mikrotikCall(`/rest/ip/hotspot/walled-garden/ip/${entry['.id']}`, 'DELETE');
          } catch {
            try {
              await mikrotikCall('/rest/ip/hotspot/walled-garden/ip/remove', 'POST', { '.id': entry['.id'] });
            } catch {}
          }
        }
      }


      let wgCreated = 0;
      for (const domain of walledGardenDomains) {
        if (!existingWGHosts.some(h => h === domain)) {
          try {
            // HTTP-level (allow)
            await mikrotikCall('/rest/ip/hotspot/walled-garden/add', 'POST', {
              action: 'allow',
              'dst-host': domain,
              comment: 'Asuk Tech Auto Setup',
            });
            wgCreated++;
          } catch {}

          try {
            // IP-level (accept, critical for HTTPS/Supabase)
            await mikrotikCall('/rest/ip/hotspot/walled-garden/ip/add', 'POST', {
              action: 'accept',
              'dst-host': domain,
              comment: 'Asuk Tech Auto Setup (HTTPS)',
            });
          } catch {}
        }
      }

      results.push({
        step: 'Walled Garden (Captive Portal)',
        status: 'ok',
        detail: wgCreated > 0
          ? `${wgCreated} domain(s) added — login page, banks & payment gateways allowed before auth`
          : `All ${walledGardenDomains.length} required domains configured; captive probe domains excluded for iOS/Android popup`,
      });
    } catch (e) {
      results.push({ step: 'Walled Garden (Captive Portal)', status: 'warn', detail: 'Could not configure: ' + e.message });
    }

    // ═══ Step 7: NAT Masquerade — internet access after authentication ═══
    try {
      const natRules = await mikrotikCall('/rest/ip/firewall/nat') || [];
      const hasMasquerade = natRules.some(r => r.action === 'masquerade' && r.chain === 'srcnat');

      if (!hasMasquerade) {
        await mikrotikCall('/rest/ip/firewall/nat/add', 'POST', {
          chain: 'srcnat',
          action: 'masquerade',
          'out-interface-list': 'all',
          comment: 'Asuk Tech Hotspot Internet Access',
        });
        results.push({ step: 'NAT Masquerade', status: 'ok', detail: 'Created — users will have internet access after login' });
      } else {
        results.push({ step: 'NAT Masquerade', status: 'ok', detail: 'Already configured' });
      }
    } catch (e) {
      results.push({ step: 'NAT Masquerade', status: 'warn', detail: 'Could not add NAT rule: ' + e.message });
    }

    // ═══ Step 8: Hotspot Login Portal — full captive portal suite (login, alogin, status, logout) ═══
    try {
      // Load saved portal template config (if user has set one via Login Design tab)
      let savedPortalConfig = {};
      let savedBrandingConfig = {};
      try {
        const { data: stData } = await supabaseAdmin
          .from('app_settings')
          .select('key, value')
          .in('key', ['portal_template', 'branding']);
        (stData || []).forEach(r => {
          if (r.key === 'portal_template') savedPortalConfig = r.value || {};
          if (r.key === 'branding') savedBrandingConfig = r.value || {};
        });
      } catch {}

      const defaultBuyUrl = savedPortalConfig.buyUrl
        || (savedBrandingConfig.app_url ? `${savedBrandingConfig.app_url.replace(/\/+$/, '')}/packages` : '')
        || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/packages` : '')
        || 'https://www.asuk.tech/packages';

      const selectedTemplateId = body.template_id || savedPortalConfig.templateId || 'midnight-glass';

      const pushResult = await pushHotspotLoginPageToRouter({
        templateId: selectedTemplateId,
        wifiSsid: wifiSsid || 'Asuk Tech Wi-Fi',
        buyUrl: defaultBuyUrl,
        businessName: savedPortalConfig.businessName || savedBrandingConfig.app_name || wifiSsid || 'Asuk Tech Wi-Fi',
        logoUrl: savedPortalConfig.logoUrl || savedBrandingConfig.logo_url || '',
        contactFooter: savedPortalConfig.contactFooter || '',
        primaryColor: savedPortalConfig.primaryColor || '',
      });

      results.push({
        step: 'Hotspot Login Portal UI',
        status: 'ok',
        detail: pushResult.portalInstalled
          ? `Template "${selectedTemplateId}" + status/alogin/logout suite deployed to router (${pushResult.targetDir})`
          : `Hotspot server profile active with template "${selectedTemplateId}"`,
      });
    } catch (e) {
      results.push({ step: 'Hotspot Login Portal UI', status: 'warn', detail: 'Portal setup: ' + e.message });
    }



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

    // Record in change history
    try {
      await logChange({
        category: 'mikrotik-config',
        action: 'auto-setup',
        summary: `Automated router provisioning: ${allOk ? 'All steps succeeded' : 'Completed with warnings'}`,
        beforeState: {},
        afterState: { all_ok: allOk },
        metadata: { resultsCount: results.length, all_ok: allOk },
      });
    } catch {}

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
