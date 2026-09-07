'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './context/AuthContext';
import { useBranding } from './context/BrandingContext';
import { supabase } from '../lib/supabase';
import BottomNav from './components/BottomNav';
import SideDrawer from './components/SideDrawer';
import CheckoutModal from './components/CheckoutModal';
import {
  MenuSliderIcon,
  BellIcon,
  ArrowUpRightIcon,
  WalletIcon,
  WifiIcon,
  PlusIcon,
  ShieldIcon,
} from './components/Icons';

// Calculate duration in milliseconds from duration string or plan name
function getDurationMs(durationStr, planName) {
  const str = ((durationStr || '') + ' ' + (planName || '')).toLowerCase();
  if (str.includes('30 day') || str.includes('30d') || str.includes('month')) return 30 * 24 * 60 * 60 * 1000;
  if (str.includes('7 day') || str.includes('7d') || str.includes('week')) return 7 * 24 * 60 * 60 * 1000;
  if (str.includes('3 day') || str.includes('3d')) return 3 * 24 * 60 * 60 * 1000;
  if (str.includes('24h') || str.includes('24 hour') || str.includes('1 day') || str.includes('daily')) return 24 * 60 * 60 * 1000;
  if (str.includes('12h') || str.includes('12 hour')) return 12 * 60 * 60 * 1000;
  if (str.includes('6h') || str.includes('6 hour')) return 6 * 60 * 60 * 1000;
  if (str.includes('3h') || str.includes('3 hour')) return 3 * 60 * 60 * 1000;
  if (str.includes('2h') || str.includes('2 hour')) return 2 * 60 * 60 * 1000;
  if (str.includes('1h') || str.includes('1 hour') || str.includes('hourly')) return 1 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export default function HomePage() {
  const router = useRouter();
  const { user, profile, wallet, refreshWallet, loading: authLoading } = useAuth();
  const { appName } = useBranding();

  // Gate: if not logged in and no guest session, redirect to auth
  useEffect(() => {
    if (authLoading) return; // wait for auth to resolve
    if (!user) {
      const isGuest = typeof window !== 'undefined' && localStorage.getItem('asuk_guest_session');
      if (!isGuest) {
        router.replace('/auth');
      }
    }
  }, [user, authLoading, router]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [plans, setPlans] = useState([]);

  // Active Voucher & Live Expiry Tracking
  const [activeVoucher, setActiveVoucher] = useState(null);
  const [countdownText, setCountdownText] = useState('Checking...');
  const [isPassActive, setIsPassActive] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  // Real balance — 0 for guests, actual wallet balance for logged-in users
  const walletBalance = wallet ? parseFloat(wallet.balance) : 0;
  const displayName = profile?.full_name || (user?.email ? user.email.split('@')[0] : 'Guest');
  const initials = displayName.charAt(0).toUpperCase();

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  const formatPrice = (amount) => '₦' + Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Fetch plans from DB
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch('/api/super-admin/plans');
        if (res.ok) {
          const data = await res.json();
          setPlans(data);
        }
      } catch (err) {
        console.error('Error fetching plans:', err);
      }
    };
    fetchPlans();
  }, []);

  // Fetch notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const res = await fetch(`/api/notifications?user_id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unread_count || 0);
        }
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    };

    fetchNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, mark_all: true }),
      });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking notifications read:', err);
    }
  };

  // Sync Active Voucher from local storage and Supabase
  const syncActiveVoucher = useCallback(async () => {
    let candidate = null;

    // 1. Check localStorage first (instant for guests and immediate post-checkout)
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('asuk_active_voucher');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.code) {
            candidate = {
              code: parsed.code,
              plan: parsed.plan || 'Wi-Fi Pass',
              duration: parsed.duration || '24h',
              purchasedAt: parsed.purchasedAt || Date.now(),
            };
          }
        }
      } catch (e) {
        console.error('Error reading localStorage voucher:', e);
      }
    }

    // 2. If user is logged in, query latest voucher from Supabase
    if (user) {
      try {
        const { data, error } = await supabase
          .from('vouchers')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data && !error) {
          const dbPurchasedAt = new Date(data.created_at).getTime();
          // Prefer Supabase if candidate is missing or if DB record is equal/newer
          if (!candidate || dbPurchasedAt >= (candidate.purchasedAt - 60000)) {
            candidate = {
              code: data.voucher_code,
              plan: data.profile_name || 'Wi-Fi Pass',
              duration: data.profile_name || '24h',
              purchasedAt: dbPurchasedAt,
            };
          }
        }
      } catch (err) {
        console.error('Error fetching latest user voucher:', err);
      }
    }

    if (candidate) {
      const durationMs = getDurationMs(candidate.duration, candidate.plan);
      const expiresAt = candidate.purchasedAt + durationMs;
      setActiveVoucher({ ...candidate, expiresAt });
    } else {
      setActiveVoucher(null);
      setCountdownText('No Active Pass');
      setIsPassActive(false);
    }
  }, [user]);

  // Initial load and listen for checkout updates
  useEffect(() => {
    syncActiveVoucher();

    const handleUpdate = () => syncActiveVoucher();
    window.addEventListener('active_voucher_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('active_voucher_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [syncActiveVoucher]);

  // Live real-time countdown timer (ticks every 1 second)
  useEffect(() => {
    if (!activeVoucher?.expiresAt) {
      setCountdownText('No Active Pass');
      setIsPassActive(false);
      return;
    }

    const updateTimer = () => {
      const remainingMs = activeVoucher.expiresAt - Date.now();

      if (remainingMs > 0) {
        setIsPassActive(true);
        const totalSecs = Math.floor(remainingMs / 1000);
        const days = Math.floor(totalSecs / 86400);
        const hours = Math.floor((totalSecs % 86400) / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;

        if (days > 0) {
          setCountdownText(`${days}d ${hours}h left`);
        } else {
          setCountdownText(
            `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
          );
        }
      } else {
        setIsPassActive(false);
        setCountdownText('Pass Expired');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeVoucher]);

  // Copy PIN code handler
  const handleCopyPin = (e) => {
    e.stopPropagation();
    if (activeVoucher?.code) {
      navigator.clipboard.writeText(activeVoucher.code);
      setCopiedPin(true);
      showToast(`✅ Hotspot PIN ${activeVoucher.code} copied! Enter on router page.`);
      setTimeout(() => setCopiedPin(false), 2000);
    } else {
      showToast('No active voucher. Tap Quick Pass to purchase one!');
    }
  };

  const handleOpenCheckout = (plan) => {
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  return (
    <div className="app-shell">
      <SideDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        plan={selectedPlan}
        onSuccess={() => {
          if (user) refreshWallet();
          syncActiveVoucher();
          showToast('Voucher generated successfully!');
        }}
      />

      {/* ── Top Bar ── */}
      <header className="top-nav-bar">
        <div className="top-nav-left">
          <button
            className="circle-icon-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menu"
          >
            <MenuSliderIcon size={20} color="#121217" />
          </button>
        </div>

        <div className="top-nav-right">
          {/* Notification Bell */}
          <div style={{ position: 'relative' }}>
            <button
              className="circle-icon-btn"
              onClick={() => {
                if (user) {
                  setNotifOpen(!notifOpen);
                  if (!notifOpen && unreadCount > 0) markAllRead();
                } else {
                  showToast('Sign in to view notifications');
                }
              }}
              aria-label="Notifications"
            >
              <BellIcon size={20} color="#121217" />
              {unreadCount > 0 && <span className="notification-badge-dot" />}
            </button>

            {/* Notification Dropdown */}
            {notifOpen && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-header">
                  <strong>Notifications</strong>
                  {unreadCount > 0 && (
                    <span className="notif-unread-badge">{unreadCount} new</span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="notif-empty">No notifications yet</div>
                ) : (
                  <div className="notif-list">
                    {notifications.slice(0, 10).map(n => (
                      <div key={n.id} className={`notif-item ${!n.is_read ? 'unread' : ''}`}>
                        <div className="notif-item-icon">
                          {n.type === 'wallet_credit' ? '💰' : n.type === 'voucher_purchase' ? '🎟️' : '🔔'}
                        </div>
                        <div className="notif-item-content">
                          <div className="notif-item-title">{n.title}</div>
                          <div className="notif-item-message">{n.message}</div>
                          <div className="notif-item-time">
                            {n.created_at ? new Date(n.created_at).toLocaleString(undefined, {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="user-avatar-circle"
            onClick={() => router.push(user ? '/wallet' : '/auth')}
            aria-label="User profile"
          >
            {initials}
          </div>
        </div>
      </header>

      {/* ── Greeting Header ── */}
      <div className="greeting-section">
        <h1 className="greeting-title">Hello {displayName}!</h1>
        <p className="greeting-sub">Let&apos;s manage your Wi-Fi &amp; wallet.</p>
      </div>

      {/* ── Primary Wallet Card ── */}
      <div className="wallet-card-container">
        {/* Violet Card */}
        <div className="card-front-violet">
          <div className="card-front-top">
            <div className="card-front-logo">
              <WifiIcon size={20} color="#FFFFFF" />
              <span>{appName} Hotspot</span>
            </div>

            {/* Hotspot PIN / ID Chip (Replacing credit card digits) */}
            <div
              className="card-hotspot-pin-chip"
              onClick={handleCopyPin}
              title={activeVoucher?.code ? 'Click to copy Hotspot PIN' : 'No active pass'}
            >
              <span className="pin-prefix">{activeVoucher?.code ? 'PIN:' : 'ID:'}</span>
              <span className="pin-code">{activeVoucher?.code || 'ASUK-WIFI'}</span>
              <span className="pin-action-icon">{copiedPin ? '✓' : '📋'}</span>
            </div>
          </div>

          <div className="card-front-balance-row">
            <div className="balance-meta-col">
              <span className="balance-tag">Wallet Balance</span>
              <div
                className="balance-main-amount"
                onClick={() => setBalanceHidden(!balanceHidden)}
                style={{ cursor: 'pointer' }}
                title="Click to toggle balance visibility"
              >
                {balanceHidden ? '₦••••••••' : formatPrice(walletBalance)}
              </div>
            </div>

            <div
              className="balance-exp-col"
              onClick={() => router.push(activeVoucher?.code ? `/vouchers/status?code=${encodeURIComponent(activeVoucher.code)}` : '/vouchers/status')}
              style={{ cursor: 'pointer' }}
              title="Click to view live session timer & data used"
            >
              <span className={`exp-tag ${isPassActive ? 'active' : ''}`}>
                {isPassActive ? '● Pass Expiry' : 'Voucher Expiry'}
              </span>
              <div className={`exp-val ${isPassActive ? 'exp-val-active' : ''}`}>
                {countdownText}
              </div>
            </div>
          </div>

          <div className="card-front-bottom">
            <div className="card-holder-info">
              <span className="holder-tag">Hotspot User</span>
              <div className="holder-name">{displayName}</div>
            </div>

            {/* Nested Cutout Button */}
            <button
              className="card-cutout-btn"
              onClick={() => router.push(user ? '/wallet' : '/auth')}
            >
              <PlusIcon size={14} color="#FFFFFF" />
              <span>Top Up</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick Action 4-Grid ── */}
      <div className="quick-grid-4">
        <div
          className="quick-action-item"
          onClick={() => {
            if (plans.length > 0) handleOpenCheckout(plans[0]);
            else router.push('/packages');
          }}
        >
          <div className="quick-icon-box">
            <ArrowUpRightIcon size={22} color="#121217" />
          </div>
          <span className="quick-label">Quick Pass</span>
        </div>

        <div
          className="quick-action-item"
          onClick={() => router.push('/packages')}
        >
          <div className="quick-icon-box">
            <WifiIcon size={22} color="#121217" />
          </div>
          <span className="quick-label">All Passes</span>
        </div>

        <div
          className="quick-action-item"
          onClick={() => router.push(user ? '/wallet' : '/auth')}
        >
          <div className="quick-icon-box">
            <WalletIcon size={22} color="#121217" />
          </div>
          <span className="quick-label">Top Up</span>
        </div>

        <div
          className="quick-action-item"
          onClick={() => router.push(user ? '/vouchers' : '/auth')}
        >
          <div className="quick-icon-box">
            <ShieldIcon size={22} color="#121217" />
          </div>
          <span className="quick-label">My Passes</span>
        </div>
      </div>

      {/* Passes section removed — users navigate to /packages via Quick Action or bottom nav */}

      {/* Click outside to close notification dropdown */}
      {notifOpen && (
        <div
          className="notif-overlay"
          onClick={() => setNotifOpen(false)}
        />
      )}

      <BottomNav />
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
