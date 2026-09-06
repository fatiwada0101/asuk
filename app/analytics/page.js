'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';
import {
  ChevronLeftIcon,
  MoreVerticalIcon,
  ArrowUpRightIcon,
  EditPencilIcon,
  WifiIcon,
  WalletIcon,
  ShieldIcon,
  CheckIcon,
} from '../components/Icons';

export default function AnalyticsPage() {
  const router = useRouter();
  const { user, profile, wallet } = useAuth();
  const [toast, setToast] = useState('');

  const walletBalance = wallet ? parseFloat(wallet.balance) : 8182.80;
  const displayName = profile?.full_name || (user?.email ? user.email.split('@')[0] : 'Member');

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
          onClick={() => showToast('Analytics options')}
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
        onClick={() => router.push('/wallet')}
      >
        <div className="selector-left">
          <div className="selector-icon-circle">
            <WifiIcon size={20} color="#121217" />
          </div>
          <div>
            <div className="selector-name">{displayName}</div>
            <div className="selector-sub">ASUK-WIFI-7845</div>
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
          <h3>Wi-Fi Spending &amp; Data</h3>
          <div
            className="chart-round-action-btn"
            style={{ background: '#222227', color: '#FFFFFF' }}
            onClick={() => showToast('Full Wi-Fi report downloaded')}
            title="Download Report"
          >
            <ArrowUpRightIcon size={18} color="#FFFFFF" />
          </div>
        </div>

        <div className="donut-layout">
          {/* Donut SVG Ring */}
          <div className="donut-svg-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120">
              {/* Background ring */}
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="#222227"
                strokeWidth="16"
              />
              {/* Green Arc (Deposits Loaded) */}
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="#10B981"
                strokeWidth="16"
                strokeDasharray="140 289"
                strokeDashoffset="0"
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
                strokeDasharray="65 289"
                strokeDashoffset="-145"
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
              {/* Purple Arc (Voucher Purchases) */}
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="#A855F7"
                strokeWidth="16"
                strokeDasharray="50 289"
                strokeDashoffset="-215"
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
            </svg>

            <div className="donut-center-text">
              <small>Available</small>
              <strong>₦8,182</strong>
            </div>
          </div>

          {/* 4-Item Legend Grid */}
          <div className="legend-grid">
            <div className="legend-item">
              <div className="legend-label-row">
                <span className="legend-dot green" />
                <span>Deposited</span>
              </div>
              <div className="legend-val">₦40,911</div>
            </div>

            <div className="legend-item">
              <div className="legend-label-row">
                <span className="legend-dot purple" />
                <span>Passes</span>
              </div>
              <div className="legend-val">₦12,273</div>
            </div>

            <div className="legend-item">
              <div className="legend-label-row">
                <span className="legend-dot yellow" />
                <span>Balance</span>
              </div>
              <div className="legend-val">₦8,182</div>
            </div>

            <div className="legend-item">
              <div className="legend-label-row">
                <span className="legend-dot orange" />
                <span>Data Used</span>
              </div>
              <div className="legend-val">48.5 GB</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly Hotspot Quota Card ── */}
      <div className="budget-card">
        <div className="budget-header">
          <strong>Monthly Wi-Fi Budget</strong>
          <button
            onClick={() => showToast('Edit Wi-Fi budget threshold')}
            aria-label="Edit budget"
          >
            <EditPencilIcon size={16} color="#8E8E93" />
          </button>
        </div>

        <div className="budget-progress-track">
          <div className="budget-progress-fill" style={{ width: '64%' }} />
        </div>

        <div className="budget-amount-text">
          Budget: ₦20,000 • Used for Passes: ₦12,273
        </div>
      </div>

      {/* ── 2x2 Hotspot Category Passes Grid ── */}
      <div className="category-grid-2x2">
        <div className="category-card" onClick={() => router.push('/packages')}>
          <div className="category-card-top">
            <div className="category-icon-box">
              <WifiIcon size={18} color="#7257FF" />
            </div>
            <span className="category-count-badge">12 passes</span>
          </div>
          <div>
            <div className="category-label">Hourly Passes</div>
            <div className="category-amount">₦6,000.00</div>
          </div>
        </div>

        <div className="category-card" onClick={() => router.push('/packages')}>
          <div className="category-card-top">
            <div className="category-icon-box">
              <WalletIcon size={18} color="#10B981" />
            </div>
            <span className="category-count-badge">06 passes</span>
          </div>
          <div>
            <div className="category-label">Daily Passes</div>
            <div className="category-amount">₦9,000.00</div>
          </div>
        </div>

        <div className="category-card" onClick={() => router.push('/packages')}>
          <div className="category-card-top">
            <div className="category-icon-box">
              <ShieldIcon size={18} color="#F59E0B" />
            </div>
            <span className="category-count-badge">02 passes</span>
          </div>
          <div>
            <div className="category-label">Weekly / Monthly</div>
            <div className="category-amount">₦10,000.00</div>
          </div>
        </div>

        <div className="category-card" onClick={() => router.push('/packages')}>
          <div className="category-card-top">
            <div className="category-icon-box">
              <ArrowUpRightIcon size={18} color="#121217" />
            </div>
            <span className="category-count-badge">Active</span>
          </div>
          <div>
            <div className="category-label">Active Hotspot</div>
            <div className="category-amount">1 Device</div>
          </div>
        </div>
      </div>

      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
