'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import BottomNav from '../components/BottomNav';
import {
  ChevronLeftIcon,
  MoreVerticalIcon,
  ArrowUpRightIcon,
  WifiIcon,
  WalletIcon,
  ShieldIcon,
  CheckIcon,
  ZapIcon,
} from '../components/Icons';

export default function AnalyticsPage() {
  const router = useRouter();
  const { user, profile, wallet, loading: authLoading } = useAuth();
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  // Real data state
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [vouchersCount, setVouchersCount] = useState(0);
  const [hourlyPasses, setHourlyPasses] = useState({ count: 0, amount: 0 });
  const [dailyPasses, setDailyPasses] = useState({ count: 0, amount: 0 });
  const [otherPasses, setOtherPasses] = useState({ count: 0, amount: 0 });
  const [activePassCode, setActivePassCode] = useState('');

  const walletBalance = wallet ? parseFloat(wallet.balance) : 0;
  const displayName = profile?.full_name || (user?.email ? user.email.split('@')[0] : 'Guest User');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Fetch real analytics data from Supabase
  useEffect(() => {
    // Read local active voucher if any
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('asuk_active_voucher');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.code) setActivePassCode(parsed.code);
        }
      } catch (e) {}
    }

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        // 1. Fetch transactions for user
        const { data: txData, error: txErr } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'successful');

        if (!txErr && txData) {
          let dep = 0;
          let sp = 0;
          txData.forEach((t) => {
            if (t.type === 'wallet_topup') dep += Number(t.amount || 0);
            else if (t.type === 'voucher_purchase') sp += Number(t.amount || 0);
          });
          setTotalDeposited(dep);
          setTotalSpent(sp);
        }

        // 2. Fetch vouchers for user
        const { data: vData, error: vErr } = await supabase
          .from('vouchers')
          .select('*')
          .eq('user_id', user.id);

        if (!vErr && vData) {
          setVouchersCount(vData.length);

          let hCount = 0, hAmt = 0;
          let dCount = 0, dAmt = 0;
          let oCount = 0, oAmt = 0;

          vData.forEach((v) => {
            const name = (v.profile_name || '').toLowerCase();
            const price = Number(v.price || 0);

            if (name.includes('hour') || name.includes('1h') || name.includes('3h')) {
              hCount++;
              hAmt += price;
            } else if (name.includes('day') || name.includes('24h') || name.includes('daily')) {
              dCount++;
              dAmt += price;
            } else {
              oCount++;
              oAmt += price;
            }
          });

          setHourlyPasses({ count: hCount, amount: hAmt });
          setDailyPasses({ count: dCount, amount: dAmt });
          setOtherPasses({ count: oCount, amount: oAmt });

          if (vData.length > 0 && !activePassCode) {
            setActivePassCode(vData[0].voucher_code);
          }
        }
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [user, activePassCode]);

  // Compute donut percentages dynamically based on real data
  const totalVolume = totalDeposited + totalSpent + walletBalance || 1;
  const depPct = Math.round((totalDeposited / totalVolume) * 100);
  const spentPct = Math.round((totalSpent / totalVolume) * 100);
  const balPct = Math.max(0, 100 - depPct - spentPct);

  // SVG Circumference for r=46 is 2 * PI * 46 ≈ 289
  const circum = 289;
  const depDash = Math.round((depPct / 100) * circum);
  const spentDash = Math.round((spentPct / 100) * circum);
  const balDash = Math.round((balPct / 100) * circum);

  return (
    <div className="app-shell">
      {/* ── Screen Topbar ── */}
      <div className="screen-topbar">
        <button
          className="circle-icon-btn"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ChevronLeftIcon size={20} color="#121217" />
        </button>

        <h1 className="screen-title">Usage &amp; Analytics</h1>

        <button
          className="circle-icon-btn"
          onClick={() => showToast('Analytics live view')}
          aria-label="Options"
        >
          <MoreVerticalIcon size={20} color="#121217" />
        </button>
      </div>

      {/* ── Account Selector Card ── */}
      <div style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
          Selected Hotspot Account
        </span>
      </div>

      <div
        className="account-selector-card"
        onClick={() => router.push(user ? '/wallet' : '/auth')}
      >
        <div className="selector-left">
          <div className="selector-icon-circle">
            <WifiIcon size={20} color="#121217" />
          </div>
          <div>
            <div className="selector-name">{displayName}</div>
            <div className="selector-sub">
              {activePassCode ? `PIN: ${activePassCode}` : user ? user.email : 'Guest Session'}
            </div>
          </div>
        </div>

        <div className="selector-amount">
          <span>{formatPrice(walletBalance)}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>▾</span>
        </div>
      </div>

      {/* ── Dark Obsidian Analytics Card ── */}
      <div className="dark-analytics-card">
        <div className="dark-analytics-header">
          <h3>Wi-Fi Spending &amp; Wallet</h3>
          <div
            className="chart-round-action-btn"
            style={{ background: '#222227', color: '#FFFFFF' }}
            onClick={() => router.push('/vouchers/status')}
            title="Track Live Voucher"
          >
            <ArrowUpRightIcon size={18} color="#FFFFFF" />
          </div>
        </div>

        <div className="donut-layout">
          {/* Donut SVG Ring with Real Proportions */}
          <div className="donut-svg-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="#222227"
                strokeWidth="16"
              />
              {/* Green Arc (Deposits) */}
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="#10B981"
                strokeWidth="16"
                strokeDasharray={`${depDash} ${circum}`}
                strokeDashoffset="0"
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
              {/* Purple Arc (Spending on passes) */}
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="#A855F7"
                strokeWidth="16"
                strokeDasharray={`${spentDash} ${circum}`}
                strokeDashoffset={`-${depDash}`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
              {/* Yellow Arc (Available Balance) */}
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="#FBBF24"
                strokeWidth="16"
                strokeDasharray={`${balDash} ${circum}`}
                strokeDashoffset={`-${depDash + spentDash}`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
            </svg>

            <div className="donut-center-text">
              <small>Balance</small>
              <strong>{formatPrice(walletBalance)}</strong>
            </div>
          </div>

          {/* 4-Item Legend Grid with Real Figures */}
          <div className="legend-grid">
            <div className="legend-item">
              <div className="legend-label-row">
                <span className="legend-dot green" />
                <span>Deposited</span>
              </div>
              <div className="legend-val">{formatPrice(totalDeposited)}</div>
            </div>

            <div className="legend-item">
              <div className="legend-label-row">
                <span className="legend-dot purple" />
                <span>Passes</span>
              </div>
              <div className="legend-val">{formatPrice(totalSpent)}</div>
            </div>

            <div className="legend-item">
              <div className="legend-label-row">
                <span className="legend-dot yellow" />
                <span>Balance</span>
              </div>
              <div className="legend-val">{formatPrice(walletBalance)}</div>
            </div>

            <div className="legend-item">
              <div className="legend-label-row">
                <span className="legend-dot orange" />
                <span>Total Passes</span>
              </div>
              <div className="legend-val">{vouchersCount} passes</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Guest Welcome / Account Strip (if not logged in) ── */}
      {!user && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: 20,
          padding: '18px 20px',
          boxShadow: 'var(--shadow-subtle)',
          border: '1.5px solid #F0F1F5',
          marginBottom: 20,
          textAlign: 'center'
        }}>
          <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            Sign In for Detailed Spending Reports
          </h4>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: 14 }}>
            Create an account to track your Wi-Fi passes, top up your wallet, and view payment receipts.
          </p>
          <button
            onClick={() => router.push('/auth')}
            style={{
              background: '#141417',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 999,
              padding: '10px 24px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Sign In / Register
          </button>
        </div>
      )}

      {/* ── 2x2 Hotspot Category Passes Grid with Real Metrics ── */}
      <div className="category-grid-2x2">
        <div className="category-card" onClick={() => router.push('/packages')}>
          <div className="category-card-top">
            <div className="category-icon-box">
              <WifiIcon size={18} color="#7257FF" />
            </div>
            <span className="category-count-badge">{hourlyPasses.count} passes</span>
          </div>
          <div>
            <div className="category-label">Hourly Passes</div>
            <div className="category-amount">{formatPrice(hourlyPasses.amount)}</div>
          </div>
        </div>

        <div className="category-card" onClick={() => router.push('/packages')}>
          <div className="category-card-top">
            <div className="category-icon-box">
              <WalletIcon size={18} color="#10B981" />
            </div>
            <span className="category-count-badge">{dailyPasses.count} passes</span>
          </div>
          <div>
            <div className="category-label">Daily Passes</div>
            <div className="category-amount">{formatPrice(dailyPasses.amount)}</div>
          </div>
        </div>

        <div className="category-card" onClick={() => router.push('/packages')}>
          <div className="category-card-top">
            <div className="category-icon-box">
              <ShieldIcon size={18} color="#F59E0B" />
            </div>
            <span className="category-count-badge">{otherPasses.count} passes</span>
          </div>
          <div>
            <div className="category-label">Weekly / Monthly</div>
            <div className="category-amount">{formatPrice(otherPasses.amount)}</div>
          </div>
        </div>

        <div className="category-card" onClick={() => router.push('/vouchers/status')}>
          <div className="category-card-top">
            <div className="category-icon-box">
              <ZapIcon size={18} color="#141417" />
            </div>
            <span className="category-count-badge">Live</span>
          </div>
          <div>
            <div className="category-label">Pass Telemetry</div>
            <div className="category-amount">
              {activePassCode ? 'Active Timer ↗' : 'Check Session ↗'}
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
