'use client';

import { useState } from 'react';

/**
 * MikroTik WinBox Setup & Connection Guide
 * Detailed step-by-step tutorial for connecting RouterOS v7+ to Asuk Tech,
 * configuring REST API, creating users, and setting up Hotspot DNS redirect URLs.
 */
export default function MikroTikSetupGuide({ mikrotikForm = {}, onSyncRouter, isSyncing = false }) {
  const [activeGuideTab, setActiveGuideTab] = useState('winbox'); // 'winbox' | 'script' | 'hotspot'
  const [copiedScript, setCopiedScript] = useState(false);
  const [expandedStep, setExpandedStep] = useState(1);

  const routerIp = mikrotikForm.ip || '192.168.88.1';
  const routerPort = mikrotikForm.port || '443';
  const apiUser = mikrotikForm.user || 'asuk_api';
  const apiPass = mikrotikForm.pass || 'YourStrongPassword123!';
  const hotspotUrl = (mikrotikForm.hotspot_url || 'asuktech.net').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const wifiSsid = mikrotikForm.wifi_ssid || 'Asuk Tech Wi-Fi';
  const useSsl = mikrotikForm.use_ssl !== false;

  // Auto-generated RouterOS CLI Script
  const terminalScript = `# ================================================================
# ASUK TECH — 1-CLICK MIKROTIK ROUTEROS v7 CONFIGURATION SCRIPT
# Generated for: ${wifiSsid} | Portal URL: ${hotspotUrl}
# Paste directly into WinBox -> New Terminal
# ================================================================

# 1. Enable RouterOS v7 REST API Service (${useSsl ? 'HTTPS Port ' + routerPort : 'HTTP Port ' + routerPort})
${useSsl ? `/ip service set www-ssl port=${routerPort} disabled=no` : `/ip service set www port=${routerPort} disabled=no`}
/ip service set www port=80 disabled=no

# 2. Create Dedicated REST API Service Account
/user add name="${apiUser}" password="${apiPass}" group=full comment="Asuk Tech Cloud API Integration"

# 3. Configure Hotspot Server Profile & Captive Portal DNS Redirect URL
# Sets "${hotspotUrl}" so users are redirected and auto-logged in
/ip hotspot profile set [find default=yes] dns-name="${hotspotUrl}" login-by=cookie,http-chap,http-pap
/ip hotspot profile set [find name="hsprof1"] dns-name="${hotspotUrl}" login-by=cookie,http-chap,http-pap

# 4. Optional: Enable MikroTik Cloud Dynamic DNS (DDNS for Remote Access)
/ip cloud set ddns-enabled=yes

# 5. Verify Configuration
/ip service print where name="www-ssl" or name="www"
/user print where name="${apiUser}"
/ip hotspot profile print
`;

  const handleCopyScript = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(terminalScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    }
  };

  return (
    <div className="sa-glass-card" style={{ marginTop: 24, border: '1px solid rgba(114, 87, 255, 0.28)' }}>
      {/* Header */}
      <div className="sa-card-header" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '24px' }}>📡</span>
            <div>
              <h3 className="sa-card-title" style={{ fontSize: '18px' }}>
                MikroTik WinBox Setup & Connection Tutorial
              </h3>
              <p className="sa-card-sub">
                Step-by-step visual scenario for connecting your router, setting credentials, and configuring <code style={{ color: '#7257FF', fontWeight: 700 }}>{hotspotUrl}</code>
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
      <div style={{
        display: 'flex',
        gap: 8,
        borderBottom: '1px solid #ECEEF2',
        paddingBottom: 14,
        marginBottom: 20,
        overflowX: 'auto',
      }}>
        <button
          onClick={() => setActiveGuideTab('winbox')}
          style={{
            background: activeGuideTab === 'winbox' ? '#7257FF' : '#F4F5F8',
            color: activeGuideTab === 'winbox' ? '#FFF' : '#4A4A52',
            border: 'none',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🖥️ WinBox UI Click-by-Click Guide
        </button>

        <button
          onClick={() => setActiveGuideTab('script')}
          style={{
            background: activeGuideTab === 'script' ? '#7257FF' : '#F4F5F8',
            color: activeGuideTab === 'script' ? '#FFF' : '#4A4A52',
            border: 'none',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          ⚡ 1-Click Terminal Script
        </button>

        <button
          onClick={() => setActiveGuideTab('hotspot')}
          style={{
            background: activeGuideTab === 'hotspot' ? '#7257FF' : '#F4F5F8',
            color: activeGuideTab === 'hotspot' ? '#FFF' : '#4A4A52',
            border: 'none',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🌐 Hotspot URL & Zero-Config Flow
        </button>
      </div>

      {/* ── TAB 1: WINBOX UI CLICK-BY-CLICK GUIDE ── */}
      {activeGuideTab === 'winbox' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Step 1: Enable REST API in WinBox */}
          <div style={{
            border: '1px solid #ECEEF2',
            borderRadius: 16,
            padding: '18px 20px',
            background: expandedStep === 1 ? 'rgba(114, 87, 255, 0.03)' : '#FFFFFF',
            transition: 'all 0.2s',
          }}>
            <div
              onClick={() => setExpandedStep(expandedStep === 1 ? null : 1)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
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
                }}>1</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                    Enable REST API Web Service in WinBox
                  </h4>
                  <span style={{ fontSize: '12px', color: '#71717A' }}>
                    WinBox Navigation: <strong>IP ➔ Services ➔ www-ssl (or www)</strong>
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '18px', color: '#8E8E93' }}>{expandedStep === 1 ? '▲' : '▼'}</span>
            </div>

            {expandedStep === 1 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ECEEF2', fontSize: '13.5px', color: '#4A4A52', lineHeight: 1.6 }}>
                <p>RouterOS v7 provides a high-performance native REST API built directly into the web management services.</p>
                <ol style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>Open <strong>WinBox</strong> and connect to your MikroTik router (via MAC Address or IP).</li>
                  <li>In the left menu sidebar, click <strong>IP</strong>, then click <strong>Services</strong>.</li>
                  <li>Locate <strong>www-ssl</strong> (recommended for secure port <code>443</code>) or <strong>www</strong> (for HTTP port <code>80</code>).</li>
                  <li>If it is disabled (grayed out with an <code>X</code> icon), select it and click the <strong>Blue Checkmark (✓)</strong> at the top to enable it.</li>
                  <li>Double-click <strong>www-ssl</strong> to verify:
                    <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                      <li><strong>Port</strong>: set to <code>{routerPort}</code> (matching the port in the form above).</li>
                      <li><strong>Certificate</strong>: select an installed certificate, or leave default. (Our app supports self-signed certificates out-of-the-box).</li>
                    </ul>
                  </li>
                  <li>Click <strong>Apply</strong> and <strong>OK</strong>.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Step 2: Create API User & Password */}
          <div style={{
            border: '1px solid #ECEEF2',
            borderRadius: 16,
            padding: '18px 20px',
            background: expandedStep === 2 ? 'rgba(114, 87, 255, 0.03)' : '#FFFFFF',
            transition: 'all 0.2s',
          }}>
            <div
              onClick={() => setExpandedStep(expandedStep === 2 ? null : 2)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
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
                }}>2</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                    Create Dedicated REST API User & Password
                  </h4>
                  <span style={{ fontSize: '12px', color: '#71717A' }}>
                    WinBox Navigation: <strong>System ➔ Users ➔ Add (+)</strong>
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '18px', color: '#8E8E93' }}>{expandedStep === 2 ? '▲' : '▼'}</span>
            </div>

            {expandedStep === 2 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ECEEF2', fontSize: '13.5px', color: '#4A4A52', lineHeight: 1.6 }}>
                <p>To avoid using the default <code>admin</code> user and maintain audit logs, create a dedicated API user:</p>
                <ol style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>In the WinBox left menu, click <strong>System</strong>, then click <strong>Users</strong>.</li>
                  <li>Click the blue <strong>+ (Add)</strong> button.</li>
                  <li><strong>Name</strong>: Enter <code style={{ fontWeight: 700, color: '#7257FF' }}>{apiUser}</code> (or your preferred username).</li>
                  <li><strong>Group</strong>: Select <code style={{ fontWeight: 700 }}>full</code> (this grants the required REST permissions to add vouchers, query active users, and manage speed profiles).</li>
                  <li><strong>Password</strong>: Enter a strong password and repeat it in <strong>Confirm Password</strong>.</li>
                  <li>Click <strong>Apply</strong> and <strong>OK</strong>.</li>
                  <li>Enter the exact same <strong>Username</strong> and <strong>Password</strong> in the Asuk Tech settings form above and click <strong>Save Configuration</strong>.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Step 3: Configure Hotspot Server Profile & URL */}
          <div style={{
            border: '1px solid #ECEEF2',
            borderRadius: 16,
            padding: '18px 20px',
            background: expandedStep === 3 ? 'rgba(114, 87, 255, 0.03)' : '#FFFFFF',
            transition: 'all 0.2s',
          }}>
            <div
              onClick={() => setExpandedStep(expandedStep === 3 ? null : 3)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
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
                }}>3</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                    Configure Hotspot Server Profile & DNS Redirect URL ({hotspotUrl})
                  </h4>
                  <span style={{ fontSize: '12px', color: '#71717A' }}>
                    WinBox Navigation: <strong>IP ➔ Hotspot ➔ Server Profiles</strong>
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '18px', color: '#8E8E93' }}>{expandedStep === 3 ? '▲' : '▼'}</span>
            </div>

            {expandedStep === 3 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ECEEF2', fontSize: '13.5px', color: '#4A4A52', lineHeight: 1.6 }}>
                <p>
                  Setting the <strong>DNS Name</strong> on the Hotspot Server Profile allows captive portal redirection to your custom domain (e.g. <code>{hotspotUrl}</code>).
                </p>
                <ol style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>In WinBox, click <strong>IP</strong>, then click <strong>Hotspot</strong>.</li>
                  <li>Click on the <strong>Server Profiles</strong> tab.</li>
                  <li>Double-click your active server profile (usually <code>hsprof1</code> or <code>default</code>).</li>
                  <li>In the <strong>General</strong> tab:
                    <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                      <li><strong>Hotspot Address</strong>: set to your router LAN gateway (e.g. <code>192.168.88.1</code>).</li>
                      <li><strong>DNS Name</strong>: enter <code style={{ fontWeight: 700, color: '#7257FF' }}>{hotspotUrl}</code>.</li>
                    </ul>
                  </li>
                  <li>Click on the <strong>Login</strong> tab:
                    <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                      <li>Ensure <strong>HTTP PAP</strong> and <strong>HTTP CHAP</strong> are both <strong>CHECKED</strong>. (HTTP PAP is required so the app can auto-login users with 1-click links).</li>
                    </ul>
                  </li>
                  <li>Click <strong>Apply</strong> and <strong>OK</strong>.</li>
                </ol>
                <div style={{ background: '#F0EFFE', borderRadius: 12, padding: '10px 14px', marginTop: 12, border: '1px solid rgba(114,87,255,0.2)' }}>
                  💡 <strong>Tip:</strong> You can click the <strong>⚡ Push {hotspotUrl} to Router</strong> button at the top of this guide to apply this directly via REST API without opening WinBox!
                </div>
              </div>
            )}
          </div>

          {/* Step 4: IP Address & Remote Access (Cloud/Local) */}
          <div style={{
            border: '1px solid #ECEEF2',
            borderRadius: 16,
            padding: '18px 20px',
            background: expandedStep === 4 ? 'rgba(114, 87, 255, 0.03)' : '#FFFFFF',
            transition: 'all 0.2s',
          }}>
            <div
              onClick={() => setExpandedStep(expandedStep === 4 ? null : 4)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
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
                }}>4</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                    Network Reachability: Local Subnet vs. Cloud Deployment
                  </h4>
                  <span style={{ fontSize: '12px', color: '#71717A' }}>
                    Deciding whether to use LAN IP or MikroTik Cloud DDNS
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '18px', color: '#8E8E93' }}>{expandedStep === 4 ? '▲' : '▼'}</span>
            </div>

            {expandedStep === 4 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ECEEF2', fontSize: '13.5px', color: '#4A4A52', lineHeight: 1.6 }}>
                <p>How the app communicates with the router depends on where this dashboard is hosted:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 10 }}>
                  <div style={{ background: '#F8F9FA', padding: 14, borderRadius: 12, border: '1px solid #ECEEF2' }}>
                    <strong style={{ color: '#121217' }}>🏠 Local / On-Premise Server:</strong>
                    <p style={{ fontSize: '12.5px', marginTop: 4 }}>
                      If this app runs on a local computer, Raspberry Pi, or local VM connected to the MikroTik Wi-Fi or LAN switch, simply use:
                      <br /><code>Router IP: 192.168.88.1</code> (or your bridge IP).
                    </p>
                  </div>

                  <div style={{ background: '#F8F9FA', padding: 14, borderRadius: 12, border: '1px solid #ECEEF2' }}>
                    <strong style={{ color: '#121217' }}>☁️ Cloud / Vercel Deployment:</strong>
                    <p style={{ fontSize: '12.5px', marginTop: 4 }}>
                      If this app runs in the cloud, the cloud server needs to reach your router:
                      <br /><strong>Option A (MikroTik Cloud DDNS)</strong>: In WinBox ➔ <code>IP</code> ➔ <code>Cloud</code> ➔ Check <code>DDNS Enabled</code> ➔ click <strong>Apply</strong>. Enter the generated DNS name in the IP box.
                      <br /><strong>Option B (Port Forwarding)</strong>: Forward port 443 on your ISP modem to the MikroTik WAN IP.
                    </p>
                  </div>
                </div>

                {/* What to do if IP -> Cloud DNS Name is empty */}
                <div style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginTop: 14,
                  fontSize: '12.5px',
                  color: '#92400E',
                  lineHeight: 1.5,
                }}>
                  <strong style={{ display: 'block', marginBottom: 4, fontSize: '13px' }}>
                    ❓ Why is the &ldquo;DNS Name&rdquo; in IP ➔ Cloud empty or blank?
                  </strong>
                  If the DNS Name field is completely blank or stays at <em>&ldquo;connecting...&rdquo;</em>, check these common reasons:
                  <ol style={{ paddingLeft: 18, marginTop: 6, marginBottom: 6 }}>
                    <li><strong>Did you click &ldquo;Apply&rdquo;?</strong> RouterOS will NOT generate the name until you check <strong>DDNS Enabled</strong> and then click the <strong>Apply</strong> button at the top/bottom!</li>
                    <li><strong>Router WAN Internet:</strong> Your router must be connected to working internet and have DNS servers configured in <code>IP ➔ DNS</code> (e.g. <code>8.8.8.8</code>). MikroTik contacts <code>cloud.mikrotik.com</code> to register the serial number.</li>
                    <li><strong>Virtual Machine / CHR vs Physical Router:</strong> If running RouterOS on a PC or VM (CHR / x86), Cloud DDNS is unavailable because it requires physical RouterBOARD hardware serial numbers.</li>
                    <li><strong>Testing Locally? You don&apos;t need Cloud DDNS!</strong> If you are testing from your PC, simply check your router&apos;s real local IP in WinBox: go to <strong>IP ➔ Addresses</strong> (e.g. <code>192.168.0.x</code> or <code>192.168.88.1</code>) and enter that IP in the router settings above!</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: 1-CLICK TERMINAL SCRIPT ── */}
      {activeGuideTab === 'script' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#121217' }}>
                Pre-configured RouterOS CLI Script
              </h4>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#71717A' }}>
                Auto-generated using your inputs. Simply open <strong>WinBox ➔ New Terminal</strong>, paste, and press Enter.
              </p>
            </div>

            <button
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
              {copiedScript ? '✓ Copied to Clipboard!' : '📋 Copy Terminal Script'}
            </button>
          </div>

          <div style={{
            background: '#141417',
            borderRadius: 16,
            padding: '18px 20px',
            color: '#E4E4E7',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: 1.5,
            overflowX: 'auto',
            border: '1px solid #27272A',
            maxHeight: '380px',
          }}>
            <pre style={{ margin: 0 }}>{terminalScript}</pre>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: '12.5px', color: '#71717A' }}>
            <span>ℹ️</span>
            <span>
              This script enables REST API on port {routerPort}, creates the <code>{apiUser}</code> service user, configures <code>{hotspotUrl}</code> on all hotspot server profiles, and tests service readiness.
            </span>
          </div>
        </div>
      )}

      {/* ── TAB 3: HOTSPOT URL & ZERO-CONFIG USER FLOW ── */}
      {activeGuideTab === 'hotspot' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(114,87,255,0.08) 0%, rgba(104,66,237,0.03) 100%)',
            border: '1px solid rgba(114,87,255,0.2)',
            borderRadius: 18,
            padding: 22,
          }}>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#7257FF' }}>
              How the Zero-Configuration Hotspot Flow Works
            </h4>
            <p style={{ fontSize: '13.5px', color: '#4A4A52', marginTop: 6, lineHeight: 1.6 }}>
              Customers no longer need to navigate complicated router setup screens or manually type long voucher codes. Here is the seamless journey:
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
              marginTop: 18,
            }}>
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
                  Customer taps <strong>"Connect to Wi-Fi"</strong> on their ticket. The app launches:
                  <code style={{ display: 'block', marginTop: 4, color: '#7257FF', fontSize: '11px', wordBreak: 'break-all' }}>
                    http://{hotspotUrl}/login?username=CODE&password=CODE
                  </code>
                </span>
              </div>

              <div style={{ background: '#FFFFFF', padding: 16, borderRadius: 14, border: '1px solid #ECEEF2' }}>
                <span style={{ fontSize: '20px' }}>4️⃣</span>
                <strong style={{ display: 'block', fontSize: '13.5px', marginTop: 4, color: '#121217' }}>
                  Online in 1 Second!
                </strong>
                <span style={{ fontSize: '12.5px', color: '#71717A' }}>
                  MikroTik Hotspot consumes the query parameters and authenticates the device immediately. No typing required!
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: '#F8F9FA', padding: 16, borderRadius: 14, border: '1px solid #ECEEF2' }}>
            <span style={{ fontSize: '22px' }}>💡</span>
            <div style={{ fontSize: '13px', color: '#4A4A52' }}>
              <strong>Customizing your Hotspot Domain:</strong> You can change <code>{hotspotUrl}</code> to any domain you own (e.g. <code>wifi.yourdomain.com</code> or <code>login.net</code>). Just enter it in the <strong>Hotspot URL / Domain</strong> field above and click <strong>Save Configuration</strong>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
