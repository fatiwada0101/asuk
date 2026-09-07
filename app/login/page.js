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

  // MikroTik passes these query params on captive portal redirect
  const dst = searchParams.get('dst') || '';
  const mac = searchParams.get('mac') || '';
  const ip = searchParams.get('ip') || '';
  const username = searchParams.get('username') || '';

  useEffect(() => {
    // Fetch WiFi SSID from settings
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(data => {
        if (data?.mikrotik?.wifi_ssid) setWifiSsid(data.mikrotik.wifi_ssid);
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Check voucher status
      const statusRes = await fetch(`/api/vouchers/status?code=${encodeURIComponent(code.trim())}`);
      const statusData = await statusRes.json();

      if (!statusRes.ok || !statusData.valid) {
        setError(statusData.error || 'Invalid or expired voucher code');
        setLoading(false);
        return;
      }

      // Voucher is valid — MikroTik hotspot user should already exist
      // Redirect to MikroTik login endpoint to authenticate
      setSuccess(true);

      // Build the MikroTik login URL
      // The hotspot login is at http://<hotspot-dns-name>/login
      // We POST username (code) and password (code) to authenticate
      const loginForm = document.createElement('form');
      loginForm.method = 'POST';
      loginForm.action = window.location.origin + '/login';

      // MikroTik expects these fields
      const fields = {
        username: code.trim(),
        password: code.trim(),
        dst: dst || window.location.origin,
      };

      for (const [key, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        loginForm.appendChild(input);
      }

      document.body.appendChild(loginForm);

      // Small delay to show success message, then submit
      setTimeout(() => {
        loginForm.submit();
      }, 1500);

    } catch (err) {
      setError('Network error — please try again');
      setLoading(false);
    }
  };

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
        maxWidth: 400,
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '40px 32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Logo & Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {logoUrl && (
            <img src={logoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 16, marginBottom: 16 }} />
          )}
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28,
          }}>
            {String.fromCodePoint(0x1F4F6)}
          </div>
          <h1 style={{
            color: '#fff', fontSize: '22px', fontWeight: 800, margin: '0 0 6px',
            letterSpacing: '-0.3px',
          }}>
            {appName || 'Wi-Fi Login'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
            {wifiSsid ? `Connected to ${wifiSsid}` : 'Enter your voucher code to connect'}
          </p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: 28,
            }}>
              {String.fromCodePoint(0x2705)}
            </div>
            <h2 style={{ color: '#22c55e', fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>
              Connected!
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
              Redirecting you to the internet...
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '12px',
                fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                Voucher Code
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Enter your code"
                autoFocus
                autoComplete="off"
                style={{
                  width: '100%', padding: '14px 18px', fontSize: '18px', fontWeight: 700,
                  background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)',
                  borderRadius: 14, color: '#fff', outline: 'none', textAlign: 'center',
                  letterSpacing: '3px', fontFamily: 'monospace',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#22c55e'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
                color: '#f87171', fontSize: '12.5px', marginBottom: 16, textAlign: 'center',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              style={{
                width: '100%', padding: '14px', fontSize: '15px', fontWeight: 800,
                background: loading ? '#555' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff', border: 'none', borderRadius: 14, cursor: loading ? 'wait' : 'pointer',
                letterSpacing: '0.3px',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(34,197,94,0.3)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Connecting...' : 'Connect to Internet'}
            </button>
          </form>
        )}

        {/* Buy Voucher Link */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', margin: '0 0 8px' }}>
            {"Don't have a voucher?"}
          </p>
          <a
            href="/packages"
            style={{
              color: '#7257FF', fontSize: '13px', fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Buy a Data Plan
          </a>
        </div>

        {/* Device Info */}
        {(mac || ip) && (
          <div style={{
            marginTop: 20, padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)', borderRadius: 10,
            fontSize: '11px', color: 'rgba(255,255,255,0.25)', textAlign: 'center',
          }}>
            {mac && <span>MAC: {mac}</span>}
            {mac && ip && <span> &bull; </span>}
            {ip && <span>IP: {ip}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
