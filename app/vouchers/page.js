'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import BottomNav from '../components/BottomNav';
import {
  ChevronLeftIcon,
  ShieldIcon,
  WifiIcon,
  CheckIcon,
  ArrowUpRightIcon,
} from '../components/Icons';

export default function VouchersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');
  const [toast, setToast] = useState('');
  const [networkInfo, setNetworkInfo] = useState({
    hotspot_url: 'asuktech.net',
    wifi_ssid: 'Asuk Tech Wi-Fi',
  });

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

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    const fetchVouchers = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('vouchers')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setVouchers(data || []);
      } catch (err) {
        console.error('Error fetching vouchers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVouchers();
  }, [user]);

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`Voucher code ${code} copied!`);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  if (authLoading || !user) {
    return (
      <div className="app-shell">
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          Checking authentication...
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Screen Topbar */}
      <div className="screen-topbar">
        <button
          className="circle-icon-btn"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ChevronLeftIcon size={20} color="#121217" />
        </button>

        <h1 className="screen-title">My Wi-Fi Passes</h1>

        <div style={{ width: '40px' }} />
      </div>

      {/* Sub-header info */}
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Your active hotspot passes for <strong>{networkInfo.wifi_ssid}</strong>.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11.5px', color: '#7257FF', fontWeight: 700 }}>
          <span>🌐 Hotspot Portal:</span>
          <span style={{ fontFamily: 'monospace' }}>http://{networkInfo.hotspot_url}</span>
        </div>
      </div>

      {/* Vouchers List */}
      {loading ? (
        <div className="pass-card-modern" style={{ textAlign: 'center', padding: '36px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading saved vouchers...</p>
        </div>
      ) : vouchers.length === 0 ? (
        <div
          className="pass-card-modern"
          style={{ textAlign: 'center', padding: '40px 20px' }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '20px',
              background: 'rgba(114, 87, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <WifiIcon size={28} color="#7257FF" />
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
            No Vouchers Found
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '20px' }}>
            You haven&apos;t purchased any hotspot passes yet.
          </p>
          <button
            onClick={() => router.push('/packages')}
            style={{
              background: '#141417',
              color: '#FFFFFF',
              borderRadius: '999px',
              padding: '12px 24px',
              fontSize: '13.5px',
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Browse Wi-Fi Passes ↗
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
          {vouchers.map((v) => (
            <div
              key={v.id}
              className="pass-card-modern"
              style={{ padding: '20px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {v.profile_name || 'Wi-Fi Hotspot Pass'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {v.created_at ? new Date(v.created_at).toLocaleDateString() : 'Active'} • {formatPrice(v.price)}
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: v.is_used ? '#F4F5F8' : 'rgba(16, 185, 129, 0.12)',
                    color: v.is_used ? '#8E8E93' : '#10B981',
                  }}
                >
                  {v.is_used ? '● Used' : '● Ready to Connect'}
                </span>
              </div>

              {/* Code Box */}
              <div
                style={{
                  background: '#F4F5F8',
                  borderRadius: '16px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Router PIN Code
                  </span>
                  <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 900, letterSpacing: '2px', color: 'var(--text-primary)' }}>
                    {v.voucher_code}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {!v.is_used && (
                    <a
                      href={`http://${networkInfo.hotspot_url}/login?username=${encodeURIComponent(v.voucher_code)}&password=${encodeURIComponent(v.voucher_code)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 12px',
                        background: '#10B981',
                        color: '#FFFFFF',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                      }}
                      title={`Connect to ${networkInfo.wifi_ssid} and auto-login`}
                    >
                      🚀 Connect
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(`/vouchers/status?code=${encodeURIComponent(v.voucher_code)}`)}
                    style={{
                      padding: '8px 12px',
                      background: '#FFFFFF',
                      color: '#7257FF',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: '1.5px solid rgba(114, 87, 255, 0.25)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title="Track live session countdown and data used"
                  >
                    ⏱️ Timer
                  </button>

                  <button
                    type="button"
                    onClick={() => copyCode(v.voucher_code)}
                    style={{
                      padding: '8px 14px',
                      background: copiedCode === v.voucher_code ? '#10B981' : '#141417',
                      color: '#FFFFFF',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {copiedCode === v.voucher_code ? '✓ Copied' : 'Copy PIN'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
