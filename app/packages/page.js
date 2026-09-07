'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';
import CheckoutModal from '../components/CheckoutModal';
import {
  ChevronLeftIcon,
  ShieldIcon,
  WifiIcon,
  ArrowUpRightIcon,
  CheckIcon,
} from '../components/Icons';

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Passes' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'unlimited', label: 'Unlimited' },
];

export default function PackagesPage() {
  const router = useRouter();
  const { user, refreshWallet } = useAuth();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [toast, setToast] = useState('');

  const formatPrice = (amount) =>
    '₦' +
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch('/api/super-admin/plans');
        if (res.ok) {
          const data = await res.json();
          setPlans(data);
        }
      } catch (err) {
        console.error('Error loading plans:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  // Filter plans based on active capsule filter
  const filteredPlans = useMemo(() => {
    if (activeFilter === 'all') return plans;
    if (activeFilter === 'hourly') {
      return plans.filter((p) => {
        const d = (p.duration || '').toLowerCase();
        const n = (p.name || '').toLowerCase();
        return d.includes('hour') || n.includes('hour') || d.includes('hr');
      });
    }
    if (activeFilter === 'daily') {
      return plans.filter((p) => {
        const d = (p.duration || '').toLowerCase();
        const n = (p.name || '').toLowerCase();
        return d.includes('day') || n.includes('day') || d.includes('24h');
      });
    }
    if (activeFilter === 'unlimited') {
      return plans.filter((p) => {
        const s = (p.speed || '').toLowerCase();
        const n = (p.name || '').toLowerCase();
        return s.includes('unlimited') || n.includes('unlimited') || p.popular;
      });
    }
    return plans;
  }, [plans, activeFilter]);

  // Find a flagship / popular plan for the top hero banner
  const featuredPlan = useMemo(() => {
    return plans.find((p) => p.popular) || plans[0] || null;
  }, [plans]);

  return (
    <div className="app-shell">
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        plan={selectedPlan}
        onSuccess={() => {
          if (user) refreshWallet();
          showToast('Pass voucher activated!');
        }}
      />

      {/* Screen Topbar */}
      <div className="screen-topbar">
        <button
          className="circle-icon-btn"
          onClick={() => router.push('/')}
          aria-label="Back to home"
        >
          <ChevronLeftIcon size={20} color="#121217" />
        </button>

        <h1 className="screen-title">Wi-Fi Passes</h1>

        <div style={{ width: '40px' }} />
      </div>

      {/* Featured Flagship Pass Hero */}
      {featuredPlan && (
        <div className="packages-hero-card">
          <div className="packages-hero-tag">
            <span>⚡ Most Popular Choice</span>
          </div>

          <h2 className="packages-hero-title">{featuredPlan.name}</h2>
          <p className="packages-hero-sub">
            {featuredPlan.speed || 'High-Speed 12 Mbps'} • {featuredPlan.devices || 1} Device{(featuredPlan.devices || 1) > 1 ? 's' : ''} • {featuredPlan.duration}
          </p>

          <div className="packages-hero-bottom">
            <div className="packages-hero-price">
              {formatPrice(featuredPlan.price)}
            </div>

            <button
              className="packages-hero-btn"
              onClick={() => handleSelectPlan(featuredPlan)}
            >
              + Buy Pass Now
            </button>
          </div>
        </div>
      )}

      {/* Category Segmented Capsule Filter */}
      <div className="packages-filter-wrap">
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat.id}
            className={`packages-filter-pill ${activeFilter === cat.id ? 'active' : ''}`}
            onClick={() => setActiveFilter(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Passes Grid */}
      {loading ? (
        <div className="pass-card-modern" style={{ textAlign: 'center', padding: '36px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Loading live router passes...
          </p>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="pass-card-modern" style={{ textAlign: 'center', padding: '36px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            No passes found in this category.
          </p>
        </div>
      ) : (
        <div className="pass-grid-list">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              className="pass-card-modern"
              onClick={() => handleSelectPlan(plan)}
            >
              <div className="pass-card-top">
                <div className="pass-badge-group">
                  <div className="pass-wifi-icon-badge">
                    <WifiIcon size={20} color="#7257FF" />
                  </div>
                  <span className={`pass-tag-pill ${plan.popular ? 'popular' : ''}`}>
                    {plan.duration}
                  </span>
                </div>

                <div className="pass-price-large">{formatPrice(plan.price)}</div>
              </div>

              <div className="pass-card-mid">
                <h3 className="pass-card-title">{plan.name}</h3>
                <p className="pass-card-specs">
                  {plan.speed || 'Unlimited Bandwidth'} • {plan.devices || 1} Device{(plan.devices || 1) > 1 ? 's' : ''}
                </p>
              </div>

              <div className="pass-card-bottom">
                <div className="pass-instant-tag">
                  <CheckIcon size={14} color="#10B981" />
                  <span>Instant MikroTik Pin</span>
                </div>

                <button
                  type="button"
                  className="pass-buy-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectPlan(plan);
                  }}
                >
                  <span>Select</span>
                  <ArrowUpRightIcon size={14} color="#FFFFFF" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
