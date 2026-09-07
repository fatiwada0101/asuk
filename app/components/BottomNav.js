'use client';

import { usePathname, useRouter } from 'next/navigation';
import { HomeIcon, WifiIcon, ActivityIcon, WalletIcon, PieChartIcon, UserIcon } from './Icons';

const navItems = [
  { id: 'home', label: 'Home', icon: HomeIcon, path: '/' },
  { id: 'packages', label: 'Passes', icon: WifiIcon, path: '/packages' },
  { id: 'telemetry', label: 'Session', icon: ActivityIcon, path: '/vouchers/status' },
  { id: 'wallet', label: 'Wallet', icon: WalletIcon, path: '/wallet' },
  { id: 'analytics', label: 'Analytics', icon: PieChartIcon, path: '/analytics' },
  { id: 'auth', label: 'Profile', icon: UserIcon, path: '/auth' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Don't show on admin panel
  if (pathname.startsWith('/super-admin') || pathname.startsWith('/admin')) return null;

  return (
    <nav className="floating-dock" aria-label="Bottom Navigation">
      {navItems.map((item) => {
        const IconComponent = item.icon;
        const isActive =
          item.path === '/'
            ? pathname === '/'
            : item.id === 'telemetry'
            ? pathname.startsWith('/vouchers/status') || pathname.startsWith('/status')
            : item.id === 'packages'
            ? pathname.startsWith('/packages') || pathname === '/vouchers'
            : pathname.startsWith(item.path);

        if (isActive) {
          return (
            <button
              key={item.id}
              className="dock-pill-active"
              onClick={() => router.push(item.path)}
            >
              <IconComponent size={18} color="#141417" />
              <span>{item.label}</span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            className="dock-item"
            onClick={() => router.push(item.path)}
            aria-label={item.label}
          >
            <IconComponent size={20} color="#8E8E93" />
          </button>
        );
      })}
    </nav>
  );
}
