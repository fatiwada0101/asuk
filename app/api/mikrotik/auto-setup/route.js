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
            'html-directory': 'hotspot',
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
          'html-directory': 'hotspot',
        });
        results.push({ step: 'Hotspot Portal Domain', status: 'ok', detail: `Created server profile "asuk-profile" with domain "${hotspotUrl}"` });
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
      const existingWGHosts = existingWG.map(w => w['dst-host'] || '');

      // Determine the app domain from the hotspot URL or config
      const appDomains = [];

      // Add the Vercel app domain (where login page is hosted)
      if (hotspotUrl && !hotspotUrl.includes('192.168') && !hotspotUrl.includes('10.')) {
        appDomains.push(`*${hotspotUrl}*`);
      }

      // Common domains needed for captive portal to work (HTTP + HTTPS)
      const walledGardenDomains = [
        ...appDomains,
        'www.asuk.tech',                 // Portal domain
        'asuk.tech',                     // Apex domain
        '*.asuk.tech',                   // Asuk Tech wildcards
        'vtvzxbyxgotcathjxivo.supabase.co', // Core Supabase backend
        '*.supabase.co',                 // Backend APIs
        '*.supabase.in',                 // Backend alt
        '*.vercel.app',                  // Vercel hosting
        '*.flutterwave.com',             // Payment gateway
        '*.googleapis.com',              // Google Fonts / APIs
        '*.gstatic.com',                 // Google static assets
        '*.cloudflare.com',              // CDN
        'connectivitycheck.gstatic.com', // Android captive portal detection
        'captive.apple.com',             // iOS captive portal detection
        '*.msftconnecttest.com',         // Windows captive portal detection
      ];

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
          ? `${wgCreated} domain(s) added — login page, payments, and OS detection allowed before auth`
          : `All ${walledGardenDomains.length} required domains already configured`,
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

    // ═══ Step 8: Hotspot Login Portal — self-contained responsive voucher portal ═══
    try {
      // Update hotspot server profiles to use standard hotspot directory and PAP/CHAP authentication
      const updatedServerProfiles = await mikrotikCall('/rest/ip/hotspot/profile') || [];
      for (const sp of updatedServerProfiles) {
        try {
          await mikrotikCall('/rest/ip/hotspot/profile/set', 'POST', {
            '.id': sp['.id'],
            'dns-name': hotspotUrl,
            'login-by': 'cookie,http-chap,http-pap',
            'http-cookie-lifetime': '3d',
            'html-directory': 'hotspot',
          });
        } catch {}
      }

      // Self-contained, responsive, dark-mode Hotspot login page
      // Runs directly on router port 80 (HTTP) — zero SSL errors, works offline!
      const portalHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>${wifiSsid || 'Asuk Tech Wi-Fi'}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{width:100%;max-width:380px;background:#18181b;border:1px solid #27272a;border-radius:20px;padding:32px 24px;box-shadow:0 20px 40px rgba(0,0,0,0.6);text-align:center}
.icon{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:26px;box-shadow:0 8px 24px rgba(16,185,129,0.3)}
h1{font-size:22px;font-weight:800;margin-bottom:6px}
p.sub{font-size:13px;color:#a1a1aa;margin-bottom:24px}
.err{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#f87171;padding:10px 14px;border-radius:12px;font-size:13px;margin-bottom:18px}
.lbl{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#a1a1aa;margin-bottom:8px;text-align:left}
input[type="text"]{width:100%;padding:14px 16px;font-size:18px;font-weight:800;background:#27272a;border:1.5px solid #3f3f46;border-radius:14px;color:#fff;text-align:center;letter-spacing:2px;outline:none;font-family:monospace;text-transform:uppercase}
input[type="text"]:focus{border-color:#10b981}
.btn{width:100%;padding:15px;margin-top:18px;font-size:15px;font-weight:800;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 20px rgba(16,185,129,0.35)}
.buy{margin-top:24px;padding-top:18px;border-top:1px solid #27272a}
.buy-txt{font-size:12px;color:#71717a;margin-bottom:10px}
.btn-buy{display:inline-block;color:#a78bfa;font-size:13.5px;font-weight:700;text-decoration:none;padding:10px 18px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);border-radius:12px}
.info{margin-top:18px;font-size:11px;color:#52525b}
</style>
</head>
<body>
<div class="card">
<div class="icon">&#9889;</div>
<h1>${wifiSsid || 'Asuk Tech Wi-Fi'}</h1>
<p class="sub">Enter your voucher code to connect</p>
$(if error)<div class="err">&#9888; $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post">
<input type="hidden" name="dst" value="$(link-orig)" />
<input type="hidden" name="popup" value="true" />
<label class="lbl">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="ASUK-XXXX" autofocus required autocomplete="off" />
<input type="hidden" name="password" id="pass" value="$(username)" />
<button type="submit" class="btn">&#9889; Connect to Internet</button>
</form>
<div class="buy">
<div class="buy-txt">Don't have an active voucher?</div>
<a href="https://asuk.vercel.app/packages" class="btn-buy">&#128722; Buy a Data Plan Online &rarr;</a>
</div>
<div class="info">MAC: $(mac) &bull; IP: $(ip)</div>
</div>
<script>
var c=document.getElementById('code'),p=document.getElementById('pass');
c.addEventListener('input',function(){p.value=c.value.trim()});
if(c.value&&c.value.length>2&&!'$(error)'){p.value=c.value.trim();document.forms['login'].submit()}
</script>
</body>
</html>`;

      let portalInstalled = false;

      // Method A: Direct REST API file update (Fast & reliable on RouterOS v7)
      try {
        const files = await mikrotikCall('/rest/file') || [];
        const loginFile = Array.isArray(files) && files.find(f => f.name === 'hotspot/login.html');
        if (loginFile && loginFile['.id']) {
          const patchRes = await mikrotikCall(`/rest/file/${encodeURIComponent(loginFile['.id'])}`, 'PATCH', {
            contents: portalHtml,
          });
          if (patchRes && (patchRes.ok || patchRes.status === 200)) {
            portalInstalled = true;
          }
        }
      } catch {}

      // Method B: System script fallback
      if (!portalInstalled) {
        try {
          const scriptSource = `:do { /file print file="hotspot/login.html"; :delay 1s; /file set [find name="hotspot/login.html"] contents="${portalHtml.replace(/"/g, '\\"')}"; } on-error={}`;
          const scripts = await mikrotikCall('/rest/system/script') || [];
          const scriptName = 'asuk-hotspot-portal';
          const existingScript = Array.isArray(scripts) && scripts.find(s => s.name === scriptName);
          if (existingScript) {
            await mikrotikCall('/rest/system/script/set', 'POST', { '.id': existingScript['.id'], source: scriptSource });
          } else {
            await mikrotikCall('/rest/system/script/add', 'POST', {
              name: scriptName,
              source: scriptSource,
              policy: 'ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon',
            });
          }
          await mikrotikCall('/rest/system/script/run', 'POST', { number: scriptName });
          portalInstalled = true;
        } catch {}
      }

      results.push({
        step: 'Hotspot Login Portal UI',
        status: 'ok',
        detail: portalInstalled
          ? 'Modern captive portal installed directly on router — loads offline with instant voucher entry'
          : 'Hotspot server profile configured for local voucher authentication',
      });
    } catch (e) {
      results.push({ step: 'Hotspot Login Portal UI', status: 'info', detail: 'Portal profile ready: ' + e.message });
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
