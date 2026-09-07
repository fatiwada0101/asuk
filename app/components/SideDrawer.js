'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import {
  HomeIcon,
  WifiIcon,
  WalletIcon,
  PieChartIcon,
  UserIcon,
  ShieldIcon,
  XIcon,
  LogOutIcon,
  ArrowUpRightIcon,
} from './Icons';

const navLinks = [
  { id: 'home', label: 'Home Dashboard', icon: HomeIcon, path: '/' },
  { id: 'packages', label: 'Wi-Fi Passes', icon: WifiIcon, path: '/packages' },
  { id: 'status', label: 'Active Pass Timer', icon: WifiIcon, path: '/vouchers/status' },
  { id: 'wallet', label: 'Wallet & History', icon: WalletIcon, path: '/wallet', auth: true },
  { id: 'analytics', label: 'Usage Analytics', icon: PieChartIcon, path: '/analytics' },
  { id: 'auth', label: 'My Profile', icon: UserIcon, path: '/auth' },
];

export default function SideDrawer({ isOpen, onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, wallet, signOut } = useAuth();
  const { appName, theme } = useBranding();

  const handleNavigate = (path, requiresAuth) => {
    if (requiresAuth && !user) {
      router.push('/auth');
    } else {
      router.push(path);
    }
    onClose();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      localStorage.removeItem('asuk_guest_session');
      router.push('/auth');
    } catch (err) {
      console.error('Sign out error:', err);
    }
    onClose();
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Guest User';
  const initial = displayName.charAt(0).toUpperCase();
  const walletBalance = wallet ? parseFloat(wallet.balance) : 0;

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <>
      {/* Backdrop blur overlay */}
      <div
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modern Native Side Drawer */}
      <aside className={`side-drawer ${isOpen ? 'open' : ''}`} aria-label="Main navigation drawer">
        {/* Top bar with brand and close button */}
        <div className="drawer-top-bar">
          <div className="drawer-brand">
            <WifiIcon size={20} color={theme?.primary || '#7257FF'} />
            <span>{appName} Hotspot</span>
          </div>

          <button
            className="circle-icon-btn"
            onClick={onClose}
            aria-label="Close menu"
            style={{ width: '38px', height: '38px' }}
          >
            <XIcon size={18} color="#121217" />
          </button>
        </div>

        {/* User Identity Card */}
        <div className="drawer-user-card">
          <div className="drawer-user-row">
            <div className="drawer-avatar">{initial}</div>
            <div className="drawer-user-info">
              <h3>{displayName}</h3>
              <p>{user ? user.email : 'Sign in to access saved passes & wallet'}</p>
            </div>
          </div>

          {user && (
            <div className="drawer-balance-strip">
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Wallet Balance
                </span>
                <div className="bal-amount">{formatPrice(walletBalance)}</div>
              </div>

              <button
                className="bal-btn"
                onClick={() => {
                  router.push('/wallet');
                  onClose();
                }}
              >
                + Top-Up
              </button>
            </div>
          )}
        </div>

        {/* Navigation Menu Items */}
        <nav className="drawer-menu">
          {navLinks.map((item) => {
            const IconComp = item.icon;
            const isActive =
              item.path === '/'
                ? pathname === '/'
                : pathname.startsWith(item.path);

            return (
              <button
                key={item.id}
                className={`drawer-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigate(item.path, item.auth)}
              >
                <div className="drawer-nav-left">
                  <div className="drawer-icon-box">
                    <IconComp size={18} color="currentColor" />
                  </div>
                  <span>{item.label}</span>
                </div>

                <ArrowUpRightIcon
                  size={15}
                  color={isActive ? '#FFFFFF' : '#8E8E93'}
                />
              </button>
            );
          })}
        </nav>

        {/* Drawer Footer */}
        <div className="drawer-footer">
          {/* Live Router Indicator */}
          <div className="drawer-gateway-pill">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
            <span>RouterOS Gateway Online</span>
          </div>

          {user ? (
            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '12px',
                background: '#FFFFFF',
                border: '1.5px solid #FEE2E2',
                borderRadius: '999px',
                color: '#EF4444',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <LogOutIcon size={16} color="#EF4444" />
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => {
                router.push('/auth');
                onClose();
              }}
              style={{
                width: '100%',
                padding: '12px',
                background: '#141417',
                color: '#FFFFFF',
                borderRadius: '999px',
                fontSize: '13.5px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.16)',
              }}
            >
              <UserIcon size={16} color="#FFFFFF" />
              Sign In / Register
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
