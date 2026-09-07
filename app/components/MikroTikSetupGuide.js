'use client';

import { useState } from 'react';

/**
 * MikroTik WinBox Setup & Connection Guide
 * Detailed step-by-step tutorial separated into:
 * 1. ☁️ Vercel & Cloud Global Domain Setup (for live internet deployments)
 * 2. 🏠 Local / Home Network Setup (for local PC development)
 * 3. ⚡ 1-Click Terminal Script Generator (Cloud vs. Local switchable)
 * 4. 🌐 Hotspot URL & Zero-Config User Flow
 */
export default function MikroTikSetupGuide({ mikrotikForm = {}, onSyncRouter, isSyncing = false }) {
  // Default to cloud because app is deployed on Vercel
  const [activeGuideTab, setActiveGuideTab] = useState('cloud'); // 'cloud' | 'local' | 'script' | 'hotspot'
  const [scriptMode, setScriptMode] = useState('cloud'); // 'cloud' | 'local'
  const [copiedScript, setCopiedScript] = useState(false);
  const [expandedCloudStep, setExpandedCloudStep] = useState(1);
  const [expandedLocalStep, setExpandedLocalStep] = useState(1);

  const routerPort = mikrotikForm.port || '443';
  const apiUser = mikrotikForm.user || 'admin2';
  const apiPass = mikrotikForm.pass || 'YourStrongPassword123!';
  const hotspotUrl = (mikrotikForm.hotspot_url || 'asuktech.net').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const wifiSsid = mikrotikForm.wifi_ssid || 'Asuk Tech Wi-Fi';

  // 1. Cloud / Vercel Script
  const cloudTerminalScript = `# ================================================================
# ASUK TECH — VERCEL & CLOUD GLOBAL DOMAIN SCRIPT (RouterOS v7)
# Run in WinBox -> New Terminal on your MikroTik router
# ================================================================

# 1. Configure DNS Servers so router can resolve MikroTik Cloud
/ip dns set servers=8.8.8.8,1.1.1.1

# 2. Enable & Force MikroTik Cloud Dynamic DNS (DDNS)
/ip cloud set ddns-enabled=yes
/ip cloud force-update

# 3. Enable REST API on SSL port ${routerPort}
/ip service set www-ssl port=${routerPort} disabled=no

# 4. Allow Inbound Port ${routerPort} in Firewall for Vercel Cloud
/ip firewall filter add chain=input protocol=tcp dst-port=${routerPort} action=accept comment="Allow REST API for Vercel Cloud" place-before=1

# 5. Create Dedicated Service Account
/user add name="${apiUser}" password="${apiPass}" group=full comment="Asuk Tech Cloud Integration"

# 6. Configure Hotspot Server Profile Captive Portal URL (${hotspotUrl})
/ip hotspot profile set [find default=yes] dns-name="${hotspotUrl}" login-by=cookie,http-chap,http-pap
/ip hotspot profile set [find name="hsprof1"] dns-name="${hotspotUrl}" login-by=cookie,http-chap,http-pap

# 7. Print your Cloud DDNS Domain (Copy the "dns-name" into Super Admin Router IP)
/ip cloud print
`;

  // 2. Local LAN Script
  const localTerminalScript = `# ================================================================
# ASUK TECH — LOCAL LAN / PC SCRIPT (RouterOS v7)
# For testing locally with router IP 192.168.88.1 or local bridge
# ================================================================

# 1. Enable REST API on port ${routerPort}
/ip service set www-ssl port=${routerPort} disabled=no
/ip service set www port=80 disabled=no

# 2. Create Dedicated Service Account
/user add name="${apiUser}" password="${apiPass}" group=full comment="Asuk Tech Local Integration"

# 3. Configure Hotspot Server Profile Captive Portal URL (${hotspotUrl})
/ip hotspot profile set [find default=yes] dns-name="${hotspotUrl}" login-by=cookie,http-chap,http-pap
/ip hotspot profile set [find name="hsprof1"] dns-name="${hotspotUrl}" login-by=cookie,http-chap,http-pap

# 4. Verify Services
/ip service print where name="www-ssl" or name="www"
/user print where name="${apiUser}"
`;

  const activeScript = scriptMode === 'cloud' ? cloudTerminalScript : localTerminalScript;

  const handleCopyScript = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(activeScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    }
  };

  return (
    <div className="sa-glass-card" style={{ marginTop: 24, border: '1.5px solid rgba(114, 87, 255, 0.35)' }}>
      {/* Header */}
      <div className="sa-card-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '24px' }}>📡</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 className="sa-card-title" style={{ fontSize: '18px' }}>
                  MikroTik Connection &amp; Setup Guide
                </h3>
                <span
                  style={{
                    background: '#10B981',
                    color: '#FFF',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  VERCEL CLOUD READY
                </span>
              </div>
              <p className="sa-card-sub" style={{ marginTop: '2px' }}>
                Clear separation between <strong>Global Domain (Vercel)</strong> and <strong>Local LAN (PC)</strong> setup
              </p>
            </div>
          </div>
        </div>

        {/* Sync Hotspot button */}
        {onSyncRouter && (
          <button
            className="sa-btn-outline"
            onClick={onSyncRouter}
            disabled={isSyncing}
            style={{
              borderColor: '#7257FF',
              color: '#7257FF',
              fontWeight: 700,
              fontSize: '13px',
              padding: '8px 16px',
            }}
          >
            {isSyncing ? 'Syncing...' : `⚡ Push ${hotspotUrl} to Router`}
          </button>
        )}
      </div>

      {/* Guide Navigation Pills */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid #ECEEF2',
          paddingBottom: 14,
          marginBottom: 20,
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveGuideTab('cloud')}
          style={{
            background: activeGuideTab === 'cloud' ? '#7257FF' : '#F4F5F8',
            color: activeGuideTab === 'cloud' ? '#FFF' : '#121217',
            border: activeGuideTab === 'cloud' ? 'none' : '1px solid #E4E4E7',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>☁️ Vercel &amp; Cloud (Global Domain)</span>
          <span style={{ fontSize: '10px', background: activeGuideTab === 'cloud' ? 'rgba(255,255,255,0.25)' : '#10B981', color: '#FFF', padding: '1px 6px', borderRadius: 999 }}>
            Live
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveGuideTab('local')}
          style={{
            background: activeGuideTab === 'local' ? '#7257FF' : '#F4F5F8',
            color: activeGuideTab === 'local' ? '#FFF' : '#121217',
            border: activeGuideTab === 'local' ? 'none' : '1px solid #E4E4E7',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🏠 Local LAN Setup (192.168.88.1)
        </button>

        <button
          type="button"
          onClick={() => setActiveGuideTab('script')}
          style={{
            background: activeGuideTab === 'script' ? '#7257FF' : '#F4F5F8',
            color: activeGuideTab === 'script' ? '#FFF' : '#121217',
            border: activeGuideTab === 'script' ? 'none' : '1px solid #E4E4E7',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          ⚡ 1-Click Terminal Script
        </button>

        <button
          type="button"
          onClick={() => setActiveGuideTab('hotspot')}
          style={{
            background: activeGuideTab === 'hotspot' ? '#7257FF' : '#F4F5F8',
            color: activeGuideTab === 'hotspot' ? '#FFF' : '#121217',
            border: activeGuideTab === 'hotspot' ? 'none' : '1px solid #E4E4E7',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🌐 Hotspot URL &amp; Auto-Login
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: VERCEL & CLOUD GLOBAL DOMAIN SETUP (LIVE DEPLOYMENT) ── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeGuideTab === 'cloud' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Important Architecture Note */}
          <div
            style={{
              background: 'rgba(114, 87, 255, 0.08)',
              border: '1.5px solid rgba(114, 87, 255, 0.35)',
              borderRadius: 16,
              padding: '16px 20px',
              color: '#3B28CC',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '14.5px' }}>
              <span>☁️</span>
              <span>Why Vercel Cannot Use 192.168.88.1</span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '13px', lineHeight: 1.6, color: '#4338CA' }}>
              Your website is hosted on <strong>Vercel&apos;s public cloud servers</strong>. Private IP addresses starting with <code>192.168.x.x</code> or <code>10.x.x.x</code> only exist inside your physical home/office Wi-Fi. For Vercel to reach your router, your router must have a <strong>Public Global Domain</strong>. Follow the steps below to set this up in 2 minutes:
            </p>
          </div>

          {/* Cloud Step 1: Obtain MikroTik Cloud DDNS */}
          <div
            style={{
              border: '1px solid #ECEEF2',
              borderRadius: 16,
              padding: '18px 20px',
              background: expandedCloudStep === 1 ? 'rgba(114, 87, 255, 0.02)' : '#FFFFFF',
            }}
          >
            <div
              onClick={() => setExpandedCloudStep(expandedCloudStep === 1 ? null : 1)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    background: '#7257FF',
                    color: '#FFF',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '14px',
                  }}
                >
                  1
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                    Generate Your Router&apos;s Free Cloud Domain (MikroTik Cloud DDNS)
                  </h4>
                  <span style={{ fontSize: '12px', color: '#71717A' }}>
                    WinBox Navigation: <strong>IP ➔ Cloud</strong>
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '18px', color: '#8E8E93' }}>{expandedCloudStep === 1 ? '▲' : '▼'}</span>
            </div>

            {expandedCloudStep === 1 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ECEEF2', fontSize: '13.5px', color: '#4A4A52', lineHeight: 1.6 }}>
                <p>MikroTik includes free, permanent dynamic DNS for every RouterBOARD hardware device:</p>
                <ol style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>Open <strong>WinBox</strong> and connect to your router.</li>
                  <li>Click <strong>IP</strong> in the left menu, then click <strong>Cloud</strong>.</li>
                  <li>Check the box: <strong>DDNS Enabled</strong>.</li>
                  <li>
                    <strong style={{ color: '#DC2626' }}>CRITICAL STEP:</strong> Click the <strong>Apply</strong> button at the top/right! (RouterOS will not generate the domain until you click Apply).
                  </li>
                  <li>Wait 5 to 10 seconds. The <strong>DNS Name</strong> box will automatically populate with your unique domain:
                    <div style={{ margin: '8px 0', background: '#18181B', color: '#10B981', padding: '10px 14px', borderRadius: '10px', fontFamily: 'monospace', fontWeight: 700 }}>
                      abcdef123456.sn.mynetname.net
                    </div>
                  </li>
                  <li>Copy that <code>*.sn.mynetname.net</code> domain. This will be your <strong>Router IP / Host</strong> in Asuk Tech!</li>
                </ol>

                {/* If DNS Name is blank troubleshooting */}
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginTop: 12,
                    fontSize: '12.5px',
                    color: '#92400E',
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: 4 }}>
                    ❓ Is the DNS Name still blank or says &ldquo;connecting...&rdquo;?
                  </strong>
                  Open <strong>New Terminal</strong> in WinBox and run these two commands:
                  <pre style={{ margin: '6px 0', background: '#FFF', padding: '6px 10px', borderRadius: '6px', border: '1px solid #FCD34D', color: '#B45309', fontFamily: 'monospace' }}>
                    /ip dns set servers=8.8.8.8,1.1.1.1{'\n'}
                    /ip cloud force-update{'\n'}
                    /ip cloud print
                  </pre>
                  The terminal will output your <code>dns-name</code> immediately.
                </div>
              </div>
            )}
          </div>

          {/* Cloud Step 2: Open Port 443 in Firewall */}
          <div
            style={{
              border: '1px solid #ECEEF2',
              borderRadius: 16,
              padding: '18px 20px',
              background: expandedCloudStep === 2 ? 'rgba(114, 87, 255, 0.02)' : '#FFFFFF',
            }}
          >
            <div
              onClick={() => setExpandedCloudStep(expandedCloudStep === 2 ? null : 2)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    background: '#7257FF',
                    color: '#FFF',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '14px',
                  }}
                >
                  2
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                    Allow Inbound Traffic on Port 443 (Firewall Filter Rule)
                  </h4>
                  <span style={{ fontSize: '12px', color: '#71717A' }}>
                    WinBox Navigation: <strong>IP ➔ Firewall ➔ Filter Rules</strong>
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '18px', color: '#8E8E93' }}>{expandedCloudStep === 2 ? '▲' : '▼'}</span>
            </div>

            {expandedCloudStep === 2 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ECEEF2', fontSize: '13.5px', color: '#4A4A52', lineHeight: 1.6 }}>
                <p>Default MikroTik firewalls block incoming connections from the WAN internet, and RouterOS requires an SSL certificate for port 443:</p>
                <div style={{ background: '#F8F9FA', padding: 12, borderRadius: 10, border: '1px solid #ECEEF2', marginTop: 8 }}>
                  <strong>1. Allow Port 443 in Firewall (WinBox Terminal):</strong>
                  <pre style={{ margin: '6px 0 0', background: '#18181B', color: '#F4F4F5', padding: '8px 12px', borderRadius: 8, fontFamily: 'monospace' }}>
                    /ip firewall filter add chain=input protocol=tcp dst-port=443 action=accept comment=&quot;Allow REST API for Vercel&quot; place-before=1
                  </pre>
                </div>
                <div style={{ background: '#F8F9FA', padding: 12, borderRadius: 10, border: '1px solid #ECEEF2', marginTop: 10 }}>
                  <strong>2. Ensure www-ssl Service &amp; SSL Certificate are Active (WinBox Terminal):</strong>
                  <pre style={{ margin: '6px 0 0', background: '#18181B', color: '#10B981', padding: '8px 12px', borderRadius: 8, fontFamily: 'monospace' }}>
                    /certificate enable-ssl-certificate{'\n'}
                    /ip service set www-ssl disabled=no port=443
                  </pre>
                  <span style={{ fontSize: '11.5px', color: '#71717A', marginTop: 4, display: 'block' }}>
                    Note: If RouterOS says command not found, generate a self-signed cert: <code>/certificate add name=web-ssl common-name={mikrotikForm?.ip || 'router'} days-valid=3650</code> then <code>/certificate sign web-ssl</code> and <code>/ip service set www-ssl certificate=web-ssl disabled=no</code>.
                  </span>
                </div>
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: 12, borderRadius: 10, border: '1px solid rgba(59, 130, 246, 0.25)', marginTop: 10 }}>
                  <strong style={{ color: '#1D4ED8' }}>💡 Easier Alternative: Use Port 80 (HTTP) without SSL certificates:</strong>
                  <pre style={{ margin: '6px 0 0', background: '#18181B', color: '#93C5FD', padding: '8px 12px', borderRadius: 8, fontFamily: 'monospace' }}>
                    /ip service set www disabled=no port=80{'\n'}
                    /ip firewall filter add chain=input protocol=tcp dst-port=80 action=accept comment=&quot;Allow HTTP REST API&quot; place-before=1
                  </pre>
                  <span style={{ fontSize: '11.5px', color: '#1E40AF', marginTop: 4, display: 'block' }}>
                    Then in Asuk Tech settings: set <strong>Port</strong> to <code>80</code> and <strong>uncheck</strong> &ldquo;Use SSL / HTTPS&rdquo;.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Cloud Step 3: Upstream Modem / ISP Port Forwarding */}
          <div
            style={{
              border: '1px solid #ECEEF2',
              borderRadius: 16,
              padding: '18px 20px',
              background: expandedCloudStep === 3 ? 'rgba(114, 87, 255, 0.02)' : '#FFFFFF',
            }}
          >
            <div
              onClick={() => setExpandedCloudStep(expandedCloudStep === 3 ? null : 3)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    background: '#7257FF',
                    color: '#FFF',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '14px',
                  }}
                >
                  3
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                    If Connected to an ISP Modem / Router (Port Forwarding)
                  </h4>
                  <span style={{ fontSize: '12px', color: '#71717A' }}>
                    Handling Double-NAT when MikroTik is plugged into a fiber/broadband modem
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '18px', color: '#8E8E93' }}>{expandedCloudStep === 3 ? '▲' : '▼'}</span>
            </div>

            {expandedCloudStep === 3 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ECEEF2', fontSize: '13.5px', color: '#4A4A52', lineHeight: 1.6 }}>
                <p>
                  If your MikroTik router is plugged into another modem or ISP Wi-Fi box (like MTN, Airtel, Starlink, or fiber ONU):
                </p>
                <ol style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>Log in to your ISP modem&apos;s admin page (e.g., <code>192.168.1.1</code> or <code>192.168.0.1</code>).</li>
                  <li>Find the <strong>Port Forwarding</strong>, <strong>Virtual Server</strong>, or <strong>DMZ</strong> section.</li>
                  <li>Forward external port <strong>443</strong> (TCP) to your MikroTik router&apos;s WAN IP address.</li>
                  <li>Alternatively, place the MikroTik router&apos;s WAN IP into the modem&apos;s <strong>DMZ</strong>.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Cloud Step 4: Alternative for 4G/5G CGNAT (Cloudflare Tunnel) */}
          <div
            style={{
              border: '1px solid #ECEEF2',
              borderRadius: 16,
              padding: '18px 20px',
              background: expandedCloudStep === 4 ? 'rgba(114, 87, 255, 0.02)' : '#FFFFFF',
            }}
          >
            <div
              onClick={() => setExpandedCloudStep(expandedCloudStep === 4 ? null : 4)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    background: '#7257FF',
                    color: '#FFF',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '14px',
                  }}
                >
                  4
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                    Zero Port-Forwarding Alternative (Cloudflare Tunnel / ngrok)
                  </h4>
                  <span style={{ fontSize: '12px', color: '#71717A' }}>
                    For Mobile 4G/5G SIMs or ISPs that block incoming ports (CGNAT)
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '18px', color: '#8E8E93' }}>{expandedCloudStep === 4 ? '▲' : '▼'}</span>
            </div>

            {expandedCloudStep === 4 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ECEEF2', fontSize: '13.5px', color: '#4A4A52', lineHeight: 1.6 }}>
                <p>
                  If your internet provider uses <strong>CGNAT</strong> (common on MTN, Airtel, Starlink, or 4G LTE modems where WAN IP is private), direct incoming ports are blocked by the carrier. You can connect in 1 minute using <strong>ngrok</strong> or <strong>Cloudflare Tunnel</strong>:
                </p>
                <div style={{ background: '#F8F9FA', padding: 12, borderRadius: 10, border: '1px solid #ECEEF2', marginTop: 8 }}>
                  <strong>Option A: Instant ngrok Tunnel (Fastest — 1 minute):</strong>
                  <ol style={{ paddingLeft: 20, marginTop: 6, fontSize: '12.5px' }}>
                    <li>Download free <strong>ngrok</strong> on your PC connected to the router.</li>
                    <li>In terminal / Command Prompt, run:
                      <pre style={{ margin: '4px 0', background: '#18181B', color: '#10B981', padding: '8px 12px', borderRadius: 8, fontFamily: 'monospace' }}>
                        ngrok http 192.168.88.1:80
                      </pre>
                    </li>
                    <li>ngrok gives you a public URL (e.g. <code>https://abc-xyz.ngrok-free.app</code>).</li>
                    <li>Paste that host (<code>abc-xyz.ngrok-free.app</code>) into <strong>Router IP / Host</strong> above, set Port to <code>443</code>, Use SSL checked, and click Save!</li>
                  </ol>
                </div>
                <div style={{ background: '#F8F9FA', padding: 12, borderRadius: 10, border: '1px solid #ECEEF2', marginTop: 10 }}>
                  <strong>Option B: Cloudflare Tunnel (Permanent):</strong>
                  <pre style={{ margin: '6px 0', background: '#18181B', color: '#10B981', padding: '8px 12px', borderRadius: 8, fontFamily: 'monospace' }}>
                    cloudflared tunnel --url https://192.168.88.1:443 --no-tls-verify
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Cloud Step 5: Save & Test in Asuk Tech */}
          <div
            style={{
              background: '#F9FAFB',
              border: '1.5px solid #E5E7EB',
              borderRadius: 16,
              padding: '18px 20px',
            }}
          >
            <strong style={{ fontSize: '14px', color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✅</span> Step 5: Apply Your Public Domain in the Settings Above
            </strong>
            <ol style={{ paddingLeft: 20, marginTop: 8, fontSize: '13px', color: '#4B5563', lineHeight: 1.6 }}>
              <li>Scroll up to the <strong>MikroTik Router Configuration</strong> form.</li>
              <li>In <strong>Router IP / Host</strong>, paste your <code>*.sn.mynetname.net</code> domain (or Cloudflare Tunnel domain).</li>
              <li>Set <strong>Port</strong> to <code>443</code> and <strong>Protocol</strong> to <code>HTTPS (SSL)</code>.</li>
              <li>Enter your router <strong>Username</strong> (e.g. <code>{apiUser}</code>) and <strong>Password</strong>.</li>
              <li>Click <strong>Save MikroTik Settings</strong>, then click <strong>⚡ Test Connection</strong>.</li>
            </ol>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: LOCAL / HOME NETWORK SETUP (PC DEVELOPMENT ONLY) ─────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeGuideTab === 'local' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 14,
              padding: '14px 18px',
              color: '#92400E',
            }}
          >
            <strong style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13.5px' }}>
              <span>🏠</span> Note: This tab is ONLY for running the website locally on your computer
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', lineHeight: 1.5 }}>
              If your app is on Vercel, switch to the <strong>&ldquo;☁️ Vercel &amp; Cloud (Global Domain)&rdquo;</strong> tab above. Local IPs like <code>192.168.88.1</code> cannot be reached by Vercel.
            </p>
          </div>

          <div
            style={{
              border: '1px solid #ECEEF2',
              borderRadius: 16,
              padding: '18px 20px',
              background: '#FFFFFF',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
              Connecting from Local PC (Localhost)
            </h4>
            <ol style={{ paddingLeft: 20, marginTop: 10, fontSize: '13px', color: '#4B5563', lineHeight: 1.6 }}>
              <li>Connect your PC directly to the MikroTik Wi-Fi or plug an Ethernet cable into ports 2–5.</li>
              <li>Check your router&apos;s IP address in WinBox: go to <strong>IP ➔ Addresses</strong>. It is usually <code>192.168.88.1</code> or <code>192.168.0.1</code>.</li>
              <li>If you have a VPN running on your computer (like NordVPN / ProTUN), pause it or enable local LAN bypass so local network traffic reaches your router.</li>
              <li>In the form above, set <strong>Router IP</strong> to <code>192.168.88.1</code> (or your bridge IP), enter your user and password, and click <strong>⚡ Test Connection</strong>.</li>
            </ol>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: 1-CLICK TERMINAL SCRIPT (SWITCHABLE CLOUD / LOCAL) ───── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeGuideTab === 'script' && (
        <div>
          {/* Script Type Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                Pre-configured RouterOS Terminal Script
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#71717A' }}>
                Paste into WinBox ➔ <strong>New Terminal</strong> and press Enter.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Cloud vs Local script toggle */}
              <div style={{ background: '#ECEEF2', borderRadius: 999, padding: 3, display: 'flex', gap: 2 }}>
                <button
                  type="button"
                  onClick={() => setScriptMode('cloud')}
                  style={{
                    background: scriptMode === 'cloud' ? '#7257FF' : 'transparent',
                    color: scriptMode === 'cloud' ? '#FFF' : '#71717A',
                    border: 'none',
                    borderRadius: 999,
                    padding: '5px 12px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ☁️ Vercel / Cloud Script
                </button>
                <button
                  type="button"
                  onClick={() => setScriptMode('local')}
                  style={{
                    background: scriptMode === 'local' ? '#7257FF' : 'transparent',
                    color: scriptMode === 'local' ? '#FFF' : '#71717A',
                    border: 'none',
                    borderRadius: 999,
                    padding: '5px 12px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🏠 Local LAN Script
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyScript}
                className="sa-btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 18px',
                  fontSize: '13px',
                }}
              >
                {copiedScript ? '✓ Copied!' : '📋 Copy Script'}
              </button>
            </div>
          </div>

          {/* Script Content */}
          <div
            style={{
              background: '#141417',
              borderRadius: 16,
              padding: '18px 20px',
              color: '#E4E4E7',
              fontFamily: 'monospace',
              fontSize: '12.5px',
              lineHeight: 1.5,
              overflowX: 'auto',
              border: '1px solid #27272A',
              maxHeight: '400px',
            }}
          >
            <pre style={{ margin: 0 }}>{activeScript}</pre>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: '12.5px', color: '#71717A' }}>
            <span>ℹ️</span>
            <span>
              {scriptMode === 'cloud'
                ? `This script configures MikroTik Cloud DDNS, opens port ${routerPort} in firewall, enables REST API, creates ${apiUser}, and sets ${hotspotUrl} redirect.`
                : `This script enables REST API on port ${routerPort}, creates ${apiUser}, and sets ${hotspotUrl} redirect for local testing.`}
            </span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 4: HOTSPOT URL & ZERO-CONFIG USER FLOW ──────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeGuideTab === 'hotspot' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(114,87,255,0.08) 0%, rgba(104,66,237,0.03) 100%)',
              border: '1px solid rgba(114,87,255,0.2)',
              borderRadius: 18,
              padding: 22,
            }}
          >
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#7257FF' }}>
              How the Zero-Configuration Hotspot Flow Works
            </h4>
            <p style={{ fontSize: '13.5px', color: '#4A4A52', marginTop: 6, lineHeight: 1.6 }}>
              Customers no longer need to configure MikroTik or manually type long codes:
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 14,
                marginTop: 18,
              }}
            >
              <div style={{ background: '#FFFFFF', padding: 16, borderRadius: 14, border: '1px solid #ECEEF2' }}>
                <span style={{ fontSize: '20px' }}>1️⃣</span>
                <strong style={{ display: 'block', fontSize: '13.5px', marginTop: 4, color: '#121217' }}>
                  Customer Buys Pass
                </strong>
                <span style={{ fontSize: '12.5px', color: '#71717A' }}>
                  Customer pays with wallet or card. The app calls RouterOS REST API to create user on MikroTik.
                </span>
              </div>

              <div style={{ background: '#FFFFFF', padding: 16, borderRadius: 14, border: '1px solid #ECEEF2' }}>
                <span style={{ fontSize: '20px' }}>2️⃣</span>
                <strong style={{ display: 'block', fontSize: '13.5px', marginTop: 4, color: '#121217' }}>
                  Joins Wi-Fi ({wifiSsid})
                </strong>
                <span style={{ fontSize: '12.5px', color: '#71717A' }}>
                  Customer connects to the Wi-Fi network shown on their pass screen.
                </span>
              </div>

              <div style={{ background: '#FFFFFF', padding: 16, borderRadius: 14, border: '1px solid #ECEEF2' }}>
                <span style={{ fontSize: '20px' }}>3️⃣</span>
                <strong style={{ display: 'block', fontSize: '13.5px', marginTop: 4, color: '#121217' }}>
                  1-Click Auto-Login
                </strong>
                <span style={{ fontSize: '12.5px', color: '#71717A' }}>
                  Customer taps <strong>&ldquo;Connect to Wi-Fi&rdquo;</strong> on their ticket. The app launches:
                  <code style={{ display: 'block', marginTop: 4, color: '#7257FF', fontSize: '11px', wordBreak: 'break-all' }}>
                    http://{hotspotUrl}/login?username=CODE&password=CODE
                  </code>
                </span>
              </div>

              <div style={{ background: '#FFFFFF', padding: 16, borderRadius: 14, border: '1px solid #ECEEF2' }}>
                <span style={{ fontSize: '20px' }}>4️⃣</span>
                <strong style={{ display: 'block', fontSize: '13.5px', marginTop: 4, color: '#121217' }}>
                  Instant Internet Access
                </strong>
                <span style={{ fontSize: '12.5px', color: '#71717A' }}>
                  MikroTik logs in the user and starts their session timer.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
