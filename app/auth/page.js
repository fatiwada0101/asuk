'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';
import {
  ChevronLeftIcon,
  WifiIcon,
  ShieldIcon,
  UserIcon,
  MailIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  LogOutIcon,
  WalletIcon,
  ArrowUpRightIcon,
} from '../components/Icons';

export default function AuthPage() {
  const router = useRouter();
  const { signUp, signIn, signOut, user, profile, wallet, loading: authLoading } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLogin) {
        await signIn(email.trim(), password);
        localStorage.removeItem('asuk_guest_session');
        router.push('/');
      } else {
        const data = await signUp(email.trim(), password, fullName.trim());
        if (data?.user?.identities?.length === 0) {
          setError('An account with this email already exists.');
        } else if (data?.user && !data?.session) {
          setSuccess('Account created! Please sign in with your credentials.');
          setIsLogin(true);
          setPassword('');
        } else {
          router.push('/');
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      localStorage.removeItem('asuk_guest_session');
      router.push('/auth');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // ── Logged In User: Profile & Account Overview ──
  if (user && !authLoading) {
    const displayName = profile?.full_name || user.email?.split('@')[0] || 'Member';
    const initial = displayName.charAt(0).toUpperCase();
    const balance = wallet ? parseFloat(wallet.balance) : 0;

    return (
      <div className="app-shell">
        {/* Topbar */}
        <div className="screen-topbar">
          <button
            className="circle-icon-btn"
            onClick={() => router.push('/')}
            aria-label="Back to home"
          >
            <ChevronLeftIcon size={20} color="#121217" />
          </button>

          <h1 className="screen-title">My Account</h1>

          <button
            className="circle-icon-btn"
            onClick={() => router.push('/super-admin')}
            aria-label="Super Admin"
            title="Super Admin Portal"
          >
            <ShieldIcon size={20} color="#121217" />
          </button>
        </div>

        {/* Profile Card */}
        <div className="profile-hero-card">
          <div className="profile-avatar-large">{initial}</div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {displayName}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {user.email}
          </p>
          <div style={{ marginTop: '10px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10B981',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              ● Verified Customer
            </span>
          </div>
        </div>

        {/* Wallet & Stats Strip */}
        <div className="profile-stats-grid">
          <div className="profile-stat-box">
            <span className="stat-label">Wallet Balance</span>
            <div className="stat-value">{formatPrice(balance)}</div>
            <button
              onClick={() => router.push('/wallet')}
              style={{
                marginTop: '8px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#7257FF',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Top-Up Funds ↗
            </button>
          </div>

          <div className="profile-stat-box">
            <span className="stat-label">Wi-Fi Passes</span>
            <div className="stat-value">Active</div>
            <button
              onClick={() => router.push('/packages')}
              style={{
                marginTop: '8px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#7257FF',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              View Passes ↗
            </button>
          </div>
        </div>

        {/* Quick Menu Links */}
        <div className="profile-menu-card">
          <div className="profile-menu-item" onClick={() => router.push('/wallet')}>
            <div className="profile-menu-left">
              <div className="profile-menu-icon">
                <WalletIcon size={18} color="#7257FF" />
              </div>
              <span>Wallet & Transactions</span>
            </div>
            <ArrowUpRightIcon size={16} color="#8E8E93" />
          </div>

          <div className="profile-menu-item" onClick={() => router.push('/packages')}>
            <div className="profile-menu-left">
              <div className="profile-menu-icon">
                <WifiIcon size={18} color="#10B981" />
              </div>
              <span>Buy Wi-Fi Passes</span>
            </div>
            <ArrowUpRightIcon size={16} color="#8E8E93" />
          </div>

          <div className="profile-menu-item" onClick={() => router.push('/analytics')}>
            <div className="profile-menu-left">
              <div className="profile-menu-icon">
                <ShieldIcon size={18} color="#FFB84C" />
              </div>
              <span>Usage Analytics</span>
            </div>
            <ArrowUpRightIcon size={16} color="#8E8E93" />
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            padding: '14px',
            background: '#FFFFFF',
            border: '1.5px solid #FEE2E2',
            borderRadius: '999px',
            color: '#EF4444',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-subtle)',
            transition: 'all 0.15s ease',
          }}
        >
          <LogOutIcon size={18} color="#EF4444" />
          Sign Out of Account
        </button>

        <BottomNav />
      </div>
    );
  }

  // ── Logged Out: Sign In & Sign Up Form ──
  return (
    <div className="app-shell">
      {/* Top Bar */}
      <div className="screen-topbar">
        <button
          className="circle-icon-btn"
          onClick={() => router.push('/')}
          aria-label="Back to home"
        >
          <ChevronLeftIcon size={20} color="#121217" />
        </button>

        <h1 className="screen-title">{isLogin ? 'Sign In' : 'Create Account'}</h1>

        <button
          className="circle-icon-btn"
          onClick={() => router.push('/super-admin')}
          aria-label="Super Admin Portal"
          title="Super Admin Portal"
        >
          <ShieldIcon size={20} color="#121217" />
        </button>
      </div>

      {/* Capsule Segmented Toggle */}
      <div className="capsule-toggle-wrap">
        <div className="capsule-toggle">
          <button
            type="button"
            className={`capsule-btn ${isLogin ? 'active' : ''}`}
            onClick={() => {
              setIsLogin(true);
              setError('');
              setSuccess('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`capsule-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => {
              setIsLogin(false);
              setError('');
              setSuccess('');
            }}
          >
            Sign Up
          </button>
        </div>
      </div>

      {/* Brand Auth Card */}
      <div className="auth-card">
        <div className="auth-logo-badge">
          <WifiIcon size={26} color="#7257FF" />
        </div>

        <h2 className="auth-title">{isLogin ? 'Welcome Back' : 'Join Asuk Tech'}</h2>
        <p className="auth-subtitle">
          {isLogin
            ? 'Sign in to access your wallet & saved passes'
            : 'Register to manage your wallet and Wi-Fi passes'}
        </p>

        {error && <div className="auth-toast-error">{error}</div>}
        {success && <div className="auth-toast-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="auth-field">
              <label className="auth-field-label">Full Name</label>
              <div className="auth-input-box">
                <UserIcon size={18} color="#8E8E93" />
                <input
                  type="text"
                  placeholder="e.g. Muminul Hoque"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={!isLogin}
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label className="auth-field-label">Email Address</label>
            <div className="auth-input-box">
              <MailIcon size={18} color="#8E8E93" />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-field-label">Password</label>
            <div className="auth-input-box">
              <LockIcon size={18} color="#8E8E93" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOffIcon size={18} color="#8E8E93" />
                ) : (
                  <EyeIcon size={18} color="#8E8E93" />
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <span>{isLogin ? 'Sign In to Account' : 'Create Free Account'}</span>
            )}
          </button>
        </form>

        <div
          style={{
            textAlign: 'center',
            marginTop: '18px',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          {isLogin ? "Don't have an account yet? " : 'Already registered? '}
          <span
            style={{
              color: '#7257FF',
              fontWeight: 800,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setSuccess('');
            }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </span>
        </div>

        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('asuk_guest_session', 'true');
              router.push('/');
            }}
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 12px',
            }}
          >
            ← Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
