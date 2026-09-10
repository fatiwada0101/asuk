'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBranding } from '../context/BrandingContext';

/**
 * /login — Captive Portal Login Page
 * MikroTik redirects unauthenticated users here.
 * User enters their voucher code, and we authenticate them on the MikroTik.
 */
export default function CaptiveLoginWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0a' }} />}>
      <CaptiveLoginPage />
    </Suspense>
  );
}

function CaptiveLoginPage() {
  const searchParams = useSearchParams();
  const { appName, logoUrl } = useBranding();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [wifiSsid, setWifiSsid] = useState('');
  const [hotspotUrl, setHotspotUrl] = useState('');
  const [autoConnecting, setAutoConnecting] = useState(false);

  // MikroTik passes these query params on captive portal redirect
  const dst = searchParams.get('dst') || '';
  const mac = searchParams.get('mac') || '';
  const ip = searchParams.get('ip') || '';
  const linkLoginOnly = searchParams.get('link-login-only') || searchParams.get('link_login_only') || searchParams.get('link-login') || '';
  const username = searchParams.get('username') || searchParams.get('code') || '';
  const password = searchParams.get('password') || '';

  useEffect(() => {
    // Fetch WiFi SSID and hotspot URL from public settings
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(data => {
        if (data?.mikrotik?.wifi_ssid) setWifiSsid(data.mikrotik.wifi_ssid);
        if (data?.mikrotik?.hotspot_url) setHotspotUrl(data.mikrotik.hotspot_url);
      })
      .catch(() => {});
  }, []);

  // Determine target MikroTik login action URL
  const getMikrotikLoginTarget = () => {
    if (linkLoginOnly) return linkLoginOnly;
    if (hotspotUrl) {
      const cleanHotspot = hotspotUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      return `http://${cleanHotspot}/login`;
    }
    return 'http://10.0.0.1/login';
  };

  // Submit credentials to MikroTik Hotspot via hidden iframe first,
  // then fall back to full-page form POST if the iframe approach succeeds.
  // This prevents 501/error responses from MikroTik from replacing the entire page.
  const submitToMikrotik = (voucherCode) => {
    const cleanCode = (voucherCode || '').trim();
    const targetUrl = getMikrotikLoginTarget();
    const returnDst = dst || (typeof window !== 'undefined' ? `${window.location.origin}/status?code=${encodeURIComponent(cleanCode)}` : '');

    // Create a hidden iframe to absorb any error responses from MikroTik
    const iframeName = `mikrotik_login_${Date.now()}`;
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    // Form POST is standard for MikroTik Hotspot captive portal authentication
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${targetUrl}?username=${encodeURIComponent(cleanCode)}&password=${encodeURIComponent(cleanCode)}`;
    form.target = iframeName;
    form.style.display = 'none';

    const fields = {
      username: cleanCode,
      password: cleanCode,
      dst: returnDst,
    };

    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }

    document.body.appendChild(form);

    // Track whether the iframe loaded successfully
    let iframeLoaded = false;

    iframe.onload = () => {
      iframeLoaded = true;
      // MikroTik usually redirects on success — try navigating to the status page
      // If we get here, the form POST was accepted (even if MikroTik returned an error page)
      try {
        // Try to check if the iframe contains an error page
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const iframeText = iframeDoc?.body?.innerText || '';

        if (iframeText.includes('501') || iframeText.includes('Not Implemented') || iframeText.includes('Error')) {
          // MikroTik returned an error — show error on our page instead
          setError('Router authentication failed. The voucher was validated but the router rejected the login. Please try again or contact support.');
          setSuccess(false);
          setLoading(false);
          setAutoConnecting(false);
          // Clean up
          setTimeout(() => {
            iframe.remove();
            form.remove();
          }, 500);
          return;
        }
      } catch (e) {
        // Cross-origin iframe — we can't read it, which is actually fine.
        // MikroTik responded (no 501 crash), so the login likely succeeded.
      }

      // Login succeeded or MikroTik handled it — redirect to dst or status page
      setTimeout(() => {
        if (returnDst && returnDst.startsWith('http')) {
          window.location.href = returnDst;
        } else {
          window.location.href = `/status?code=${encodeURIComponent(cleanCode)}`;
        }
      }, 800);
    };

    iframe.onerror = () => {
      // Iframe failed to load entirely — router unreachable
      setError('Could not reach the Wi-Fi router. Please make sure you are connected to the Wi-Fi network and try again.');
      setSuccess(false);
      setLoading(false);
      setAutoConnecting(false);
      iframe.remove();
      form.remove();
    };

    form.submit();

    // Safety timeout: if iframe doesn't load within 10 seconds,
    // fall back to direct form POST (full page navigation)
    setTimeout(() => {
      if (!iframeLoaded) {
        // Remove iframe approach and do direct form POST as last resort
        iframe.remove();
        form.target = '';
        form.submit();
      }
    }, 10000);
  };

  // Auto-fill code from URL (from checkout redirect) — but do NOT auto-submit.
  // The user must click "Connect" to start their session.
  useEffect(() => {
    if (username) {
      setCode(username);
      // Do NOT auto-connect — let user click the button when ready
    }
  }, [username]);

  const performLogin = async (voucherCode) => {
    const clean = (voucherCode || '').trim();
    if (!clean) return;

    setLoading(true);
    setError('');

    try {
      // Validate voucher via dedicated validation endpoint
      const validateRes = await fetch(`/api/vouchers/validate?code=${encodeURIComponent(clean)}`);

      // Handle non-JSON responses (e.g., HTML error pages from Vercel/Next.js)
      let validateData;
      const contentType = validateRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        validateData = await validateRes.json();
      } else {
        // Non-JSON response — likely an infrastructure error
        const text = await validateRes.text();
        console.error('Non-JSON response from validate API:', validateRes.status, text.substring(0, 200));
        validateData = {
          valid: false,
          error: `Server error (${validateRes.status}). Please try again in a moment.`,
        };
      }

      if (!validateRes.ok || !validateData.valid) {
        // Show the specific error message from the API
        let errorMessage = validateData.error || 'Invalid or expired voucher code. Please check and try again.';

        // Add helpful context based on status codes
        if (validateData.is_expired) {
          errorMessage = validateData.error || 'This voucher has expired. Please purchase a new plan.';
        } else if (validateRes.status === 404) {
          errorMessage = validateData.error || 'This voucher code was not found. Please double-check your code.';
        } else if (validateRes.status >= 500) {
          errorMessage = 'Server error while validating your voucher. Please try again in a moment.';
        }

        setError(errorMessage);
        setLoading(false);
        setAutoConnecting(false);
        return;
      }

      setSuccess(true);

      // Submit credentials to MikroTik Hotspot engine after brief visual feedback
      setTimeout(() => {
        submitToMikrotik(clean);
      }, 1000);
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error — please check your connection and try again.');
      setLoading(false);
      setAutoConnecting(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    performLogin(code);
  };

  // Construct URL for buying package, preserving router captive params
  const buyPackageUrl = (() => {
    const p = new URLSearchParams();
    if (mac) p.set('mac', mac);
    if (ip) p.set('ip', ip);
    if (linkLoginOnly) p.set('link_login_only', linkLoginOnly);
    if (dst) p.set('dst', dst);
    const qs = p.toString();

    // Dynamically stay on current domain (works locally, in production, and for any cloned deployment)
    if (typeof window !== 'undefined') {
      return qs ? `${window.location.origin}/packages?${qs}` : `${window.location.origin}/packages`;
    }
    return qs ? `/packages?${qs}` : '/packages';
  })();


  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '36px 28px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Logo & Title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 16, marginBottom: 14 }} />
          ) : (
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px', fontSize: 26,
              boxShadow: '0 8px 24px rgba(34,197,94,0.35)',
            }}>
              {String.fromCodePoint(0x1F4F6)}
            </div>
          )}
          <h1 style={{
            color: '#fff', fontSize: '22px', fontWeight: 800, margin: '0 0 6px',
            letterSpacing: '-0.3px',
          }}>
            {appName || 'Wi-Fi Login Portal'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', margin: 0 }}>
            {wifiSsid ? `Connected to ${wifiSsid}` : 'Enter your voucher code to connect'}
          </p>
        </div>

        {/* Auto-Connecting / Success State */}
        {success ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)',
              border: '2px solid rgba(34,197,94,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: 28,
            }}>
              {String.fromCodePoint(0x2705)}
            </div>
            <h2 style={{ color: '#22c55e', fontSize: '19px', fontWeight: 800, margin: '0 0 6px' }}>
              Connected & Authenticated!
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: '0 0 16px' }}>
              Submitting session to router... Granting internet access.
            </p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 999,
              background: 'rgba(34,197,94,0.1)', color: '#22c55e',
              fontSize: '12px', fontWeight: 600,
            }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
              Active Hotspot Session
            </div>
          </div>
        ) : autoConnecting ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.1)',
              borderTop: '3px solid #22c55e',
              margin: '0 auto 16px',
              animation: 'spin 1s linear infinite',
            }} />
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>
              Auto-Authenticating...
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '0 0 12px' }}>
              Logging in with voucher code <strong style={{ color: '#22c55e', fontFamily: 'monospace' }}>{code}</strong>
            </p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: '12px',
                fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.6px',
              }}>
                Voucher Code
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="ASUK-XXXX"
                autoFocus
                autoComplete="off"
                style={{
                  width: '100%', padding: '14px 18px', fontSize: '18px', fontWeight: 800,
                  background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)',
                  borderRadius: 14, color: '#fff', outline: 'none', textAlign: 'center',
                  letterSpacing: '2px', fontFamily: 'monospace',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#22c55e'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
              />
            </div>

            {error && (
              <div style={{
                padding: '11px 14px', background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12,
                color: '#f87171', fontSize: '12.5px', marginBottom: 16, textAlign: 'center',
                lineHeight: 1.4,
              }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              style={{
                width: '100%', padding: '15px', fontSize: '15px', fontWeight: 800,
                background: loading ? '#555' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff', border: 'none', borderRadius: 14, cursor: loading ? 'wait' : 'pointer',
                letterSpacing: '0.3px',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(34,197,94,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Connecting to Router...' : '⚡ Connect to Internet'}
            </button>
          </form>
        )}

        {/* Buy Voucher Link */}
        <div style={{
          textAlign: 'center', marginTop: 22, paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 8px' }}>
            {"Don't have an active voucher?"}
          </p>
          <a
            href={buyPackageUrl}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: '#7257FF', fontSize: '13.5px', fontWeight: 800,
              textDecoration: 'none', padding: '8px 16px',
              background: 'rgba(114,87,255,0.12)', borderRadius: 10,
              border: '1px solid rgba(114,87,255,0.25)',
              transition: 'background 0.2s',
            }}
          >
            🛒 Buy a Data Plan Online →
          </a>
        </div>

        {/* Device & Network Details */}
        <div style={{
          marginTop: 18, padding: '10px 14px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 10,
          fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center',
          lineHeight: 1.5,
        }}>
          {mac && <span>MAC: <strong style={{ color: 'rgba(255,255,255,0.5)' }}>{mac}</strong> </span>}
          {mac && ip && <span>• </span>}
          {ip && <span>IP: <strong style={{ color: 'rgba(255,255,255,0.5)' }}>{ip}</strong> </span>}
          <div>Portal: <strong style={{ color: 'rgba(255,255,255,0.5)' }}>{hotspotUrl}</strong></div>
        </div>
      </div>
    </div>
  );
}


