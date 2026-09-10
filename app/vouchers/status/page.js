'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import BottomNav from '../../components/BottomNav';
import ReceiptModal from '../../components/ReceiptModal';
import {
  ChevronLeftIcon,
  WifiIcon,
  ClockIcon,
  ArrowUpRightIcon,
  CheckIcon,
  RefreshIcon,
  ZapIcon,
  ReceiptIcon,
} from '../../components/Icons';


function VoucherStatusContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') || '';
  const { user } = useAuth();
  const { appName } = useBranding();

  const [voucherCode, setVoucherCode] = useState(initialCode);
  const [inputCode, setInputCode] = useState(initialCode);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [toast, setToast] = useState('');
  const [networkInfo, setNetworkInfo] = useState({
    hotspot_url: 'asuktech.net',
    wifi_ssid: 'Asuk Tech Wi-Fi',
  });

  // Fetch hotspot URL and Wi-Fi SSID
  useEffect(() => {
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(d => {
        if (d?.mikrotik) {
          setNetworkInfo({
            hotspot_url: d.mikrotik.hotspot_url || 'asuktech.net',
            wifi_ssid: d.mikrotik.wifi_ssid || 'Asuk Tech Wi-Fi',
          });
        }
      })
      .catch(() => {});
  }, []);

  // Client-side ticking countdown (ticks every 1 second)
  const [localSecondsRemaining, setLocalSecondsRemaining] = useState(null);
  const lastSyncTimeRef = useRef(Date.now());

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // If no code is in URL, try reading from localStorage
  useEffect(() => {
    if (!voucherCode && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('asuk_active_voucher');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.code) {
            setVoucherCode(parsed.code);
            setInputCode(parsed.code);
          }
        }
      } catch (e) {}
    }
  }, [voucherCode]);

  // Fetch status from API
  const fetchStatus = useCallback(async (codeToFetch) => {
    const target = (codeToFetch || voucherCode).trim();
    if (!target) return;

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/vouchers/status?code=${encodeURIComponent(target)}`);
      const json = await res.json();

      if (res.ok && json.success) {
        setData(json);
        setLocalSecondsRemaining(Math.max(0, Number(json.seconds_remaining) || 0));
        lastSyncTimeRef.current = Date.now();
      } else {
        setError(json.error || 'Could not find voucher details');
      }
    } catch (err) {
      setError('Network error checking voucher status');
    } finally {
      setLoading(false);
    }
  }, [voucherCode]);

  useEffect(() => {
    if (voucherCode) {
      fetchStatus(voucherCode);
    }
  }, [voucherCode, fetchStatus]);

  // Auto-sync with router every 15 seconds
  useEffect(() => {
    if (!voucherCode) return;
    const pollInterval = setInterval(() => {
      fetchStatus(voucherCode);
    }, 15000);
    return () => clearInterval(pollInterval);
  }, [voucherCode, fetchStatus]);

  // Local second-by-second countdown ticker — re-starts on each server sync
  const tickerRef = useRef(null);
  useEffect(() => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }

    // Do NOT tick down if the voucher has not been used yet (not connected, uptime is 0, not is_used)
    const isUnused = !data?.is_connected && (!data?.is_used && (data?.uptime_seconds === 0 || !data?.uptime_seconds));
    if (isUnused) {
      return;
    }

    tickerRef.current = setInterval(() => {
      setLocalSecondsRemaining((prev) => {
        if (prev === null || prev <= 0) {
          if (tickerRef.current) {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
          }
          return 0;
        }
        return Math.max(0, prev - 1);
      });
    }, 1000);

    return () => {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };
  }, [data]); // re-start only when server syncs new data

  const handleSearchCode = (e) => {
    e.preventDefault();
    if (inputCode.trim()) {
      setVoucherCode(inputCode.trim().toUpperCase());
      router.replace(`/vouchers/status?code=${encodeURIComponent(inputCode.trim().toUpperCase())}`);
    }
  };

  const copyCode = () => {
    if (data?.code) {
      navigator.clipboard.writeText(data.code);
      setCopied(true);
      showToast(`Voucher PIN ${data.code} copied!`);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format seconds into HH:MM:SS
  const formatCountdown = (secs) => {
    if (secs === null || secs === undefined) return '--:--:--';
    if (secs <= 0) return '00:00:00';
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;

    if (d > 0) {
      return `${d}d ${h}h ${m}m ${s}s`;
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const totalSecs = data?.limit_uptime_seconds || 86400;
  const currentRemaining = localSecondsRemaining !== null ? localSecondsRemaining : (data?.seconds_remaining || 0);
  const percentLeft = Math.max(0, Math.min(100, Math.round((currentRemaining / totalSecs) * 100)));
  const isUnused = !data?.is_connected && (!data?.is_used && (data?.uptime_seconds === 0 || !data?.uptime_seconds));
  const isExpired = !isUnused && currentRemaining <= 0;
  const isExpiringSoon = !isExpired && !isUnused && (currentRemaining < 1800 || percentLeft <= 25);

  // Status color badge
  const statusColor = isExpired ? '#EF4444' : isExpiringSoon ? '#F59E0B' : '#10B981';
  const statusBg = isExpired ? 'rgba(239, 68, 68, 0.12)' : isExpiringSoon ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)';
  const statusLabel = isExpired ? 'Pass Expired' : isExpiringSoon ? 'Expiring Soon' : data?.is_connected ? 'Connected & Active' : (isUnused ? 'Ready to Connect' : 'Pass Ready');

  return (
    <div className="app-shell">
      {/* ── Screen Topbar ── */}
      <div className="screen-topbar">
        <button
          className="circle-icon-btn"
          onClick={() => router.push('/')}
          aria-label="Back to home"
        >
          <ChevronLeftIcon size={20} color="#121217" />
        </button>

        <h1 className="screen-title">Live Pass Tracker</h1>

        <button
          className="circle-icon-btn"
          onClick={() => fetchStatus(voucherCode)}
          disabled={loading}
          aria-label="Refresh telemetry"
          title="Refresh router telemetry"
        >
          <RefreshIcon size={18} color="#121217" />
        </button>
      </div>

      {/* ── Code Switcher / Input ── */}
      <form onSubmit={handleSearchCode} style={{ marginBottom: 18 }}>
        <div style={{
          display: 'flex',
          gap: 8,
          background: '#FFFFFF',
          padding: '6px 8px 6px 14px',
          borderRadius: 999,
          boxShadow: 'var(--shadow-subtle)',
          border: '1.5px solid #F0F1F5',
          alignItems: 'center'
        }}>
          <WifiIcon size={18} color="#7257FF" />
          <input
            type="text"
            placeholder="Enter or paste Voucher PIN (e.g. WIFI-7K8M2P)"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              fontWeight: 700,
              fontFamily: 'monospace',
              letterSpacing: '1px',
              color: 'var(--text-primary)',
              background: 'transparent'
            }}
          />
          <button
            type="submit"
            style={{
              background: '#141417',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 999,
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Track PIN
          </button>
        </div>
      </form>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 16,
          padding: '14px 18px',
          color: '#EF4444',
          fontSize: '13px',
          marginBottom: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>⚠️ {error}</span>
          <button
            onClick={() => router.push('/packages')}
            style={{
              background: '#EF4444',
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Buy Pass
          </button>
        </div>
      )}

      {/* ── Main Hero Card with Live Countdown & Progress ── */}
      <div style={{
        background: 'linear-gradient(135deg, #141417 0%, #1F1F27 100%)',
        borderRadius: 28,
        padding: '26px 22px',
        color: '#FFFFFF',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.25)',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Ambient background glow */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '160px',
          height: '160px',
          borderRadius: '50%',
          background: isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(114, 87, 255, 0.2)',
          filter: 'blur(40px)',
          pointerEvents: 'none'
        }} />

        {/* Top bar: Plan & Status pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Active Profile
            </span>
            <div style={{ fontSize: '17px', fontWeight: 800, marginTop: 2 }}>
              {data?.plan_name || 'Wi-Fi Hotspot Pass'}
            </div>
          </div>

          <span style={{
            fontSize: '11.5px',
            fontWeight: 800,
            padding: '5px 12px',
            borderRadius: 999,
            background: statusBg,
            color: statusColor,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
            {statusLabel}
          </span>
        </div>

        {/* Large Countdown Display */}
        <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            {isExpired ? 'Session Status' : 'Remaining Wi-Fi Time'}
          </span>

          <div style={{
            fontFamily: 'monospace',
            fontSize: '36px',
            fontWeight: 900,
            letterSpacing: '2px',
            color: isExpired ? '#EF4444' : '#FFFFFF',
            marginTop: 4,
            textShadow: isExpired ? '0 0 20px rgba(239,68,68,0.4)' : '0 0 24px rgba(114,87,255,0.3)'
          }}>
            {formatCountdown(currentRemaining)}
          </div>

          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            {isExpired
              ? 'This voucher validity has ended.'
              : isUnused
              ? '⚡ Pass Ready • Session timer begins upon first Wi-Fi login'
              : isExpiringSoon
              ? '⚡ Less than 30 minutes left! Tap below to renew.'
              : `Total duration allowed: ${data?.limit_uptime_seconds ? formatCountdown(data.limit_uptime_seconds) : '24h'}`}
          </div>
        </div>

        {/* Linear Progress Bar */}
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 999,
          height: 10,
          overflow: 'hidden',
          marginBottom: 16
        }}>
          <div style={{
            height: '100%',
            width: `${percentLeft}%`,
            background: isExpired ? '#EF4444' : isExpiringSoon ? 'linear-gradient(90deg, #F59E0B, #EF4444)' : 'linear-gradient(90deg, #7257FF, #10B981)',
            borderRadius: 999,
            transition: 'width 1s linear'
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
          <span>{percentLeft}% time remaining</span>
          <span>Used: {data?.formatted_uptime || '00:00:00'}</span>
        </div>

        {/* PIN Copy Strip */}
        <div style={{
          marginTop: 20,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 800, textTransform: 'uppercase' }}>
              Voucher PIN Code
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 800, color: '#fff', letterSpacing: '1px' }}>
              {data?.code || voucherCode || 'No PIN selected'}
            </div>
          </div>

          <button
            onClick={copyCode}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              background: copied ? '#10B981' : '#FFFFFF',
              color: copied ? '#FFFFFF' : '#141417',
              border: 'none',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {copied ? '✓ Copied' : 'Copy PIN'}
          </button>
        </div>
      </div>

      {/* ── Realtime Telemetry Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{
          background: '#FFFFFF',
          padding: '16px',
          borderRadius: 20,
          boxShadow: 'var(--shadow-subtle)',
          border: '1px solid #F0F1F5'
        }}>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
            📥 Downloaded
          </div>
          <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
            {data?.download_formatted || '0.0 MB'}
          </div>
          <div style={{ fontSize: '11px', color: '#10B981', marginTop: 2 }}>
            High-speed allocation
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '16px',
          borderRadius: 20,
          boxShadow: 'var(--shadow-subtle)',
          border: '1px solid #F0F1F5'
        }}>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
            📤 Uploaded
          </div>
          <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
            {data?.upload_formatted || '0.0 MB'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
            Total transferred: {data?.total_data_formatted || '0.0 MB'}
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '16px',
          borderRadius: 20,
          boxShadow: 'var(--shadow-subtle)',
          border: '1px solid #F0F1F5'
        }}>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
            🌐 Router IP
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4, fontFamily: 'monospace' }}>
            {data?.ip_address || 'DHCP Active'}
          </div>
          <div style={{ fontSize: '11px', color: data?.is_connected ? '#10B981' : 'var(--text-muted)', marginTop: 2 }}>
            {data?.is_connected ? '● MikroTik Lease' : 'Offline / Standby'}
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '16px',
          borderRadius: 20,
          boxShadow: 'var(--shadow-subtle)',
          border: '1px solid #F0F1F5'
        }}>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
            📱 Hardware MAC
          </div>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4, fontFamily: 'monospace' }}>
            {data?.mac_address || 'Bound on Login'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
            Single-Device Binding
          </div>
        </div>
      </div>

      {/* ── 1-Click Hotspot Login & Connection Banner ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: 20,
        padding: '16px 18px',
        boxShadow: 'var(--shadow-subtle)',
        border: '1px solid #F0F1F5',
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '18px' }}>📶</span>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Wi-Fi Network SSID
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {networkInfo.wifi_ssid}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Hotspot Portal
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#7257FF', fontFamily: 'monospace' }}>
              {networkInfo.hotspot_url}
            </div>
          </div>
        </div>

        {!isExpired && (
          <a
            href={`http://${networkInfo.hotspot_url}/login?username=${encodeURIComponent(data?.code || voucherCode)}&password=${encodeURIComponent(data?.code || voucherCode)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 999,
              background: '#10B981',
              color: '#FFFFFF',
              fontSize: '13.5px',
              fontWeight: 800,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            <span>🚀</span>
            <span>1-Click Auto-Login to Wi-Fi</span>
          </a>
        )}
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 30 }}>
        <button
          onClick={() => router.push('/packages')}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: 999,
            background: isExpiringSoon || isExpired ? '#7257FF' : '#141417',
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(114, 87, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.15s ease'
          }}
        >
          <ZapIcon size={18} color="#FFFFFF" />
          <span>{isExpired ? 'Buy New Wi-Fi Pass' : 'Renew / Extend Hotspot Pass'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowReceipt(true)}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 999,
            background: 'rgba(124, 58, 237, 0.08)',
            color: '#7C3AED',
            fontSize: '13.5px',
            fontWeight: 800,
            border: '1.5px solid rgba(124, 58, 237, 0.25)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.15s ease'
          }}
        >
          <ReceiptIcon size={18} color="#7C3AED" />
          <span>Download / Print Pass Receipt (PDF & Image)</span>
        </button>

        <button
          onClick={() => router.push('/vouchers')}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 999,
            background: '#FFFFFF',
            color: '#141417',
            fontSize: '13.5px',
            fontWeight: 700,
            border: '1.5px solid #F0F1F5',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <span>View All Purchased Passes</span>
          <ArrowUpRightIcon size={16} color="#141417" />
        </button>
      </div>

      {/* Pass Receipt Modal */}
      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        type="pass"
        data={{
          plan_name: data?.profile || 'Wi-Fi Access Pass',
          voucher_code: data?.code || voucherCode,
          price: data?.price || 0,
          duration: data?.limit_uptime_seconds ? `${Math.round(data.limit_uptime_seconds / 3600)} Hours` : 'Standard Access',
          created_at: new Date().toISOString(),
          is_used: (data?.used_seconds || 0) > 0,
          user_email: user?.email || '',
        }}
        brandName={appName}
        wifiSsid={networkInfo.wifi_ssid}
        hotspotUrl={networkInfo.hotspot_url}
      />


      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );

}

export default function VoucherStatusPage() {
  return (
    <Suspense fallback={
      <div className="app-shell" style={{ textAlign: 'center', padding: '100px 20px', color: '#8E8E93' }}>
        Loading Pass Telemetry...
      </div>
    }>
      <VoucherStatusContent />
    </Suspense>
  );
}
