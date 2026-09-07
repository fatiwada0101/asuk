'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { supabase } from '../../lib/supabase';
import BottomNav from '../components/BottomNav';
import {
  ChevronLeftIcon,
  MoreVerticalIcon,
  ArrowUpRightIcon,
  SmileIcon,
  SendPlaneIcon,
  CheckIcon,
  WifiIcon,
  WalletIcon,
} from '../components/Icons';

const PRESET_AMOUNTS = ['500', '1000', '2000', '5000'];

export default function WalletPage() {
  const router = useRouter();
  const { user, profile, wallet, refreshWallet, loading: authLoading } = useAuth();
  const { appName } = useBranding();

  const [activeSegment, setActiveSegment] = useState('vouchers'); // 'deposits' | 'vouchers'
  const [amountVal, setAmountVal] = useState('2000.00');
  const [notes, setNotes] = useState('');
  const [saveAccount, setSaveAccount] = useState(true);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [flwConfig, setFlwConfig] = useState({ publicKey: '', enabled: false });

  // Real transaction data
  const [transactions, setTransactions] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [totalSpending, setTotalSpending] = useState(0);

  // Real balance — 0 if no wallet
  const walletBalance = wallet ? parseFloat(wallet.balance) : 0;
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

  // Auth guard — redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth');
    }
  }, [authLoading, user, router]);

  // Fetch Flutterwave public settings
  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => {
        if (d.flutterwave) setFlwConfig(d.flutterwave);
      })
      .catch(() => {});
  }, []);

  // Fetch real transaction data for charts
  useEffect(() => {
    if (!user) return;

    const fetchTransactions = async () => {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'successful')
          .order('created_at', { ascending: false })
          .limit(100);

        if (!error && data) {
          setTransactions(data);

          // Compute totals
          let deposits = 0;
          let spending = 0;
          data.forEach(tx => {
            if (tx.type === 'wallet_topup') deposits += Number(tx.amount);
            else if (tx.type === 'voucher_purchase') spending += Number(tx.amount);
          });
          setTotalDeposits(deposits);
          setTotalSpending(spending);

          // Compute weekly bar chart from real data
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const today = new Date();
          const weekData = [];

          for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dayName = days[d.getDay()];
            const dateStr = d.toISOString().split('T')[0];

            const dayTotal = data
              .filter(tx => {
                const txDate = new Date(tx.created_at).toISOString().split('T')[0];
                return txDate === dateStr;
              })
              .reduce((sum, tx) => sum + Number(tx.amount), 0);

            weekData.push({
              day: dayName,
              amount: dayTotal,
              isToday: i === 0,
            });
          }

          // Normalize heights
          const maxAmt = Math.max(...weekData.map(w => w.amount), 100);
          weekData.forEach(w => {
            w.height = Math.max(12, Math.round((w.amount / maxAmt) * 100));
          });

          setWeeklyData(weekData);
        }
      } catch (err) {
        console.error('Error fetching transactions:', err);
      }
    };

    fetchTransactions();
  }, [user]);

  const handleFundWallet = async () => {
    if (loading) return;

    const num = parseFloat(amountVal);
    if (!num || num < 100) {
      showToast('Minimum deposit amount is ₦100');
      return;
    }

    if (!user) {
      showToast('Please sign in to top up your wallet');
      router.push('/auth');
      return;
    }

    // Flutterwave checkout is REQUIRED — no free credits
    if (!flwConfig.publicKey || typeof window.FlutterwaveCheckout === 'undefined') {
      showToast('Payment gateway is not configured or still loading. Please try again in a moment.');
      return;
    }

    const txRef = `FLW_TOPUP_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    window.FlutterwaveCheckout({
      public_key: flwConfig.publicKey,
      tx_ref: txRef,
      amount: num,
      currency: 'NGN',
      payment_options: 'card,banktransfer,ussd',
      customer: {
        email: user?.email || 'customer@asuktech.com',
        phone_number: user?.user_metadata?.phone || '08000000000',
        name: displayName,
      },
      customizations: {
        title: `${appName} Wallet Deposit`,
        description: `Credit ${formatPrice(num)} to your Wi-Fi wallet`,
      },
      callback: async function (response) {
        if (response.status === 'successful' || response.status === 'completed') {
          await finalizeTopup(num, txRef);
        } else {
          showToast('Payment was cancelled or failed');
        }
      },
      onclose: function () {
        // User closed the payment modal
      },
    });
  };

  const finalizeTopup = async (amount, ref) => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          user_id: user.id,
          flw_ref: ref,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Top-up failed');

      await refreshWallet();
      showToast(`✅ ${formatPrice(amount)} added to your wallet!`);

      // Create notification
      try {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            title: 'Wallet Top-Up Successful',
            message: `${formatPrice(amount)} has been credited to your wallet.`,
            type: 'wallet_credit',
          }),
        });
      } catch (e) {}
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

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

        <h1 className="screen-title">Wallet &amp; Spending</h1>

        <button
          className="circle-icon-btn"
          onClick={() => showToast('Wallet options')}
          aria-label="Options"
        >
          <MoreVerticalIcon size={20} color="#121217" />
        </button>
      </div>

      {/* ── Capsule Segmented Toggle ── */}
      <div className="capsule-toggle-wrap">
        <div className="capsule-toggle">
          <button
            className={`capsule-btn ${activeSegment === 'deposits' ? 'active' : ''}`}
            onClick={() => setActiveSegment('deposits')}
          >
            Deposits
          </button>
          <button
            className={`capsule-btn ${activeSegment === 'vouchers' ? 'active' : ''}`}
            onClick={() => setActiveSegment('vouchers')}
          >
            Vouchers
          </button>
        </div>
      </div>

      {/* ── Balance Header ── */}
      <div className="balance-display-block">
        <span className="balance-label-center">Available Wallet Balance</span>
        <div className="balance-big-amount">{formatPrice(walletBalance)}</div>
      </div>

      {/* ── Weekly Spending Bar Chart Card (Real Data) ── */}
      <div className="chart-card">
        <div className="chart-card-header">
          <div className="chart-header-info">
            <span className="chart-tag">
              {activeSegment === 'deposits' ? 'Total Deposits Loaded' : 'Total Wi-Fi Spending'}
            </span>
            <div className="chart-main-val">
              {activeSegment === 'deposits' ? formatPrice(totalDeposits) : formatPrice(totalSpending)}
            </div>
          </div>

          <button
            className="chart-round-action-btn"
            onClick={() => showToast('Weekly activity overview')}
            aria-label="View Analytics"
          >
            <ArrowUpRightIcon size={18} color="#121217" />
          </button>
        </div>

        {/* Bar Chart Columns — Real Data */}
        <div className="chart-bars-wrap">
          {weeklyData.length > 0 ? weeklyData.map((w) => (
            <div key={w.day} className="bar-col">
              <div className="bar-track">
                {w.isToday && w.amount > 0 && (
                  <div className="bar-tooltip">{formatPrice(w.amount)}</div>
                )}
                <div
                  className={`bar-fill ${w.isToday ? 'active' : ''}`}
                  style={{ height: `${w.height}%` }}
                />
              </div>
              <span className="bar-day">{w.day}</span>
            </div>
          )) : (
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="bar-col">
                <div className="bar-track">
                  <div className="bar-fill" style={{ height: '12%' }} />
                </div>
                <span className="bar-day">{day}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Top-Up / Deposit Card ── */}
      <div className="transfer-card">
        <div className="transfer-card-title">Top-Up Wallet</div>

        {/* Account Info */}
        <div className="transfer-user-row">
          <div className="transfer-user-left">
            <div className="transfer-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="transfer-name">{displayName}</div>
              <div className="transfer-acc">{appName} • Hotspot Wallet</div>
            </div>
          </div>

          <button
            className="transfer-change-btn"
            onClick={() => router.push('/auth')}
          >
            Profile
          </button>
        </div>

        {/* Top-Up Amount Row */}
        <div className="transfer-amount-row">
          <div>
            <div className="amount-label">Deposit Amount</div>
            <div className="amount-val">₦{amountVal}</div>
          </div>

          <button
            className="transfer-edit-btn"
            onClick={() => {
              const val = prompt('Enter top-up amount (₦):', amountVal);
              if (val && !isNaN(val)) setAmountVal(parseFloat(val).toFixed(2));
            }}
          >
            Custom
          </button>
        </div>

        {/* Quick Amount Presets */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {PRESET_AMOUNTS.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setAmountVal(parseFloat(amt).toFixed(2))}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: '12px',
                background: amountVal === parseFloat(amt).toFixed(2) ? 'var(--dock-bg, #141417)' : '#F4F5F8',
                color: amountVal === parseFloat(amt).toFixed(2) ? '#FFFFFF' : '#4A4A52',
                fontSize: '12px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              ₦{amt}
            </button>
          ))}
        </div>

        {/* Note Input */}
        <div className="transfer-note-box">
          <input
            type="text"
            placeholder="Add memo (e.g. Weekly Wi-Fi credit)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="transfer-note-icons">
            <SmileIcon size={18} color="#8E8E93" />
            <SendPlaneIcon size={18} color="#8E8E93" />
          </div>
        </div>

        {/* Save Preference Checkbox */}
        <div
          className="transfer-check-row"
          onClick={() => setSaveAccount(!saveAccount)}
        >
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '6px',
              background: saveAccount ? 'var(--dock-bg, #141417)' : '#F4F5F8',
              border: '1.5px solid var(--dock-bg, #141417)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {saveAccount && <CheckIcon size={12} color="#FFFFFF" />}
          </div>
          <span className="transfer-check-label">Remember payment preference</span>
        </div>

        {/* CTA Button */}
        <button
          className="transfer-submit-btn"
          onClick={handleFundWallet}
          disabled={loading}
        >
          {loading ? 'Processing...' : `Deposit ${formatPrice(parseFloat(amountVal))} via Flutterwave`}
        </button>
      </div>

      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
