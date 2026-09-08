'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { supabase } from '../../lib/supabase';
import BottomNav from '../components/BottomNav';
import {
  ChevronLeftIcon,
  MoreVerticalIcon,
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  CheckIcon,
  WifiIcon,
  WalletIcon,
  ShieldIcon,
  TicketIcon,
  RefreshIcon,
  PlusIcon,
} from '../components/Icons';

const PRESET_AMOUNTS = ['500', '1000', '2000', '5000', '10000'];

export default function WalletPage() {
  const router = useRouter();
  const { user, profile, wallet, refreshWallet, loading: authLoading } = useAuth();
  const { appName } = useBranding();
  const topupProcessingRef = useRef(false);
  const depositFormRef = useRef(null);

  const [activeSegment, setActiveSegment] = useState('deposits'); // 'deposits' | 'vouchers'
  const [amountVal, setAmountVal] = useState('2000');
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
    setTimeout(() => setToast(''), 3500);
  };

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Fetch Flutterwave public settings
  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => {
        if (d.flutterwave) setFlwConfig(d.flutterwave);
      })
      .catch(() => {});
  }, []);

  // Fetch real transaction data for charts and history
  const fetchTransactions = useCallback(async () => {
    if (!user) return;
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
  }, [user]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Realtime transaction updates (reflects webhook deposits instantly)
  useEffect(() => {
    if (!user?.id) return;

    const txChannel = supabase
      .channel(`realtime-tx-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchTransactions();
          refreshWallet();
        }
      )
      .on('broadcast', { event: 'wallet_update' }, (msg) => {
        fetchTransactions();
        refreshWallet();
        if (msg?.payload?.amount) {
          showToast(`₦${Number(msg.payload.amount).toLocaleString()} deposit credited to your balance!`);
        }
      })
      .subscribe();

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchTransactions();
        refreshWallet();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', handleVisibility);
    }

    return () => {
      supabase.removeChannel(txChannel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('focus', handleVisibility);
      }
    };
  }, [user?.id, fetchTransactions, refreshWallet]);

  const depositNum = Math.max(0, parseFloat(amountVal) || 0);
  const projectedBalance = walletBalance + depositNum;

  const handleFundWallet = async () => {
    if (loading || topupProcessingRef.current) return;

    if (!user) {
      showToast('Please sign in to top up your wallet');
      router.push('/auth');
      return;
    }

    if (!depositNum || depositNum < 100) {
      showToast('Minimum deposit amount is ₦100');
      return;
    }

    // Flutterwave checkout is REQUIRED — no free credits
    if (!flwConfig.publicKey || typeof window.FlutterwaveCheckout === 'undefined') {
      showToast('Payment gateway is loading or not configured. Please try again in a moment.');
      return;
    }

    const txRef = `FLW_TOPUP_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    window.FlutterwaveCheckout({
      public_key: flwConfig.publicKey,
      tx_ref: txRef,
      amount: depositNum,
      currency: 'NGN',
      payment_options: 'card,banktransfer,ussd',
      customer: {
        email: user?.email || 'customer@asuktech.com',
        phone_number: user?.user_metadata?.phone || '08000000000',
        name: displayName,
      },
      meta: {
        user_id: user.id,
        type: 'wallet_topup',
      },
      customizations: {
        title: `${appName} Wallet Deposit`,
        description: `Credit ${formatPrice(depositNum)} to your Wi-Fi wallet`,
      },
      callback: async function (response) {
        if (response.status === 'successful' || response.status === 'completed') {
          const transactionId = response.transaction_id || response.id;
          await finalizeTopup(depositNum, txRef, transactionId);
        } else {
          showToast('Payment was cancelled or failed');
        }
      },
      onclose: function () {
        // User closed modal
      },
    });
  };

  const finalizeTopup = async (amount, ref, transactionId) => {
    if (topupProcessingRef.current) return;
    topupProcessingRef.current = true;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount,
          user_id: user.id,
          flw_ref: ref,
          transaction_id: transactionId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Top-up failed');

      await refreshWallet();
      await fetchTransactions();
      showToast(`✅ ${formatPrice(amount)} added to your wallet!`);
      setActiveSegment('deposits');
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setLoading(false);
      topupProcessingRef.current = false;
    }
  };

  // Filtered transactions for tabs
  const depositList = transactions.filter(t => t.type === 'wallet_topup');
  const voucherList = transactions.filter(t => t.type === 'voucher_purchase');

  const scrollToDeposit = () => {
    depositFormRef.current?.scrollIntoView({ behavior: 'smooth' });
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

        <h1 className="screen-title">Wallet &amp; Top-Up</h1>

        <button
          className="circle-icon-btn"
          onClick={() => {
            refreshWallet();
            fetchTransactions();
            showToast('Wallet refreshed');
          }}
          aria-label="Refresh"
          title="Refresh Balance"
        >
          <RefreshIcon size={18} color="#121217" />
        </button>
      </div>

      {/* ── Guest Warning Banner (if not logged in) ── */}
      {!user && !authLoading && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(79, 70, 229, 0.12) 100%)',
            border: '1px solid rgba(124, 58, 237, 0.25)',
            borderRadius: '18px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <WalletIcon size={20} color="#7C3AED" />
            <span style={{ fontWeight: 700, fontSize: '14px', color: '#1E1B4B' }}>
              Sign In to Fund Your Wallet
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#4B5563', lineHeight: 1.5 }}>
            To keep a persistent wallet balance and enjoy 1-click Wi-Fi pass purchases across all your devices, please create an account or sign in.
          </p>
          <button
            onClick={() => router.push('/auth')}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--dock-bg, #141417)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Sign In / Register →
          </button>
        </div>
      )}

      {/* ── Hero Balance Card ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #18181B 0%, #09090B 100%)',
          color: '#FFFFFF',
          borderRadius: '24px',
          padding: '24px 20px',
          marginBottom: '22px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Available Balance
            </span>
            <div style={{ fontSize: '36px', fontWeight: 900, marginTop: '4px', letterSpacing: '-0.5px' }}>
              {formatPrice(walletBalance)}
            </div>
          </div>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#A1A1AA',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ShieldIcon size={14} color="#10B981" />
            Active Wallet
          </div>
        </div>

        {/* Quick Balance Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <button
            onClick={scrollToDeposit}
            style={{
              flex: 1,
              background: '#FFFFFF',
              color: '#121217',
              border: 'none',
              borderRadius: '14px',
              padding: '12px 14px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 255, 255, 0.15)',
            }}
          >
            <PlusIcon size={15} color="#121217" />
            Deposit Funds
          </button>
          <button
            onClick={() => router.push('/packages')}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '12px 14px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <WifiIcon size={15} color="#FFFFFF" />
            Buy Wi-Fi Pass
          </button>
        </div>

        {/* Stats strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            marginTop: '18px',
            paddingTop: '14px',
            fontSize: '12px',
          }}
        >
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Total Deposited</span>
            <div style={{ fontWeight: 700, marginTop: '2px' }}>{formatPrice(totalDeposits)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Total Spent</span>
            <div style={{ fontWeight: 700, marginTop: '2px' }}>{formatPrice(totalSpending)}</div>
          </div>
        </div>
      </div>

      {/* ── Dedicated Deposit / Top-Up Card ── */}
      <div
        ref={depositFormRef}
        style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          padding: '24px 20px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-card, 0 4px 20px rgba(0,0,0,0.06))',
          border: '1px solid #EDEDF2',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: '#141417' }}>Deposit Funds</h2>
            <p style={{ fontSize: '12px', color: '#71717A', margin: '2px 0 0' }}>
              Instant wallet credit via Card, Bank Transfer, or USSD
            </p>
          </div>
          <div
            style={{
              background: '#F4F4F5',
              padding: '6px 10px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#52525B',
            }}
          >
            NGN (₦)
          </div>
        </div>

        {/* Amount Input Block */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#52525B', marginBottom: '6px' }}>
            Amount to Deposit (Min ₦100)
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#F4F4F5',
              borderRadius: '16px',
              padding: '4px 14px',
              border: '1.5px solid #E4E4E7',
              transition: 'border 0.2s ease',
            }}
          >
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#18181B', marginRight: '6px' }}>₦</span>
            <input
              type="number"
              min="100"
              step="50"
              value={amountVal}
              onChange={(e) => setAmountVal(e.target.value)}
              placeholder="1000"
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                fontSize: '24px',
                fontWeight: 800,
                color: '#18181B',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Preset Amount Chips */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {PRESET_AMOUNTS.map((amt) => {
            const isSelected = amountVal === amt;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => setAmountVal(amt)}
                style={{
                  flex: '1 1 calc(20% - 6px)',
                  minWidth: '60px',
                  padding: '9px 4px',
                  borderRadius: '12px',
                  background: isSelected ? 'var(--dock-bg, #141417)' : '#F4F4F5',
                  color: isSelected ? '#FFFFFF' : '#3F3F46',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: isSelected ? '1px solid #141417' : '1px solid #E4E4E7',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                }}
              >
                ₦{Number(amt).toLocaleString()}
              </button>
            );
          })}
        </div>

        {/* Live Calculation Preview */}
        <div
          style={{
            background: '#FAFAFA',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '18px',
            border: '1px dashed #D4D4D8',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#71717A' }}>
            <span>Current Balance:</span>
            <span>{formatPrice(walletBalance)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#16A34A', fontWeight: 700 }}>
            <span>+ Deposit Amount:</span>
            <span>{formatPrice(depositNum)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E4E4E7', paddingTop: '6px', fontWeight: 800, color: '#18181B' }}>
            <span>Projected Balance:</span>
            <span>{formatPrice(projectedBalance)}</span>
          </div>
        </div>

        {/* Payment Methods Info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '18px',
            fontSize: '12px',
            color: '#71717A',
          }}
        >
          <ShieldIcon size={16} color="#10B981" />
          <span>Secured by Flutterwave • Supports Cards, Bank Transfer &amp; USSD</span>
        </div>

        {/* Primary Deposit Button */}
        <button
          className="transfer-submit-btn"
          onClick={handleFundWallet}
          disabled={loading || depositNum < 100}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: '16px',
            background: loading || depositNum < 100 ? '#A1A1AA' : 'var(--dock-bg, #141417)',
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: 800,
            border: 'none',
            cursor: loading || depositNum < 100 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
          }}
        >
          {loading ? 'Opening Gateway...' : `Deposit ${formatPrice(depositNum)} via Flutterwave`}
        </button>
      </div>

      {/* ── Activity & Spending Visualizer ── */}
      <div className="chart-card" style={{ marginBottom: '22px' }}>
        <div className="chart-card-header">
          <div className="chart-header-info">
            <span className="chart-tag">Weekly Activity</span>
            <div className="chart-main-val">
              {activeSegment === 'deposits' ? formatPrice(totalDeposits) : formatPrice(totalSpending)}
            </div>
          </div>
          <span style={{ fontSize: '11px', color: '#71717A', fontWeight: 600 }}>Last 7 Days</span>
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

      {/* ── Transaction History Section with Segment Toggle ── */}
      <div style={{ marginBottom: '90px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#141417' }}>
            Activity Ledger
          </h2>
          <span style={{ fontSize: '12px', color: '#71717A' }}>
            {activeSegment === 'deposits' ? `${depositList.length} Deposits` : `${voucherList.length} Purchases`}
          </span>
        </div>

        {/* Capsule Segmented Toggle */}
        <div className="capsule-toggle-wrap" style={{ marginBottom: '16px' }}>
          <div className="capsule-toggle">
            <button
              type="button"
              className={`capsule-btn ${activeSegment === 'deposits' ? 'active' : ''}`}
              onClick={() => setActiveSegment('deposits')}
            >
              Deposits ({depositList.length})
            </button>
            <button
              type="button"
              className={`capsule-btn ${activeSegment === 'vouchers' ? 'active' : ''}`}
              onClick={() => setActiveSegment('vouchers')}
            >
              Pass Purchases ({voucherList.length})
            </button>
          </div>
        </div>

        {/* Segment 1: Deposits History */}
        {activeSegment === 'deposits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {depositList.length === 0 ? (
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '18px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  border: '1px dashed #E4E4E7',
                }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <ArrowDownLeftIcon size={24} color="#71717A" />
                </div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181B' }}>No Deposits Yet</div>
                <p style={{ fontSize: '12px', color: '#71717A', margin: '4px 0 16px' }}>
                  Use the deposit form above to add funds to your wallet.
                </p>
                <button
                  type="button"
                  onClick={scrollToDeposit}
                  style={{
                    background: 'var(--dock-bg, #141417)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Deposit Now
                </button>
              </div>
            ) : (
              depositList.map((tx) => (
                <div
                  key={tx.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    border: '1px solid #F4F4F5',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ArrowDownLeftIcon size={20} color="#10B981" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181B' }}>
                        Wallet Deposit
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>
                        {formatDate(tx.created_at)}
                      </div>
                      {tx.flw_ref && (
                        <div style={{ fontSize: '10px', color: '#A1A1AA', marginTop: '1px', fontFamily: 'monospace' }}>
                          Ref: {tx.flw_ref.substring(0, 20)}…
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#16A34A' }}>
                      +{formatPrice(tx.amount)}
                    </div>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        background: '#DCFCE7',
                        color: '#15803D',
                        padding: '2px 8px',
                        borderRadius: '8px',
                        display: 'inline-block',
                        marginTop: '2px',
                      }}
                    >
                      Successful
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Segment 2: Voucher Purchases History */}
        {activeSegment === 'vouchers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {voucherList.length === 0 ? (
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '18px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  border: '1px dashed #E4E4E7',
                }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <WifiIcon size={24} color="#71717A" />
                </div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181B' }}>No Wi-Fi Passes Purchased</div>
                <p style={{ fontSize: '12px', color: '#71717A', margin: '4px 0 16px' }}>
                  You haven&apos;t purchased any passes with your wallet balance yet.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/packages')}
                  style={{
                    background: 'var(--dock-bg, #141417)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Browse Wi-Fi Passes
                </button>
              </div>
            ) : (
              voucherList.map((tx) => (
                <div
                  key={tx.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    border: '1px solid #F4F4F5',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        background: 'rgba(124, 58, 237, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <TicketIcon size={20} color="#7C3AED" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181B' }}>
                        {tx.metadata?.plan_name || 'Wi-Fi Pass'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>
                        {tx.metadata?.voucher_code ? `PIN: ${tx.metadata.voucher_code} • ` : ''}
                        {formatDate(tx.created_at)}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#18181B' }}>
                      -{formatPrice(tx.amount)}
                    </div>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        background: '#EDE9FE',
                        color: '#6D28D9',
                        padding: '2px 8px',
                        borderRadius: '8px',
                        display: 'inline-block',
                        marginTop: '2px',
                      }}
                    >
                      Voucher
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
