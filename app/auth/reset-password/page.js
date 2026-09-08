'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import {
  WifiIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
} from '../../components/Icons';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase sends the user here after clicking the magic link in the reset email.
  // The recovery token is exchanged automatically by Supabase via the URL hash.
  useEffect(() => {
    const handleAuthChange = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      } else if (session) {
        setSessionReady(true);
      }
    });

    // Also check if we already have a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    return () => {
      handleAuthChange.data.subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to update password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F5F7',
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
        padding: '20px',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 420,
          background: '#FFFFFF',
          borderRadius: 24,
          padding: '36px 28px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <CheckIcon size={28} color="#10B981" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#121217', margin: '0 0 8px' }}>
            Password Updated!
          </h2>
          <p style={{ fontSize: '13px', color: '#8E8E93', margin: 0 }}>
            Your password has been successfully reset. Redirecting to home...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F5F5F7',
      fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#FFFFFF',
        borderRadius: 24,
        padding: '36px 28px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(114, 87, 255, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <WifiIcon size={24} color="#7257FF" />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#121217', margin: '0 0 6px' }}>
            Set New Password
          </h1>
          <p style={{ fontSize: '13px', color: '#8E8E93', margin: 0 }}>
            Enter your new password below to regain access
          </p>
        </div>

        {!sessionReady && (
          <div style={{
            padding: '14px', background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 12,
            color: '#92400E', fontSize: '12.5px', marginBottom: 18, textAlign: 'center',
            lineHeight: 1.4,
          }}>
            ⏳ Verifying your reset token... If this persists, the link may have expired. Go back to <a href="/auth" style={{ color: '#7257FF', fontWeight: 700 }}>Sign In</a> and request a new reset.
          </div>
        )}

        {error && (
          <div style={{
            padding: '11px 14px', background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12,
            color: '#DC2626', fontSize: '12.5px', marginBottom: 16, textAlign: 'center',
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleResetPassword}>
          <div className="auth-field">
            <label className="auth-field-label">New Password</label>
            <div className="auth-input-box">
              <LockIcon size={18} color="#8E8E93" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                autoFocus
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

          <div className="auth-field">
            <label className="auth-field-label">Confirm Password</label>
            <div className="auth-input-box">
              <LockIcon size={18} color="#8E8E93" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading || !sessionReady}
          >
            {loading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <a
            href="/auth"
            style={{
              color: '#7257FF',
              fontSize: '13px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            ← Back to Sign In
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F5F7',
      }}>
        <p style={{ color: '#8E8E93', fontSize: '14px' }}>Loading...</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
