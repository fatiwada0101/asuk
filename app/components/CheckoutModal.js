'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

export default function CheckoutModal({ isOpen, onClose, plan, onSuccess }) {
  const router = useRouter();
  const { user, wallet, refreshWallet } = useAuth();
  const { appName } = useBranding();

  const [paymentMethod, setPaymentMethod] = useState(user ? 'wallet' : 'card');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [step, setStep] = useState('review'); // 'review' | 'processing' | 'error' | 'success'
  const [loadingText, setLoadingText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [voucherData, setVoucherData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [flwConfig, setFlwConfig] = useState({ publicKey: '', enabled: false });
  const [routerStatus, setRouterStatus] = useState({
    loaded: false,
    online: true,
    has_fallback_vouchers: false,
    fallback_counts: {},
  });

  const walletBalance = wallet ? parseFloat(wallet.balance) : 0;
  const price = plan ? Number(plan.price) : 0;
  const hasSufficientWallet = walletBalance >= price;

  // Fetch public gateway & router health config
  useEffect(() => {
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(d => {
        if (d.flutterwave) setFlwConfig(d.flutterwave);
        if (d.mikrotik) {
          setRouterStatus({
            loaded: true,
            online: !!d.mikrotik.online,
            has_fallback_vouchers: !!d.mikrotik.has_fallback_vouchers,
            fallback_counts: d.mikrotik.fallback_counts || {},
          });
        }
      })
      .catch(() => {
        setRouterStatus(prev => ({ ...prev, loaded: true }));
      });
  }, []);

  // Reset state when modal opens with a new plan
  useEffect(() => {
    if (isOpen) {
      setStep('review');
      setErrorMessage('');
      setVoucherData(null);
      setCopied(false);
      setPaymentMethod(user && hasSufficientWallet ? 'wallet' : 'card');
    }
  }, [isOpen, plan, user, hasSufficientWallet]);

  const isRouterOnline = routerStatus.online;
  const isRouterConfigured = routerStatus.configured !== false;
  const fallbackCount = plan
    ? Math.max(
        Number(routerStatus.fallback_counts?.[plan.name] || 0),
        Number(routerStatus.fallback_counts?.[plan.id] || 0)
      )
    : 0;
  const canPurchase = !routerStatus.loaded || isRouterOnline || fallbackCount > 0;

  if (!isOpen || !plan) return null;

  const formatPrice = (amt) => '₦' + Number(amt || 0).toLocaleString();

  const handleCopyCode = async () => {
    if (!voucherData?.code) return;
    try {
      await navigator.clipboard.writeText(voucherData.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const el = document.createElement('textarea');
      el.value = voucherData.code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Pay with user's wallet
  const handleWalletPayment = async () => {
    if (routerStatus.loaded && !canPurchase) {
      const msg = !isRouterConfigured
        ? `Purchases are temporarily unavailable because the Wi-Fi router is not configured and no backup vouchers are in stock for ${plan.name}.`
        : `Purchases are temporarily unavailable because the router is unreachable and no backup vouchers are in stock for ${plan.name}.`;
      setErrorMessage(msg);
      return;
    }

    if (!user) {
      router.push('/auth');
      return;
    }
    if (!hasSufficientWallet) {
      router.push('/wallet');
      return;
    }

    setStep('processing');
    setLoadingText('Connecting to MikroTik Router...');

    try {
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: plan.id,
          plan_name: plan.name,
          price: plan.price,
          duration: plan.duration,
          user_id: user.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create voucher on router');
      }

      await refreshWallet();

      const activeV = {
        code: data.voucher_code,
        plan: plan.name,
        duration: plan.duration,
        purchasedAt: Date.now(),
      };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('asuk_active_voucher', JSON.stringify(activeV));
          window.dispatchEvent(new Event('active_voucher_updated'));
        } catch (e) {}
      }

      setVoucherData({
        code: data.voucher_code,
        plan: plan.name,
        duration: plan.duration,
        routerId: data.router_id,
        isFallback: data.is_fallback,
      });
      setStep('success');
      if (onSuccess) onSuccess();
    } catch (err) {
      setErrorMessage(err.message);
      setStep('error');
    }
  };

  // Pay online via Flutterwave
  const handleCardPayment = async () => {
    if (routerStatus.loaded && !canPurchase) {
      const msg = !isRouterConfigured
        ? `Purchases are temporarily unavailable because the Wi-Fi router is not configured and no backup vouchers are in stock for ${plan.name}.`
        : `Purchases are temporarily unavailable because the router is unreachable and no backup vouchers are in stock for ${plan.name}.`;
      setErrorMessage(msg);
      return;
    }

    if (!guestEmail && !user) {
      setErrorMessage('Please provide an email address for your payment receipt.');
      return;
    }

    if (!flwConfig.publicKey) {
      setErrorMessage('Online card payment gateway is not yet configured. Please Sign In to pay with Wallet balance or configure Flutterwave in Super Admin.');
      return;
    }

    if (typeof window.FlutterwaveCheckout === 'undefined') {
      setErrorMessage('Payment gateway is loading. Please check your internet connection.');
      return;
    }

    setStep('processing');
    setLoadingText('Opening secure payment...');

    const txRef = 'FLW_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7).toUpperCase();

    window.FlutterwaveCheckout({
      public_key: flwConfig.publicKey,
      tx_ref: txRef,
      amount: price,
      currency: 'NGN',
      payment_options: 'card,banktransfer,ussd',
      customer: {
        email: user?.email || guestEmail,
        phone_number: guestPhone || '08000000000',
        name: user?.user_metadata?.full_name || guestEmail.split('@')[0] || 'Guest',
      },
      customizations: {
        title: `${appName} Wi-Fi`,
        description: `${plan.name} Wi-Fi Voucher`,
        logo: 'https://cdn-icons-png.flaticon.com/512/93/93158.png',
      },
      callback: async function (response) {
        if (response.status === 'successful' || response.status === 'completed') {
          setLoadingText('Verifying payment & creating voucher on MikroTik router...');
          try {
            const verifyRes = await fetch('/api/purchase/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                transaction_id: response.transaction_id,
                tx_ref: response.tx_ref || txRef,
                plan_id: plan.id,
                plan_name: plan.name,
                price: plan.price,
                duration: plan.duration,
                email: user?.email || guestEmail,
                phone: guestPhone,
                user_id: user?.id || null,
              }),
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) {
              throw new Error(verifyData.error || 'Router provisioning failed after payment');
            }

            const activeV = {
              code: verifyData.voucher_code,
              plan: plan.name,
              duration: plan.duration,
              purchasedAt: Date.now(),
            };
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('asuk_active_voucher', JSON.stringify(activeV));
                window.dispatchEvent(new Event('active_voucher_updated'));
              } catch (e) {}
            }

            setVoucherData({
              code: verifyData.voucher_code,
              plan: plan.name,
              duration: plan.duration,
              routerId: verifyData.router_id,
              isFallback: verifyData.is_fallback,
            });
            setStep('success');
            if (onSuccess) onSuccess();
          } catch (err) {
            setErrorMessage(err.message);
            setStep('error');
          }
        } else {
          setErrorMessage('Payment was not completed. Please try again.');
          setStep('error');
        }
      },
      onclose: function () {
        setStep('review');
      },
    });
  };

  return (
    <div className="checkout-overlay" onClick={onClose}>
      <div className="checkout-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="checkout-header">
          <div className="checkout-title-wrap">
            <span className="checkout-badge">Instant Pass</span>
            <h3>Checkout</h3>
          </div>
          <button className="checkout-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── STEP 1: REVIEW & PAYMENT SELECTION ── */}
        {step === 'review' && (
          <div className="checkout-content">
            {/* Plan Summary Card */}
            <div className="checkout-plan-card">
              <div className="checkout-plan-info">
                <h4>{plan.name}</h4>
                <p>{plan.speed || 'High-Speed Wi-Fi'} • {plan.duration} access</p>
              </div>
              <div className="checkout-plan-price">
                <span className="amount">{formatPrice(plan.price)}</span>
                <span className="tax-label">Total Incl. VAT</span>
              </div>
            </div>

            {/* Offline / Fallback Status Banner */}
            {routerStatus.loaded && !canPurchase && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  color: '#f87171',
                  fontSize: '0.88rem',
                  lineHeight: '1.4'
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                <div>
                  <strong style={{ color: '#fca5a5', display: 'block', marginBottom: '2px' }}>
                    Service Temporarily Unavailable
                  </strong>
                  The Wi-Fi router is currently offline and no backup vouchers are in stock for <strong>{plan.name}</strong>. Payments are paused to protect your funds.
                </div>
              </div>
            )}

            {routerStatus.loaded && !isRouterOnline && fallbackCount > 0 && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  color: '#93c5fd',
                  fontSize: '0.88rem',
                  lineHeight: '1.4'
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>🛡️</span>
                <div>
                  <strong style={{ color: '#bfdbfe', display: 'block', marginBottom: '2px' }}>
                    Backup Voucher Reserve Active
                  </strong>
                  Router is in offline mode, but <strong>{fallbackCount}</strong> pre-generated voucher{fallbackCount > 1 ? 's are' : ' is'} ready for instant delivery.
                </div>
              </div>
            )}

            {/* Error banner if any */}
            {errorMessage && (
              <div className="checkout-error-banner">
                <span>⚠️</span>
                <div>{errorMessage}</div>
              </div>
            )}

            {/* Guest Details (only if not logged in) */}
            {!user && (
              <div className="checkout-guest-fields">
                <label className="checkout-field-label">Receipt & Notification</label>
                <div className="checkout-input-group">
                  <input
                    type="email"
                    placeholder="Email address for voucher receipt"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Phone number (optional)"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Payment Method Selector */}
            <div className="checkout-payment-methods">
              <label className="checkout-field-label">Select Payment Method</label>

              {/* Method: Wallet */}
              {user ? (
                <div
                  className={`checkout-method-option ${paymentMethod === 'wallet' ? 'selected' : ''}`}
                  onClick={() => setPaymentMethod('wallet')}
                >
                  <div className="method-radio">
                    <span className="radio-dot" />
                  </div>
                  <div className="method-details">
                    <div className="method-title-row">
                      <strong>Asuk Wallet</strong>
                      <span className="balance-pill">
                        Balance: {formatPrice(walletBalance)}
                      </span>
                    </div>
                    <p className="method-desc">
                      {hasSufficientWallet
                        ? 'Instant payment with zero transaction fees'
                        : `Insufficient funds. Need ${formatPrice(price - walletBalance)} more.`}
                    </p>
                  </div>
                  <span className="method-icon">💳</span>
                </div>
              ) : null}

              {/* Method: Online Card / Transfer (Flutterwave) */}
              <div
                className={`checkout-method-option ${paymentMethod === 'card' ? 'selected' : ''}`}
                onClick={() => setPaymentMethod('card')}
              >
                <div className="method-radio">
                  <span className="radio-dot" />
                </div>
                <div className="method-details">
                  <div className="method-title-row">
                    <strong>Debit Card / Bank Transfer</strong>
                    <span className="card-logos">Mastercard • Visa • Verve</span>
                  </div>
                  <p className="method-desc">
                    Secure 256-bit checkout powered by Flutterwave
                  </p>
                </div>
                <span className="method-icon">🔒</span>
              </div>
            </div>

            {/* Security Guarantee */}
            <div className="checkout-security-notice">
              <span>🛡️</span>
              <span>100% Secure & Real-Time MikroTik Hotspot Provisioning</span>
            </div>

            {/* Actions */}
            <div className="checkout-actions">
              {routerStatus.loaded && !canPurchase ? (
                <button
                  className="btn btn-block checkout-pay-btn"
                  disabled={true}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.35)',
                    cursor: 'not-allowed',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  Unavailable (Router Offline)
                </button>
              ) : paymentMethod === 'wallet' ? (
                hasSufficientWallet ? (
                  <button className="btn btn-primary btn-block checkout-pay-btn" onClick={handleWalletPayment}>
                    Pay {formatPrice(plan.price)} from Wallet
                  </button>
                ) : (
                  <button className="btn btn-primary btn-block checkout-pay-btn" onClick={() => router.push('/wallet')}>
                    Top Up Wallet ({formatPrice(walletBalance)})
                  </button>
                )
              ) : (
                <button className="btn btn-primary btn-block checkout-pay-btn" onClick={handleCardPayment}>
                  Pay {formatPrice(plan.price)} via Card / Transfer
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: PROCESSING ── */}
        {step === 'processing' && (
          <div className="checkout-state-card">
            <div className="checkout-spinner" />
            <h3>Processing Request</h3>
            <p>{loadingText || 'Connecting to router...'}</p>
            <div className="checkout-steps-pill">
              <span>⚡ Live MikroTik Connection</span>
            </div>
          </div>
        )}

        {/* ── STEP 3: ERROR STATE ── */}
        {step === 'error' && (
          <div className="checkout-state-card error">
            <div className="checkout-state-icon error">⚠️</div>
            <h3>Could Not Complete Purchase</h3>
            <p className="error-description">{errorMessage}</p>

            <div className="checkout-error-tips">
              <strong>Why did this happen?</strong>
              <ul>
                <li>The router could be powered off or unreachable on the local network.</li>
                <li>Router credentials or IP address might need updating in Super Admin.</li>
                <li>Your wallet was NOT deducted and no funds were lost.</li>
              </ul>
            </div>

            <div className="checkout-actions" style={{ marginTop: '20px' }}>
              <button className="btn btn-primary" onClick={() => setStep('review')}>
                Try Again
              </button>
              <button className="btn btn-dark" onClick={onClose}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: SUCCESS VOUCHER TICKET ── */}
        {step === 'success' && voucherData && (
          <div className="checkout-ticket-wrap">
            <div className="ticket-top">
              <div className="ticket-badge">
                {voucherData.isFallback ? '✓ Issued from Backup Pool' : '✓ Provisioned on Router'}
              </div>
              <h3>Wi-Fi Voucher Pass</h3>
              <p>{voucherData.plan} • Active Hotspot Account</p>
            </div>

            <div className="ticket-perforation">
              <span className="cutout-left" />
              <span className="dash-line" />
              <span className="cutout-right" />
            </div>

            <div className="ticket-body">
              <span className="voucher-label">YOUR WI-FI VOUCHER CODE</span>
              <div className="voucher-display">
                <span className="code-text">{voucherData.code}</span>
              </div>

              <button
                className={`btn btn-block ${copied ? 'btn-success' : 'btn-primary'}`}
                onClick={handleCopyCode}
                style={{ marginTop: '14px' }}
              >
                {copied ? '✓ Copied to Clipboard!' : '📋 Copy Voucher Code'}
              </button>

              <div className="ticket-instructions">
                <strong>How to Connect:</strong>
                <ol>
                  <li>Connect your device to Wi-Fi: <strong>AsukTech_Hotspot</strong></li>
                  <li>Open any web browser or wait for login screen to pop up</li>
                  <li>Enter the code <strong>{voucherData.code}</strong> as both Username & Password</li>
                </ol>
              </div>

              <button className="btn btn-dark btn-block" onClick={onClose} style={{ marginTop: '16px' }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
