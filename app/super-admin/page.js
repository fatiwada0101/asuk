'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { THEME_PALETTES } from '../context/BrandingContext';
import {
  TrendingUpIcon,
  WifiIcon,
  ShieldIcon,
  CpuIcon,
  WalletIcon,
  RefreshIcon,
  TrashIcon,
  EditPencilIcon,
  CheckIcon,
  PlusIcon,
  LogOutIcon,
  TicketIcon,
  UsersIcon,
  NetworkIcon,
  ActivityIcon,
  SearchIcon,
  ServerIcon,
  ClockIcon,
  ZapIcon,
  ThermometerIcon,
} from '../components/Icons';
import MikroTikSetupGuide from '../components/MikroTikSetupGuide';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: TrendingUpIcon },
  { id: 'finance', label: 'Finance', icon: WalletIcon },
  { id: 'sessions', label: 'Live Sessions', icon: WifiIcon },
  { id: 'vouchers', label: 'Voucher Factory', icon: TicketIcon },
  { id: 'fallback-vouchers', label: 'Fallback Pool', icon: ShieldIcon },
  { id: 'router-users', label: 'Router Users', icon: UsersIcon },
  { id: 'profiles', label: 'Hotspot Profiles', icon: ShieldIcon },
  { id: 'plans', label: 'Internet Plans', icon: WalletIcon },
  { id: 'network', label: 'Network Health', icon: ActivityIcon },
  { id: 'branding', label: 'Branding & Theme', icon: EditPencilIcon },
  { id: 'mikrotik', label: 'MikroTik Config', icon: CpuIcon },
  { id: 'payments', label: 'Payment Gateway', icon: ServerIcon },
];

// ═══════════════════════════════════════════════════════════
// FINANCE TAB COMPONENT
// ═══════════════════════════════════════════════════════════
function FinanceTab({ adminHeaders, formatPrice, showToast }) {
  const [financeData, setFinanceData] = useState(null);
  const [finLoading, setFinLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Server-side pagination & search states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const getDateRange = useCallback((filter) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    let start = today, end = today;

    switch (filter) {
      case 'today':
        start = today; end = today; break;
      case 'this_week': {
        const d = new Date(now); d.setDate(d.getDate() - d.getDay());
        start = d.toISOString().split('T')[0]; end = today; break;
      }
      case 'this_month': {
        start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`; end = today; break;
      }
      case 'last_month': {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        start = lm.toISOString().split('T')[0]; end = lmEnd.toISOString().split('T')[0]; break;
      }
      case 'custom':
        start = customStart || today; end = customEnd || today; break;
    }
    return { start, end };
  }, [customStart, customEnd]);

  const abortControllerRef = useRef(null);
  const seqRef = useRef(0);

  const fetchFinanceData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentSeq = ++seqRef.current;

    setFinLoading(true);
    try {
      const { start, end } = getDateRange(dateFilter);
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/super-admin/finance?${params.toString()}`, {
        headers: adminHeaders(),
        signal: controller.signal,
      });

      if (currentSeq !== seqRef.current) return; // Discard response from outdated request

      if (res.ok) {
        setFinanceData(await res.json());
      } else {
        showToast('Failed to load finance data');
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // Clean cancellation
      showToast('Network error');
    } finally {
      if (currentSeq === seqRef.current) {
        setFinLoading(false);
      }
    }
  }, [dateFilter, getDateRange, page, limit, search, adminHeaders, showToast]);

  useEffect(() => { fetchFinanceData(); }, [fetchFinanceData]);

  const exportPDF = async () => {
    try {
      setExporting(true);
      const { jsPDF } = await import('jspdf');
      await import('jspdf-autotable');
      const doc = new jsPDF();
      const { start, end } = getDateRange(dateFilter);

      // Fetch all records for export across date range
      const res = await fetch(`/api/super-admin/finance?start_date=${start}&end_date=${end}&export_all=true`, {
        headers: adminHeaders(),
      });
      const dataToExport = res.ok ? await res.json() : financeData;
      if (!dataToExport) return;

      doc.setFontSize(18);
      doc.text('Finance Report', 14, 22);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Period: ${start} to ${end}`, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);

      // Summary
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`Total Revenue: ${formatPrice(dataToExport.summary?.totalRevenue || 0)}`, 14, 48);
      doc.text(`Total Sales: ${dataToExport.summary?.totalSales || 0}`, 14, 56);
      doc.text(`Avg Order: ${formatPrice(dataToExport.summary?.avgOrderValue || 0)}`, 14, 64);
      if (dataToExport.summary?.topPlan) {
        doc.text(`Top Plan: ${dataToExport.summary.topPlan.name} (${dataToExport.summary.topPlan.count} sold)`, 14, 72);
      }

      // Transaction table
      const rows = (dataToExport.transactions || []).map(t => [
        new Date(t.date).toLocaleDateString(),
        t.voucher_code,
        t.plan || '-',
        formatPrice(t.amount),
        t.used ? 'Used' : 'Active',
      ]);

      doc.autoTable({
        startY: 82,
        head: [['Date', 'Voucher', 'Plan', 'Amount', 'Status']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [114, 87, 255] },
        styles: { fontSize: 9 },
      });

      doc.save(`finance_report_${start}_to_${end}.pdf`);
      showToast('✅ Full PDF exported!');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    try {
      setExporting(true);
      const XLSX = await import('xlsx');
      const { start, end } = getDateRange(dateFilter);

      const res = await fetch(`/api/super-admin/finance?start_date=${start}&end_date=${end}&export_all=true`, {
        headers: adminHeaders(),
      });
      const dataToExport = res.ok ? await res.json() : financeData;
      if (!dataToExport) return;

      // Summary sheet
      const summaryData = [
        ['Finance Report'],
        [`Period: ${start} to ${end}`],
        [],
        ['Metric', 'Value'],
        ['Total Revenue', dataToExport.summary?.totalRevenue || 0],
        ['Total Sales', dataToExport.summary?.totalSales || 0],
        ['Avg Order Value', dataToExport.summary?.avgOrderValue || 0],
        ['Top Plan', dataToExport.summary?.topPlan?.name || '-'],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(summaryData);

      // Transactions sheet
      const txHeaders = ['Date', 'Voucher Code', 'Plan', 'Amount (₦)', 'Status'];
      const txRows = (dataToExport.transactions || []).map(t => [
        new Date(t.date).toLocaleDateString(),
        t.voucher_code,
        t.plan || '-',
        t.amount,
        t.used ? 'Used' : 'Active',
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);

      // Daily breakdown sheet
      const dailyHeaders = ['Date', 'Sales Count', 'Revenue (₦)'];
      const dailyRows = (dataToExport.dailyBreakdown || []).map(d => [d.date, d.count, d.revenue]);
      const ws3 = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyRows]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
      XLSX.utils.book_append_sheet(wb, ws2, 'Transactions');
      XLSX.utils.book_append_sheet(wb, ws3, 'Daily Breakdown');

      XLSX.writeFile(wb, `finance_report_${start}_to_${end}.xlsx`);
      showToast('✅ Full Excel exported!');
    } catch (err) {
      console.error('Excel export error:', err);
      showToast('Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const summary = financeData?.summary || {};
  const transactions = financeData?.transactions || [];
  const pagination = financeData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };
  const totalMatching = pagination.total || 0;
  const totalPages = pagination.totalPages || 1;
  const fromRecord = totalMatching === 0 ? 0 : (page - 1) * limit + 1;
  const toRecord = Math.min(totalMatching, page * limit);

  return (
    <>
      {/* Date Filters */}
      <div className="sa-glass-card">
        <div className="sa-card-header">
          <div>
            <h3 className="sa-card-title">Financial Reports</h3>
            <p className="sa-card-sub">Revenue analytics, sales reports & exports</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sa-btn-primary" onClick={exportPDF} disabled={!financeData || finLoading || exporting}
              style={{ fontSize: 13, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
              {exporting ? '⏳ Exporting...' : '📄 Export PDF'}
            </button>
            <button className="sa-btn-outline" onClick={exportExcel} disabled={!financeData || finLoading || exporting}
              style={{ fontSize: 13, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
              {exporting ? '⏳ Exporting...' : '📊 Export Excel'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { id: 'today', label: 'Today' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'custom', label: 'Custom' },
          ].map(f => (
            <button key={f.id}
              className={`sa-btn-outline ${dateFilter === f.id ? 'sa-filter-active' : ''}`}
              onClick={() => { setDateFilter(f.id); setPage(1); }}
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 20,
                background: dateFilter === f.id ? 'var(--primary-color, #7257FF)' : 'transparent',
                color: dateFilter === f.id ? '#fff' : 'inherit',
                borderColor: dateFilter === f.id ? 'var(--primary-color, #7257FF)' : undefined }}>
              {f.label}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="sa-field-box" style={{ flex: 1, minWidth: 160 }}>
              <label>Start Date</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div className="sa-field-box" style={{ flex: 1, minWidth: 160 }}>
              <label>End Date</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
            <button className="sa-btn-primary" onClick={() => { setPage(1); fetchFinanceData(); }}
              style={{ alignSelf: 'flex-end', padding: '10px 20px' }}>
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Summary KPIs */}
      {finLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8E8E93' }}>Loading finance data...</div>
      ) : (
        <>
          <div className="sa-kpi-grid" style={{ marginTop: 20 }}>
            <div className="sa-kpi-card sa-kpi-hero">
              <div className="sa-kpi-top"><span className="sa-kpi-label">Revenue</span></div>
              <div className="sa-kpi-value">{formatPrice(summary.totalRevenue || 0)}</div>
              <div className="sa-kpi-footer">From paid voucher purchases</div>
            </div>
            <div className="sa-kpi-card">
              <div className="sa-kpi-top"><span className="sa-kpi-label">Sales</span></div>
              <div className="sa-kpi-value">{summary.totalSales || 0}</div>
              <div className="sa-kpi-footer">Vouchers sold in period</div>
            </div>
            <div className="sa-kpi-card">
              <div className="sa-kpi-top"><span className="sa-kpi-label">Avg Order</span></div>
              <div className="sa-kpi-value">{formatPrice(summary.avgOrderValue || 0)}</div>
              <div className="sa-kpi-footer">Average purchase value</div>
            </div>
            <div className="sa-kpi-card">
              <div className="sa-kpi-top"><span className="sa-kpi-label">Top Plan</span></div>
              <div className="sa-kpi-value" style={{ fontSize: 18 }}>{summary.topPlan?.name || '—'}</div>
              <div className="sa-kpi-footer">{summary.topPlan ? `${summary.topPlan.count} sold • ${formatPrice(summary.topPlan.revenue)}` : 'No sales yet'}</div>
            </div>
          </div>

          {/* Transactions Table with Search & Pagination */}
          <div className="sa-glass-card" style={{ marginTop: 20 }}>
            <div className="sa-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="sa-card-title">Transactions Ledger</h3>
                <p className="sa-card-sub">
                  Showing {fromRecord}–{toRecord} of {totalMatching} paid purchases
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search voucher or plan..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  style={{
                    background: '#1A1A24',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    minWidth: 180,
                  }}
                />
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                  style={{
                    background: '#1A1A24',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
            </div>

            {transactions.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#8E8E93' }}>
                {finLoading ? 'Loading transactions...' : 'No transactions in this period'}
              </div>
            ) : (
              <>
                <div className="sa-table-responsive">
                  <table className="sa-modern-table">
                    <thead><tr>
                      <th>Date</th><th>Voucher</th><th>Plan</th><th>Amount</th><th>Status</th>
                    </tr></thead>
                    <tbody>
                      {transactions.map(t => (
                        <tr key={t.id}>
                          <td>{new Date(t.date).toLocaleDateString()}</td>
                          <td><code style={{ fontSize: 12 }}>{t.voucher_code}</code></td>
                          <td>{t.plan || '—'}</td>
                          <td><strong>{formatPrice(t.amount)}</strong></td>
                          <td>
                            <span className={`sa-badge ${t.used ? 'sa-badge-muted' : 'sa-badge-success'}`}>
                              {t.used ? 'Used' : 'Active'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Toolbar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  paddingTop: 16,
                  borderTop: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <span style={{ fontSize: '0.85rem', color: '#8E8E93' }}>
                    Showing <strong>{fromRecord}</strong> to <strong>{toRecord}</strong> of <strong>{totalMatching}</strong> transactions (Page {page} of {totalPages})
                  </span>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="sa-btn-outline"
                      disabled={page <= 1 || finLoading}
                      onClick={() => setPage(1)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', opacity: page <= 1 ? 0.4 : 1 }}
                    >
                      « First
                    </button>
                    <button
                      type="button"
                      className="sa-btn-outline"
                      disabled={page <= 1 || finLoading}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', opacity: page <= 1 ? 0.4 : 1 }}
                    >
                      ‹ Prev
                    </button>

                    <span style={{
                      padding: '6px 12px',
                      background: 'rgba(114, 87, 255, 0.15)',
                      borderRadius: 6,
                      color: '#C4B5FD',
                      fontWeight: 600,
                      fontSize: '0.85rem'
                    }}>
                      {page}
                    </span>

                    <button
                      type="button"
                      className="sa-btn-outline"
                      disabled={page >= totalPages || finLoading}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', opacity: page >= totalPages ? 0.4 : 1 }}
                    >
                      Next ›
                    </button>
                    <button
                      type="button"
                      className="sa-btn-outline"
                      disabled={page >= totalPages || finLoading}
                      onClick={() => setPage(totalPages)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', opacity: page >= totalPages ? 0.4 : 1 }}
                    >
                      Last »
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// FALLBACK VOUCHER POOL COMPONENT (AUTO-GENERATE & PAGINATED)
// ═══════════════════════════════════════════════════════════
function FallbackVouchersTab({ adminHeaders, showToast, plans }) {
  const [data, setData] = useState({
    vouchers: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    summary: [],
    stats: { total: 0, available: 0, used: 0, expired: 0 }
  });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(null);
  const [pruning, setPruning] = useState(false);
  const mutexRef = useRef(false); // prevents double-click race on generate/batch/manual

  // Form states
  const [inputMode, setInputMode] = useState('auto'); // 'auto' | 'manual'
  const [selectedPlan, setSelectedPlan] = useState('');
  const [customPlan, setCustomPlan] = useState('');
  const [duration, setDuration] = useState('24h');
  const [autoQuantity, setAutoQuantity] = useState(10);
  const [voucherCodes, setVoucherCodes] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  // Customizable Default Router Settings (Defaults: 1 device sharing, 12M upload, 12M download)
  const [customDevices, setCustomDevices] = useState(1);
  const [customUpload, setCustomUpload] = useState('12M');
  const [customDownload, setCustomDownload] = useState('12M');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filter & Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch paginated data from API
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (filterPlan && filterPlan !== 'all') params.append('profile_name', filterPlan);
      if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/super-admin/fallback-vouchers?${params.toString()}`, {
        headers: adminHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        showToast('Failed to load fallback vouchers');
      }
    } catch {
      showToast('Network error loading fallback vouchers');
    }
    setLoading(false);
  }, [page, limit, filterPlan, filterStatus, searchQuery, adminHeaders, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set default plan when plans load
  useEffect(() => {
    if (plans && plans.length > 0 && !selectedPlan) {
      setSelectedPlan(plans[0].name);
      setDuration(plans[0].duration || '24h');
      setCustomDevices(plans[0].devices || 1);
      setCustomUpload(plans[0].upload_speed || '12M');
      setCustomDownload(plans[0].download_speed || '12M');
    }
  }, [plans, selectedPlan]);

  const handlePlanChange = (planIdentifier) => {
    setSelectedPlan(planIdentifier);
    const found = plans?.find(p => p.name === planIdentifier || p.id === planIdentifier);
    if (found?.duration) setDuration(found.duration);
    if (found?.devices) setCustomDevices(found.devices);
    if (found?.upload_speed) setCustomUpload(found.upload_speed);
    if (found?.download_speed) setCustomDownload(found.download_speed);
  };

  // 1-Click Auto-Generate directly on MikroTik Router with Strict Plan Binding
  const handleAutoGenerate = async (planToGen, countToGen) => {
    if (mutexRef.current) return; // prevent double-click
    const target = planToGen || (selectedPlan === '__custom__' ? customPlan.trim() : selectedPlan);
    const qty = countToGen || autoQuantity || 10;

    if (!target) {
      showToast('Please select or enter a plan name');
      return;
    }

    const planObj = plans?.find(p => p.name === target || p.id === target);
    const targetPlanId = planObj?.id || target;
    const targetProfileName = planObj?.name || target;
    const dur = planObj?.duration || duration || '24h';

    mutexRef.current = true;
    setGenerating(true);
    setGeneratingPlan(target);
    try {
      const res = await fetch('/api/super-admin/fallback-vouchers', {
        method: 'POST',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'auto_generate',
          plan_id: targetPlanId,
          profile_name: targetProfileName,
          duration: dur,
          quantity: qty,
          devices: customDevices,
          upload_speed: customUpload,
          download_speed: customDownload,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        showToast(`⚡ Generated & seeded ${json.added} vouchers for "${targetProfileName}" on MikroTik (Sharing: ${customDevices}, ${customUpload}/${customDownload})!`);
        fetchData();
      } else {
        showToast(`❌ ${json.error || 'Failed to auto-generate vouchers'}`);
      }
    } catch {
      showToast('Network error while auto-generating vouchers');
    }
    setGenerating(false);
    setGeneratingPlan(null);
    mutexRef.current = false;
  };

  // Batch replenish all low-stock plans (< 5 available) with 10 vouchers each
  const handleReplenishAllLowStock = async () => {
    if (mutexRef.current) return; // prevent double-click
    const lowPlans = (data.summary || []).filter(s => s.available < 5);
    if (lowPlans.length === 0) {
      showToast('All plan pools are already well stocked!');
      return;
    }
    mutexRef.current = true;
    setGenerating(true);
    let totalAdded = 0;
    for (const p of lowPlans) {
      setGeneratingPlan(p.profile_name);
      try {
        const res = await fetch('/api/super-admin/fallback-vouchers', {
          method: 'POST',
          headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'auto_generate',
            plan_id: p.plan_id || p.profile_name,
            profile_name: p.profile_name,
            duration: p.duration || '24h',
            quantity: 10,
            devices: customDevices,
            upload_speed: customUpload,
            download_speed: customDownload,
          }),
        });
        if (res.ok) {
          const j = await res.json();
          totalAdded += (j.added || 0);
        }
      } catch (e) {
        console.error('Batch replenish error for', p.profile_name, e);
      }
    }
    setGenerating(false);
    setGeneratingPlan(null);
    mutexRef.current = false;
    showToast(`⚡ Batch replenished ${totalAdded} vouchers across ${lowPlans.length} low-stock plans!`);
    fetchData();
  };

  // Manual Bulk Paste
  const handleManualAddVouchers = async (e) => {
    e?.preventDefault();
    if (mutexRef.current) return; // prevent double-click
    const finalPlan = selectedPlan === '__custom__' ? customPlan.trim() : selectedPlan;
    if (!finalPlan) {
      showToast('Please select or enter a plan name');
      return;
    }
    if (!voucherCodes.trim()) {
      showToast('Please enter at least one voucher code');
      return;
    }

    const planObj = plans?.find(p => p.name === finalPlan || p.id === finalPlan);
    const targetPlanId = planObj?.id || finalPlan;
    const targetProfileName = planObj?.name || finalPlan;

    mutexRef.current = true;
    setSubmittingManual(true);
    try {
      const res = await fetch('/api/super-admin/fallback-vouchers', {
        method: 'POST',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: targetPlanId,
          profile_name: targetProfileName,
          duration: duration || '24h',
          codes: voucherCodes,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        showToast(`✅ Successfully added ${json.added} vouchers to fallback pool!`);
        setVoucherCodes('');
        fetchData();
      } else {
        showToast(`❌ ${json.error || 'Failed to add vouchers'}`);
      }
    } catch {
      showToast('Network error saving vouchers');
    }
    setSubmittingManual(false);
    mutexRef.current = false;
  };

  const handleDeleteVoucher = async (id) => {
    if (!confirm('Are you sure you want to delete this fallback voucher?')) return;
    try {
      const res = await fetch('/api/super-admin/fallback-vouchers', {
        method: 'DELETE',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        showToast('Voucher deleted');
        fetchData();
      } else {
        showToast('Failed to delete voucher');
      }
    } catch {
      showToast('Network error');
    }
  };

  const handleClearUnused = async (profileName) => {
    if (!confirm(`Are you sure you want to delete ALL unused fallback vouchers for "${profileName}"?`)) return;
    try {
      const res = await fetch('/api/super-admin/fallback-vouchers', {
        method: 'DELETE',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile_name: profileName, clear_unused: true }),
      });
      if (res.ok) {
        showToast(`Cleared unused vouchers for ${profileName}`);
        fetchData();
      } else {
        showToast('Failed to clear vouchers');
      }
    } catch {
      showToast('Network error');
    }
  };

  // Housekeeping tool for thousands of vouchers: prune already redeemed vouchers
  const handlePruneUsed = async () => {
    if (!confirm('Prune all used & expired fallback vouchers? This removes redeemed codes and stale expired ones to keep the pool lean and performant.')) return;
    setPruning(true);
    try {
      const res = await fetch('/api/super-admin/fallback-vouchers', {
        method: 'DELETE',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prune_used: true }),
      });
      const json = await res.json();
      if (res.ok) {
        const detail = json.pruned > 0
          ? `${json.used_pruned || 0} used + ${json.expired_pruned || 0} expired`
          : '0';
        showToast(`🧹 Cleaned up ${json.pruned || 0} vouchers (${detail}) from reserve pool!`);
        fetchData();
      } else {
        showToast(`❌ ${json.error || 'Failed to prune vouchers'}`);
      }
    } catch {
      showToast('Network error pruning vouchers');
    }
    setPruning(false);
  };

  const lowStockPlans = (data.summary || []).filter(s => s.available < 5);
  const totalMatching = data.pagination?.total || 0;
  const totalPages = data.pagination?.totalPages || 1;
  const fromRecord = totalMatching === 0 ? 0 : (page - 1) * limit + 1;
  const toRecord = Math.min(totalMatching, page * limit);

  return (
    <div className="sa-tab-body">
      {/* Banner */}
      <div className="sa-glass-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            fontSize: '1.8rem',
            background: 'rgba(114, 87, 255, 0.15)',
            padding: '10px 14px',
            borderRadius: 12
          }}>
            🛡️
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="sa-card-title" style={{ fontSize: '1.1rem', marginBottom: 4 }}>
              Offline Fallback Voucher Pool (Strict Plan Isolation)
            </h3>
            <p className="sa-card-sub" style={{ margin: 0, lineHeight: 1.5 }}>
              Vouchers in this reserve protect you when your MikroTik router loses internet connectivity. Users buying Daily, Weekly, or Monthly plans will <strong>strictly receive fallback vouchers matching their selected plan</strong>. Auto-generation defaults to 1 device sharing and 12MB upload/download with full customization.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="sa-kpi-grid">
        <div className="sa-kpi-card">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Available Reserve</span>
            <span className="sa-kpi-badge-trend">Ready</span>
          </div>
          <div className="sa-kpi-val" style={{ color: '#10B981' }}>{data.stats.available}</div>
          <div className="sa-kpi-sub">Ready to dispense offline</div>
        </div>

        <div className="sa-kpi-card">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Used / Dispensed</span>
            <span className="sa-kpi-badge-trend">History</span>
          </div>
          <div className="sa-kpi-val">{data.stats.used}</div>
          <div className="sa-kpi-sub">Total fallback codes used</div>
        </div>

        <div className="sa-kpi-card">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Expired</span>
            {data.stats.expired > 0 && (
              <span className="sa-badge sa-badge-warn">Stale</span>
            )}
          </div>
          <div className="sa-kpi-val" style={{ color: data.stats.expired > 0 ? '#EF4444' : '#8E8E93' }}>
            {data.stats.expired}
          </div>
          <div className="sa-kpi-sub">Past validity — prune to clean up</div>
        </div>

        <div className="sa-kpi-card">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Total Pool Size</span>
          </div>
          <div className="sa-kpi-val">{data.stats.total}</div>
          <div className="sa-kpi-sub">Across all internet plans</div>
        </div>

        <div className="sa-kpi-card">
          <div className="sa-kpi-top">
            <span className="sa-kpi-label">Low Stock Alert</span>
            {lowStockPlans.length > 0 && (
              <span className="sa-badge sa-badge-warn">Attention</span>
            )}
          </div>
          <div className="sa-kpi-val" style={{ color: lowStockPlans.length > 0 ? '#F59E0B' : '#10B981' }}>
            {lowStockPlans.length}
          </div>
          <div className="sa-kpi-sub">
            {lowStockPlans.length > 0 ? `${lowStockPlans.map(p => p.profile_name).join(', ')} low` : 'All pools well stocked'}
          </div>
        </div>
      </div>

      {/* Grid: Plan Pool Status + Auto-Generate / Add Form */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20, marginTop: 20 }}>
        {/* Pool status by plan */}
        <div className="sa-glass-card">
          <div className="sa-card-header">
            <div>
              <h3 className="sa-card-title">Reserve Pool by Plan</h3>
              <p className="sa-card-sub">Stock level &amp; 1-click replenish</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {lowStockPlans.length > 0 && (
                <button
                  className="sa-btn-primary"
                  onClick={handleReplenishAllLowStock}
                  disabled={generating}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    background: '#F59E0B',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#000'
                  }}
                  title="Generate 10 vouchers for each plan with low stock (< 5)"
                >
                  ⚡ Auto-Stock Low ({lowStockPlans.length})
                </button>
              )}
              <button className="sa-btn-outline" onClick={fetchData} disabled={loading} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                {loading ? 'Syncing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {data.summary.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 20px', color: '#8E8E93' }}>
              No fallback vouchers added yet. Use the 1-Click Auto-Generator on the right to stock the pool.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.summary.map(item => {
                const isLow = item.available < 5;
                const isThisGenerating = generating && generatingPlan === item.profile_name;
                return (
                  <div key={item.profile_name} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isLow ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{item.profile_name}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#8E8E93', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                          {item.duration}
                        </span>
                        {item.plan_id && (
                          <span style={{ fontSize: '0.7rem', color: '#A78BFA', background: 'rgba(167, 139, 250, 0.1)', padding: '2px 6px', borderRadius: 4 }}>
                            {item.plan_id}
                          </span>
                        )}
                        {isLow && (
                          <span style={{
                            fontSize: '0.72rem',
                            color: '#F59E0B',
                            background: 'rgba(245, 158, 11, 0.15)',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontWeight: 600
                          }}>
                            Low Stock
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#8E8E93', marginTop: 4 }}>
                        <span style={{ color: item.available > 0 ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                          {item.available} available
                        </span>
                        {' • '}{item.used} used{' • '}{item.total} total
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        className="sa-btn-primary"
                        disabled={generating}
                        onClick={() => handleAutoGenerate(item.profile_name, 10)}
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.78rem',
                          background: '#7257FF',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title="Quick-generate 10 vouchers for this pool"
                      >
                        {isThisGenerating ? '⏳...' : '+10'}
                      </button>

                      <button
                        className="sa-btn-primary"
                        disabled={generating}
                        onClick={() => handleAutoGenerate(item.profile_name, 25)}
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.78rem',
                          background: 'rgba(114, 87, 255, 0.25)',
                          border: '1px solid rgba(114, 87, 255, 0.5)',
                          color: '#C4B5FD',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title="Quick-generate 25 vouchers for this pool"
                      >
                        +25
                      </button>

                      {item.available > 0 && (
                        <button
                          className="sa-btn-outline"
                          onClick={() => handleClearUnused(item.profile_name)}
                          style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          title="Clear all unused vouchers for this plan"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stocking Card: Switch between 1-Click Auto-Generate and Manual Paste */}
        <div className="sa-glass-card">
          <div className="sa-card-header">
            <div>
              <h3 className="sa-card-title">Stock Fallback Reserve</h3>
              <p className="sa-card-sub">Generate via MikroTik API or paste existing</p>
            </div>

            {/* Mode Switcher */}
            <div style={{ display: 'flex', background: '#121218', padding: 3, borderRadius: 8, gap: 2 }}>
              <button
                type="button"
                onClick={() => setInputMode('auto')}
                style={{
                  background: inputMode === 'auto' ? '#7257FF' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ⚡ 1-Click Auto
              </button>
              <button
                type="button"
                onClick={() => setInputMode('manual')}
                style={{
                  background: inputMode === 'manual' ? '#7257FF' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                📝 Manual Paste
              </button>
            </div>
          </div>

          {/* ── MODE 1: AUTO-GENERATE ON ROUTER ── */}
          {inputMode === 'auto' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="sa-field-box">
                <label>Target Internet Plan *</label>
                <select
                  value={selectedPlan}
                  onChange={e => handlePlanChange(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1A1A24',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '10px 12px'
                  }}
                >
                  {(plans || []).map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({p.duration} • {p.speed || '12MB/12MB'} • {p.devices || 1} Device)
                    </option>
                  ))}
                  <option value="__custom__">+ Custom Plan Name</option>
                </select>
              </div>

              {selectedPlan === '__custom__' && (
                <div className="sa-field-box">
                  <label>Custom Profile Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. 1 Day Pass"
                    value={customPlan}
                    onChange={e => setCustomPlan(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="sa-field-box">
                <label>Quantity to Generate</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {[5, 10, 25, 50].map(qty => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setAutoQuantity(qty)}
                      style={{
                        flex: 1,
                        padding: '8px 0',
                        background: autoQuantity === qty ? '#7257FF' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${autoQuantity === qty ? '#7257FF' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 8,
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collapsible Router Bandwidth & Limits Settings */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '10px 12px',
              }}>
                <div
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#C4B5FD',
                  }}
                >
                  <span>⚙️ Default Settings ({customDevices} Device, ↑{customUpload} / ↓{customDownload})</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{showAdvanced ? '▲ Collapse' : '▼ Tweak Defaults'}</span>
                </div>

                {showAdvanced && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
                    <div className="sa-field-box">
                      <label style={{ fontSize: '0.75rem' }}>Device Sharing</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={customDevices}
                        onChange={e => setCustomDevices(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                      />
                    </div>
                    <div className="sa-field-box">
                      <label style={{ fontSize: '0.75rem' }}>Upload Speed</label>
                      <input
                        type="text"
                        placeholder="12M"
                        value={customUpload}
                        onChange={e => setCustomUpload(e.target.value)}
                        style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                      />
                    </div>
                    <div className="sa-field-box">
                      <label style={{ fontSize: '0.75rem' }}>Download Speed</label>
                      <input
                        type="text"
                        placeholder="12M"
                        value={customDownload}
                        onChange={e => setCustomDownload(e.target.value)}
                        style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{
                background: 'rgba(114, 87, 255, 0.08)',
                border: '1px solid rgba(114, 87, 255, 0.2)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: '0.8rem',
                color: '#C4B5FD',
                lineHeight: 1.4
              }}>
                ⚡ <strong>Plan-Isolated Auto-Stock:</strong> This creates {autoQuantity} vouchers on your MikroTik router configured for 1 device sharing and {customUpload}/{customDownload} rate limits, and binds them strictly to the selected plan.
              </div>

              <button
                type="button"
                className="sa-btn-primary"
                disabled={generating}
                onClick={() => handleAutoGenerate(null, autoQuantity)}
                style={{ marginTop: 4 }}
              >
                {generating ? '⏳ Provisioning on Router & Stocking...' : `⚡ Auto-Generate ${autoQuantity} Vouchers`}
              </button>
            </div>
          )}

          {/* ── MODE 2: MANUAL BULK PASTE ── */}
          {inputMode === 'manual' && (
            <form onSubmit={handleManualAddVouchers} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="sa-field-box">
                <label>Select Plan / Profile *</label>
                <select
                  value={selectedPlan}
                  onChange={e => handlePlanChange(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1A1A24',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '10px 12px'
                  }}
                >
                  {(plans || []).map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({p.duration})
                    </option>
                  ))}
                  <option value="__custom__">+ Custom Plan Name</option>
                </select>
              </div>

              {selectedPlan === '__custom__' && (
                <div className="sa-field-box">
                  <label>Custom Profile Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. 1 Day Pass"
                    value={customPlan}
                    onChange={e => setCustomPlan(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="sa-field-box">
                <label>Uptime Duration *</label>
                <input
                  type="text"
                  placeholder="e.g. 24h, 7d, 30d, 1h"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  required
                />
              </div>

              <div className="sa-field-box">
                <label>Voucher Codes (one per line or comma-separated) *</label>
                <textarea
                  rows={4}
                  placeholder="WIFI-A1B2C3&#10;WIFI-D4E5F6&#10;WIFI-G7H8J9"
                  value={voucherCodes}
                  onChange={e => setVoucherCodes(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1A1A24',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem'
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                className="sa-btn-primary"
                disabled={submittingManual}
                style={{ marginTop: 4 }}
              >
                {submittingManual ? 'Adding Vouchers...' : 'Add to Reserve Pool'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── MAINTENANCE & SCALE HOUSEKEEPING CARD ── */}
      <div className="sa-glass-card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: '#fff' }}>🧹 Pool Maintenance & Scale Housekeeping</h4>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#8E8E93' }}>
              Keep your database lean and performant even when handling thousands of historical vouchers.
            </p>
          </div>
          <button
            type="button"
            className="sa-btn-outline"
            disabled={pruning || (data.stats.used === 0 && data.stats.expired === 0)}
            onClick={handlePruneUsed}
            style={{
              padding: '8px 16px',
              fontSize: '0.82rem',
              color: '#EF4444',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="Prune all used and expired vouchers from fallback table"
          >
            {pruning ? '⏳ Pruning...' : `🧹 Prune ${data.stats.used} Used + ${data.stats.expired} Expired`}
          </button>
        </div>
      </div>

      {/* ── PAGINATED INVENTORY LEDGER TABLE ── */}
      <div className="sa-glass-card" style={{ marginTop: 24 }}>
        <div className="sa-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 className="sa-card-title">Voucher Inventory Ledger</h3>
            <p className="sa-card-sub">
              Showing {fromRecord}–{toRecord} of {totalMatching} vouchers
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <input
              type="text"
              placeholder="Search voucher code..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              style={{
                background: '#1A1A24',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: '0.85rem',
                minWidth: 160
              }}
            />

            {/* Filter by Plan */}
            <select
              value={filterPlan}
              onChange={e => { setFilterPlan(e.target.value); setPage(1); }}
              style={{
                background: '#1A1A24',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: '0.85rem'
              }}
            >
              <option value="all">All Plans</option>
              {data.summary.map(s => (
                <option key={s.profile_name} value={s.profile_name}>{s.profile_name}</option>
              ))}
            </select>

            {/* Filter by Status */}
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              style={{
                background: '#1A1A24',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: '0.85rem'
              }}
            >
              <option value="all">All Status</option>
              <option value="available">Available Only</option>
              <option value="used">Used Only</option>
              <option value="expired">Expired Only</option>
            </select>

            {/* Rows per page */}
            <select
              value={limit}
              onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
              style={{
                background: '#1A1A24',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: '0.85rem'
              }}
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>

        {data.vouchers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8E8E93' }}>
            {loading ? 'Loading vouchers...' : 'No vouchers match the current criteria.'}
          </div>
        ) : (
          <>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Voucher Code</th>
                    <th>Profile / Plan</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Added On</th>
                    <th>Used At</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vouchers.map(v => (
                    <tr key={v.id}>
                      <td>
                        <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, color: '#A78BFA' }}>
                          {v.voucher_code}
                        </code>
                      </td>
                      <td>
                        <strong>{v.profile_name}</strong>
                        {v.plan_id && (
                          <div style={{ fontSize: '0.72rem', color: '#8E8E93' }}>ID: {v.plan_id}</div>
                        )}
                      </td>
                      <td>{v.duration}</td>
                      <td>
                        <span className={
                          `sa-badge ${
                            (v.status === 'expired' || (!v.is_used && v.status === 'expired'))
                              ? 'sa-badge-danger'
                              : v.is_used
                              ? 'sa-badge-muted'
                              : 'sa-badge-success'
                          }`
                        }>
                          {v.status === 'expired' ? 'Expired' : v.is_used ? 'Used' : 'Available'}
                        </span>
                      </td>
                      <td>{v.created_at ? new Date(v.created_at).toLocaleDateString() : '—'}</td>
                      <td>{v.used_at ? new Date(v.used_at).toLocaleString() : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {!v.is_used && (
                          <button
                            onClick={() => handleDeleteVoucher(v.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#EF4444',
                              cursor: 'pointer',
                              fontSize: '0.82rem'
                            }}
                            title="Delete voucher"
                          >
                            ✕ Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Toolbar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.08)'
            }}>
              <span style={{ fontSize: '0.85rem', color: '#8E8E93' }}>
                Showing <strong>{fromRecord}</strong> to <strong>{toRecord}</strong> of <strong>{totalMatching}</strong> vouchers (Page {page} of {totalPages})
              </span>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="sa-btn-outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(1)}
                  style={{ padding: '6px 10px', fontSize: '0.8rem', opacity: page <= 1 ? 0.4 : 1 }}
                >
                  « First
                </button>
                <button
                  type="button"
                  className="sa-btn-outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', opacity: page <= 1 ? 0.4 : 1 }}
                >
                  ‹ Prev
                </button>

                <span style={{
                  padding: '6px 12px',
                  background: 'rgba(114, 87, 255, 0.15)',
                  borderRadius: 6,
                  color: '#C4B5FD',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}>
                  {page}
                </span>

                <button
                  type="button"
                  className="sa-btn-outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', opacity: page >= totalPages ? 0.4 : 1 }}
                >
                  Next ›
                </button>
                <button
                  type="button"
                  className="sa-btn-outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(totalPages)}
                  style={{ padding: '6px 10px', fontSize: '0.8rem', opacity: page >= totalPages ? 0.4 : 1 }}
                >
                  Last »
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SuperAdminPage() {
  const router = useRouter();

  // Authentication
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [token, setToken] = useState('');

  // UI
  const [activeTab, setActiveTab] = useState('dashboard');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Dashboard & Analytics
  const [stats, setStats] = useState({
    revenue: 0, vouchers: 0, activeSessions: 0, walletLiability: 0,
    dailySales: [], planDistribution: [], recentVouchers: [],
  });
  const [sessions, setSessions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [settings, setSettings] = useState({});

  // MikroTik Config
  const [mikrotikForm, setMikrotikForm] = useState({
    ip: '192.168.88.1',
    user: 'admin',
    pass: '',
    port: '443',
    use_ssl: true,
    hotspot_url: 'asuktech.net',
    wifi_ssid: 'Asuk Tech Wi-Fi',
  });
  const [syncingHotspot, setSyncingHotspot] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const [flutterwaveForm, setFlutterwaveForm] = useState({
    public_key: '', secret_key: '', webhook_secret: '', enabled: false,
  });

  // Branding
  const [brandingForm, setBrandingForm] = useState({
    app_name: 'Asuk Tech', logo_url: '', theme: 'violet',
  });
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Hotspot Sharing
  const [hotspotSettings, setHotspotSettings] = useState({
    sharing_enabled: false, default_devices: 1, default_upload_speed: '12M', default_download_speed: '12M',
    expiry_mode: 'elapsed', // 'elapsed' = countdown continues when offline, 'paused' = countdown pauses when offline
  });

  // Plan Management
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({
    id: '', name: '', speed: '', price: '', duration: '', popular: false, sort_order: 0,
    devices: 1, upload_speed: '12M', download_speed: '12M',
  });

  // Voucher Generator
  const [voucherGen, setVoucherGen] = useState({
    quantity: 10, profile: 'default', expiry_type: 'daily',
    custom_duration: '1d', price: 100, plan_name: '1 Day Pass',
    devices: 1, upload_speed: '12M', download_speed: '12M',
  });
  const [genLoading, setGenLoading] = useState(false);
  const [generatedVouchers, setGeneratedVouchers] = useState([]);
  const [genResult, setGenResult] = useState(null);

  // Router Users
  const [routerUsers, setRouterUsers] = useState([]);
  const [routerUsersLoading, setRouterUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [userEditForm, setUserEditForm] = useState({ 'limit-uptime': '', profile: '' });

  // Hotspot Profiles
  const [routerProfiles, setRouterProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    name: '', 'rate-limit': '', 'shared-users': '1',
    'session-timeout': '', 'idle-timeout': '', 'keepalive-timeout': '',
  });

  // Network Health
  const [networkData, setNetworkData] = useState({
    health: [], leases: [], logs: [], interfaces: [],
  });
  const [networkLoading, setNetworkLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const actionLockRef = useRef(false);

  // Misc
  const [copiedPin, setCopiedPin] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };
  const formatPrice = (a) => '₦' + Number(a || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatBytes = (bytes) => {
    if (!bytes || bytes === '0') return '0 B';
    const n = Number(bytes);
    if (isNaN(n)) return bytes;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  };

  const adminHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Basic ${token}`,
  }), [token]);

  // Restore session
  useEffect(() => {
    const saved = sessionStorage.getItem('sa_token');
    if (saved) { setToken(saved); setAuthed(true); }
  }, []);

  // Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError(''); setAuthLoading(true);
    try {
      const res = await fetch('/api/super-admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || 'Invalid credentials'); return; }
      sessionStorage.setItem('sa_token', data.token);
      setToken(data.token);
      setAuthed(true);
      showToast('Welcome to Super Admin Dashboard');
    } catch { setAuthError('Unable to connect to server'); }
    finally { setAuthLoading(false); }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('sa_token');
    setAuthed(false); setToken(''); setUsername(''); setPassword('');
  };

  // ── Data Fetchers ──────────────────────────────────────────

  const fetchCoreData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [statsRes, settingsRes, plansRes, sessionsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: adminHeaders() }),
        fetch('/api/super-admin/settings', { headers: adminHeaders() }),
        fetch('/api/super-admin/plans?all=true', { headers: adminHeaders() }),
        fetch('/api/mikrotik/active-sessions', { headers: adminHeaders() }),
      ]);

      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(prev => ({
          ...prev, revenue: d.revenue || 0, vouchers: d.vouchers || 0,
          totalGenerated: d.totalGenerated || 0, trendPct: d.trendPct || 0,
          walletLiability: d.walletLiability || 0,
          dailySales: d.dailySales || [], planDistribution: d.planDistribution || [],
          recentVouchers: d.recentVouchers || [],
        }));
      }

      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setSettings(s);
        if (s.mikrotik) setMikrotikForm(prev => ({ ...prev, ...s.mikrotik }));
        if (s.flutterwave) setFlutterwaveForm(prev => ({ ...prev, ...s.flutterwave }));
        if (s.branding) setBrandingForm(prev => ({ ...prev, ...s.branding }));
        if (s.hotspot_settings) setHotspotSettings(prev => ({ ...prev, ...s.hotspot_settings }));
      }

      if (plansRes.ok) setPlans(await plansRes.json());

      if (sessionsRes.ok) {
        const sd = await sessionsRes.json();
        const list = sd.sessions || [];
        setSessions(list);
        setStats(prev => ({ ...prev, activeSessions: list.length }));
      }
    } catch (err) { console.error('Core data fetch error:', err); }
    finally { setLoading(false); }
  }, [token, adminHeaders]);

  const fetchRouterUsers = useCallback(async () => {
    if (!token) return;
    setRouterUsersLoading(true);
    try {
      const res = await fetch('/api/mikrotik/hotspot-users', { headers: adminHeaders() });
      if (res.ok) {
        const d = await res.json();
        setRouterUsers(d.users || []);
      }
    } catch (err) { console.error('Router users error:', err); }
    finally { setRouterUsersLoading(false); }
  }, [token, adminHeaders]);

  const fetchRouterProfiles = useCallback(async () => {
    if (!token) return;
    setProfilesLoading(true);
    try {
      const res = await fetch('/api/mikrotik/hotspot-profiles', { headers: adminHeaders() });
      if (res.ok) {
        const d = await res.json();
        setRouterProfiles(d.profiles || []);
      }
    } catch (err) { console.error('Router profiles error:', err); }
    finally { setProfilesLoading(false); }
  }, [token, adminHeaders]);

  const fetchNetworkHealth = useCallback(async () => {
    if (!token) return;
    setNetworkLoading(true);
    try {
      const res = await fetch('/api/mikrotik/system-health', { headers: adminHeaders() });
      if (res.ok) {
        const d = await res.json();
        setNetworkData({
          health: d.health || [], leases: d.leases || [],
          logs: d.logs || [], interfaces: d.interfaces || [],
        });
      }
    } catch (err) { console.error('Network health error:', err); }
    finally { setNetworkLoading(false); }
  }, [token, adminHeaders]);

  const handleTestMikrotik = useCallback(async (silent = false) => {
    setTestLoading(true);
    try {
      const res = await fetch('/api/mikrotik/test-connection', { headers: adminHeaders() });
      const data = await res.json();
      setTestResult(data);
      if (!silent) {
        if (data.connected) showToast('✅ Router Connected!');
        else showToast('⚠️ Connection failed');
      }
    } catch (err) {
      setTestResult({ connected: false, error: err.message });
      if (!silent) showToast('Network error');
    } finally { setTestLoading(false); }
  }, [adminHeaders]);

  // Initial load
  useEffect(() => {
    if (authed && token) {
      fetchCoreData();
      handleTestMikrotik(true);
    }
  }, [authed, token, fetchCoreData]);

  // Tab-specific data loading
  useEffect(() => {
    if (!authed || !token) return;
    if (activeTab === 'router-users') fetchRouterUsers();
    else if (activeTab === 'profiles') fetchRouterProfiles();
    else if (activeTab === 'network') fetchNetworkHealth();
  }, [activeTab, authed, token, fetchRouterUsers, fetchRouterProfiles, fetchNetworkHealth]);

  // ── Action Handlers ────────────────────────────────────────

  const saveMikrotik = async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      const res = await fetch('/api/super-admin/settings', {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ key: 'mikrotik', value: { ...mikrotikForm, configured: true } }),
      });
      if (res.ok) { showToast('✅ MikroTik settings saved!'); handleTestMikrotik(); }
      else showToast('❌ Failed to save');
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const handleSyncHotspot = async () => {
    if (syncingHotspot) return;
    setSyncingHotspot(true);
    try {
      const res = await fetch('/api/mikrotik/sync-hotspot', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          dns_name: mikrotikForm.hotspot_url,
          wifi_ssid: mikrotikForm.wifi_ssid,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✅ ${data.message || 'Hotspot domain configured on router!'}`);
      } else {
        showToast(data.error || 'Failed to sync hotspot domain');
      }
    } catch (e) {
      showToast('Network error syncing hotspot');
    } finally {
      setSyncingHotspot(false);
    }
  };

  const saveFlutterwave = async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      const res = await fetch('/api/super-admin/settings', {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ key: 'flutterwave', value: flutterwaveForm }),
      });
      if (res.ok) showToast('✅ Flutterwave saved!');
      else showToast('❌ Failed to save');
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  // Plan CRUD
  const savePlan = async () => {
    if (actionLockRef.current) return;
    if (!planForm.id || !planForm.name || !planForm.price || !planForm.duration) {
      showToast('Fill all required plan fields'); return;
    }
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      const res = await fetch('/api/super-admin/plans', {
        method: 'POST', headers: adminHeaders(), body: JSON.stringify(planForm),
      });
      if (res.ok) {
        showToast(editingPlan ? 'Plan updated!' : 'Plan created!');
        setEditingPlan(null);
        setPlanForm({ id: '', name: '', speed: '', price: '', duration: '', popular: false, sort_order: 0, devices: 1, upload_speed: '12M', download_speed: '12M' });
        fetchCoreData();
      } else showToast('Failed to save plan');
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const deletePlan = async (id) => {
    if (actionLockRef.current) return;
    if (!confirm('Delete this internet plan?')) return;
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      const res = await fetch('/api/super-admin/plans', {
        method: 'DELETE', headers: adminHeaders(), body: JSON.stringify({ id }),
      });
      if (res.ok) { showToast('Plan deleted'); fetchCoreData(); }
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const startEditPlan = (p) => {
    setEditingPlan(p.id);
    setPlanForm({ id: p.id, name: p.name, speed: p.speed || '', price: p.price, duration: p.duration, popular: p.popular || false, sort_order: p.sort_order || 0, devices: p.devices || 1, upload_speed: p.upload_speed || '12M', download_speed: p.download_speed || '12M' });
  };

  // Session kick
  const kickUser = async (sessionId, username) => {
    if (actionLockRef.current) return;
    if (!confirm(`Disconnect "${username}"?`)) return;
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      const res = await fetch('/api/mikrotik/kick-user', {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (res.ok) { showToast(`Disconnected: ${username}`); fetchCoreData(); }
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  // Voucher Generator
  const handleGenerateVouchers = async () => {
    setGenLoading(true);
    setGenResult(null);
    setGeneratedVouchers([]);
    try {
      const res = await fetch('/api/mikrotik/generate-vouchers', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(voucherGen),
      });
      const data = await res.json();
      if (res.ok) {
        setGenResult(data);
        setGeneratedVouchers(data.vouchers || []);
        showToast(`✅ Generated ${data.generated} vouchers (${data.failed} failed)`);
        fetchCoreData();
      } else {
        showToast('❌ ' + (data.details || data.error || 'Generation failed'));
      }
    } catch (err) { showToast('Error: ' + err.message); }
    finally { setGenLoading(false); }
  };

  // Router User Management
  const handleDeleteRouterUser = async (userId, name) => {
    if (actionLockRef.current) return;
    if (!confirm(`Delete router user "${name}"? This removes the voucher from MikroTik.`)) return;
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      const res = await fetch('/api/mikrotik/hotspot-users', {
        method: 'DELETE',
        headers: adminHeaders(),
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) { showToast(`Deleted: ${name}`); fetchRouterUsers(); }
      else showToast('Failed to delete');
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const handleUpdateRouterUser = async () => {
    if (actionLockRef.current) return;
    if (!editingUser) return;
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      const body = { user_id: editingUser };
      if (userEditForm['limit-uptime']) body['limit-uptime'] = userEditForm['limit-uptime'];
      if (userEditForm.profile) body.profile = userEditForm.profile;

      const res = await fetch('/api/mikrotik/hotspot-users', {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast('User updated on router!');
        setEditingUser(null);
        fetchRouterUsers();
      } else showToast('Update failed');
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  // Hotspot Profile Management
  const handleSaveProfile = async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      if (editingProfile) {
        // Update existing
        const res = await fetch('/api/mikrotik/hotspot-profiles', {
          method: 'PATCH',
          headers: adminHeaders(),
          body: JSON.stringify({ profile_id: editingProfile, ...profileForm }),
        });
        if (res.ok) {
          showToast('Profile updated!');
          setEditingProfile(null);
          setProfileForm({ name: '', 'rate-limit': '', 'shared-users': '1', 'session-timeout': '', 'idle-timeout': '', 'keepalive-timeout': '' });
          fetchRouterProfiles();
        } else showToast('Update failed');
      } else {
        // Create new
        if (!profileForm.name) { showToast('Profile name required'); return; }
        const res = await fetch('/api/mikrotik/hotspot-profiles', {
          method: 'PUT',
          headers: adminHeaders(),
          body: JSON.stringify(profileForm),
        });
        if (res.ok) {
          showToast('Profile created on router!');
          setProfileForm({ name: '', 'rate-limit': '', 'shared-users': '1', 'session-timeout': '', 'idle-timeout': '', 'keepalive-timeout': '' });
          fetchRouterProfiles();
        } else showToast('Creation failed');
      }
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const handleDeleteProfile = async (profileId, name) => {
    if (actionLockRef.current) return;
    if (!confirm(`Delete profile "${name}" from the router?`)) return;
    actionLockRef.current = true;
    setActionBusy(true);
    try {
      const res = await fetch('/api/mikrotik/hotspot-profiles', {
        method: 'DELETE',
        headers: adminHeaders(),
        body: JSON.stringify({ profile_id: profileId }),
      });
      if (res.ok) { showToast('Profile deleted'); fetchRouterProfiles(); }
      else showToast('Delete failed');
    } catch { showToast('Network error'); }
    finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const startEditProfile = (p) => {
    setEditingProfile(p['.id']);
    setProfileForm({
      name: p.name || '',
      'rate-limit': p['rate-limit'] || '',
      'shared-users': p['shared-users'] || '1',
      'session-timeout': p['session-timeout'] || '',
      'idle-timeout': p['idle-timeout'] || '',
      'keepalive-timeout': p['keepalive-timeout'] || '',
    });
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedPin(code);
    showToast(`Copied: ${code}`);
    setTimeout(() => setCopiedPin(''), 2000);
  };

  const copyAllVouchers = () => {
    const text = generatedVouchers.map(v => v.code).join('\n');
    navigator.clipboard.writeText(text);
    showToast(`Copied ${generatedVouchers.length} codes`);
  };

  // Filtered router users
  const filteredUsers = routerUsers.filter(u => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) ||
      (u.profile || '').toLowerCase().includes(q) ||
      (u.comment || '').toLowerCase().includes(q);
  });

  const maxDayRevenue = stats.dailySales.reduce((max, d) => Math.max(max, d.revenue), 100);

  // ═══════════════════════════════════════════════════════════
  // LOGIN SCREEN
  // ═══════════════════════════════════════════════════════════
  if (!authed) {
    return (
      <div className="sa-login-wrap">
        <div className="sa-login-card">
          <div className="sa-login-badge-wrap">
            <div className="sa-login-avatar-ring">
              <ShieldIcon size={28} color="#7257FF" />
            </div>
            <span className="sa-badge sa-badge-obsidian">Super Admin Gateway</span>
          </div>
          <h1 className="sa-login-title">Asuk Tech</h1>
          <p className="sa-login-sub">MikroTik RouterOS &amp; Hotspot Administration</p>
          {authError && <div className="sa-error-alert">{authError}</div>}
          <form onSubmit={handleLogin} className="sa-login-form">
            <div className="sa-input-group">
              <label>Administrator Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" autoComplete="username" required />
            </div>
            <div className="sa-input-group">
              <label>Administrator Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" autoComplete="current-password" required />
            </div>
            <button type="submit" className="sa-login-submit" disabled={authLoading}>
              {authLoading ? 'Verifying...' : 'Authenticate & Enter'}
            </button>
          </form>
          <div className="sa-login-footer-info">
            <span>Secured with RouterOS REST API &amp; Supabase</span>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN ADMIN INTERFACE
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="sa-shell">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="sa-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sa-sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sa-brand-section">
          <div className="sa-brand-icon-box">
            <WifiIcon size={22} color="#FFFFFF" />
          </div>
          {!sidebarCollapsed && (
            <div className="sa-brand-text">
              <span className="sa-brand-name">Asuk Tech</span>
              <span className="sa-brand-badge">Super Admin</span>
            </div>
          )}
          <button className="sa-collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2">
              {sidebarCollapsed
                ? <polyline points="9 18 15 12 9 6" />
                : <polyline points="15 18 9 12 15 6" />}
            </svg>
          </button>
        </div>

        <nav className="sa-nav-menu">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} className={`sa-nav-button ${active ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}>
                <div className="sa-nav-icon-wrap">
                  <Icon size={18} color={active ? '#7257FF' : '#8E8E93'} />
                </div>
                <span className="sa-nav-label">{tab.label}</span>
                {tab.id === 'sessions' && sessions.length > 0 && (
                  <span className="sa-nav-pill-count">{sessions.length}</span>
                )}
                {tab.id === 'router-users' && routerUsers.length > 0 && (
                  <span className="sa-nav-pill-count">{routerUsers.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sa-sidebar-bottom">
          <div className="sa-router-pill-status">
            <span className={`sa-status-dot ${testResult?.connected ? 'online' : 'offline'}`} />
            <span className="sa-router-pill-text">
              {testResult?.connected ? 'RouterOS Online' : 'Router Offline'}
            </span>
          </div>
          <button className="sa-logout-button" onClick={handleLogout}>
            <LogOutIcon size={18} color="#EF4444" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="sa-main-content">
        <header className="sa-header-bar">
          <div className="sa-header-left">
            <button className="sa-mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#121217" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <h1 className="sa-page-title">{TABS.find(t => t.id === activeTab)?.label}</h1>
            <p className="sa-page-subtitle">Real-time Hotspot &amp; Network Analytics</p>
          </div>
          <div className="sa-header-right">
            <button className="sa-action-btn sa-btn-outline" onClick={() => router.push('/')} title="User App">
              <WifiIcon size={16} color="#121217" /><span>User App</span>
            </button>
            <button className="sa-action-btn sa-btn-refresh" onClick={fetchCoreData} disabled={loading}>
              <RefreshIcon size={16} color="#7257FF" /><span>{loading ? 'Syncing...' : 'Refresh'}</span>
            </button>
            <div className="sa-admin-avatar-pill">
              <span className="sa-admin-avatar">A</span>
              <span className="sa-admin-name">Admin</span>
            </div>
          </div>
        </header>

        {/* ═══ TAB: DASHBOARD ═══ */}
        {activeTab === 'dashboard' && (
          <div className="sa-tab-body">
            <div className="sa-kpi-grid">
              <div className="sa-kpi-card sa-kpi-hero">
                <div className="sa-kpi-top">
                  <span className="sa-kpi-label">Total Revenue</span>
                  {stats.trendPct !== undefined && (
                    <span className={`sa-kpi-badge-trend ${stats.trendPct < 0 ? 'negative' : ''}`}>
                      {stats.trendPct >= 0 ? '+' : ''}{stats.trendPct}%
                    </span>
                  )}
                </div>
                <div className="sa-kpi-value">{formatPrice(stats.revenue)}</div>
                <div className="sa-kpi-footer">From provisioned Wi-Fi vouchers</div>
              </div>
              <div className="sa-kpi-card">
                <div className="sa-kpi-top">
                  <span className="sa-kpi-label">Vouchers Sold</span>
                  <div className="sa-kpi-icon-mini"><TicketIcon size={16} color="#7257FF" /></div>
                </div>
                <div className="sa-kpi-value">{stats.vouchers}</div>
                <div className="sa-kpi-footer">{stats.totalGenerated || stats.vouchers} total generated</div>
              </div>
              <div className="sa-kpi-card">
                <div className="sa-kpi-top">
                  <span className="sa-kpi-label">Active Users</span>
                  <span className="sa-live-pulse-indicator"><span className="sa-live-pulse-dot" />LIVE</span>
                </div>
                <div className="sa-kpi-value sa-color-green">{stats.activeSessions}</div>
                <div className="sa-kpi-footer">MikroTik hotspot sessions</div>
              </div>
              <div className="sa-kpi-card">
                <div className="sa-kpi-top">
                  <span className="sa-kpi-label">Router Users</span>
                  <div className="sa-kpi-icon-mini"><UsersIcon size={16} color="#141417" /></div>
                </div>
                <div className="sa-kpi-value">{routerUsers.length}</div>
                <div className="sa-kpi-footer">Provisioned on router</div>
              </div>
            </div>

            {/* Revenue Chart + Distribution */}
            <div className="sa-analytics-row-2">
              <div className="sa-glass-card sa-chart-card">
                <div className="sa-card-header">
                  <div>
                    <h3 className="sa-card-title">7-Day Sales Velocity</h3>
                    <p className="sa-card-sub">Daily hotspot voucher revenue</p>
                  </div>
                  <span className="sa-badge sa-badge-purple">Weekly</span>
                </div>
                <div className="sa-velocity-bars-container">
                  {stats.dailySales.map(d => {
                    const pct = Math.max(12, Math.round((d.revenue / maxDayRevenue) * 100));
                    return (
                      <div key={d.date} className="sa-velocity-bar-col">
                        <div className="sa-velocity-bar-track">
                          <div className={`sa-velocity-bar-fill ${d.isToday ? 'today' : ''}`}
                            style={{ height: `${pct}%` }}
                            title={`${d.day}: ${formatPrice(d.revenue)} (${d.count} vouchers)`}>
                            <span className="sa-bar-tooltip">{formatPrice(d.revenue)}</span>
                          </div>
                        </div>
                        <span className={`sa-velocity-bar-label ${d.isToday ? 'active' : ''}`}>{d.day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sa-glass-card sa-distribution-card">
                <div className="sa-card-header">
                  <div>
                    <h3 className="sa-card-title">Package Distribution</h3>
                    <p className="sa-card-sub">Market share of each pass</p>
                  </div>
                  <span className="sa-badge">{stats.planDistribution.length} Pkgs</span>
                </div>
                <div className="sa-distribution-list">
                  {stats.planDistribution.length === 0 ? (
                    <div className="sa-empty-state-mini">No sales yet</div>
                  ) : stats.planDistribution.map((item, idx) => (
                    <div key={item.name} className="sa-dist-row">
                      <div className="sa-dist-meta">
                        <span className="sa-dist-name">{item.name}</span>
                        <span className="sa-dist-count">{item.count} sold ({item.percentage}%) • {formatPrice(item.revenue)}</span>
                      </div>
                      <div className="sa-dist-track">
                        <div className="sa-dist-fill" style={{ width: `${item.percentage}%`, background: ['#7257FF','#10B981','#FFB84C','#3B82F6','#EC4899'][idx % 5] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Router Health + Services */}
            <div className="sa-analytics-row-2">
              <div className="sa-glass-card">
                <div className="sa-card-header">
                  <div>
                    <h3 className="sa-card-title">Router Hardware Health</h3>
                    <p className="sa-card-sub">Live RouterOS telemetry</p>
                  </div>
                  <button className="sa-btn-pill-small" onClick={() => handleTestMikrotik(false)} disabled={testLoading}>
                    {testLoading ? 'Checking...' : '⚡ Test'}
                  </button>
                </div>
                {testResult?.connected ? (
                  <div className="sa-health-grid">
                    <div className="sa-health-item">
                      <span className="sa-health-label">Model</span>
                      <span className="sa-health-val">{testResult.router?.model || 'MikroTik'}</span>
                    </div>
                    <div className="sa-health-item">
                      <span className="sa-health-label">RouterOS</span>
                      <span className="sa-health-val">{testResult.router?.version || 'v7+'}</span>
                    </div>
                    <div className="sa-health-item">
                      <span className="sa-health-label">Uptime</span>
                      <span className="sa-health-val">{testResult.router?.uptime || 'Active'}</span>
                    </div>
                    <div className="sa-health-item">
                      <span className="sa-health-label">CPU</span>
                      <span className="sa-health-val">{testResult.router?.cpuLoad || 'Optimal'}</span>
                    </div>
                    <div className="sa-health-item sa-health-wide">
                      <span className="sa-health-label">Free Memory</span>
                      <span className="sa-health-val">{testResult.router?.freeMemory || 'Optimal'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="sa-health-offline-banner">
                    <div className="sa-offline-icon">⚠️</div>
                    <div>
                      <strong>Router unreachable at {mikrotikForm.ip}:{mikrotikForm.port}</strong>
                      <p>Check power, Ethernet, and REST API service.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="sa-glass-card">
                <div className="sa-card-header">
                  <div>
                    <h3 className="sa-card-title">Infrastructure Services</h3>
                    <p className="sa-card-sub">Core subsystems</p>
                  </div>
                  <span className="sa-badge sa-badge-success">Operational</span>
                </div>
                <div className="sa-services-list">
                  <div className="sa-service-row">
                    <div className="sa-service-info"><strong>Supabase</strong><span>Auth, Wallets, Vouchers</span></div>
                    <span className="sa-badge sa-badge-success">● Active</span>
                  </div>
                  <div className="sa-service-row">
                    <div className="sa-service-info"><strong>MikroTik REST</strong><span>{mikrotikForm.ip}:{mikrotikForm.port}</span></div>
                    <span className={`sa-badge ${testResult?.connected ? 'sa-badge-success' : 'sa-badge-danger'}`}>
                      {testResult?.connected ? '● Connected' : '○ Offline'}
                    </span>
                  </div>
                  <div className="sa-service-row">
                    <div className="sa-service-info"><strong>Flutterwave</strong><span>Payment processing</span></div>
                    <span className={`sa-badge ${flutterwaveForm.enabled ? 'sa-badge-success' : 'sa-badge-warn'}`}>
                      {flutterwaveForm.enabled ? '● Enabled' : '○ Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Vouchers */}
            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Recent Vouchers</h3>
                  <p className="sa-card-sub">Latest issued PINs</p>
                </div>
                <span className="sa-badge">{stats.recentVouchers.length} Recent</span>
              </div>
              {stats.recentVouchers.length === 0 ? (
                <div className="sa-empty-state">No vouchers purchased yet.</div>
              ) : (
                <div className="sa-table-responsive">
                  <table className="sa-modern-table">
                    <thead><tr><th>PIN</th><th>PACKAGE</th><th>AMOUNT</th><th>ISSUED</th><th>STATUS</th></tr></thead>
                    <tbody>
                      {stats.recentVouchers.map(v => (
                        <tr key={v.id}>
                          <td>
                            <div className="sa-pin-chip" onClick={() => copyCode(v.voucher_code)} title="Copy">
                              <code>{v.voucher_code}</code>
                              <span className="sa-copy-icon">{copiedPin === v.voucher_code ? '✓' : '📋'}</span>
                            </div>
                          </td>
                          <td className="sa-font-bold">{v.profile_name || 'Standard'}</td>
                          <td>{formatPrice(v.price)}</td>
                          <td className="sa-color-muted">{v.created_at ? new Date(v.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}</td>
                          <td><span className="sa-badge sa-badge-success">Active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: FINANCE ═══ */}
        {activeTab === 'finance' && (
          <div className="sa-tab-body">
            <FinanceTab adminHeaders={adminHeaders} formatPrice={formatPrice} showToast={showToast} />
          </div>
        )}

        {/* ═══ TAB: LIVE SESSIONS ═══ */}
        {activeTab === 'sessions' && (
          <div className="sa-tab-body">
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Active Hotspot Sessions</h3>
                  <p className="sa-card-sub">Real-time devices on the router</p>
                </div>
                <span className="sa-badge sa-badge-purple">{sessions.length} Online</span>
              </div>
              {sessions.length === 0 ? (
                <div className="sa-empty-state">
                  <div className="sa-empty-icon">📶</div>
                  <h4>No Active Sessions</h4>
                  <p>Sessions appear when users enter voucher PINs on the captive portal.</p>
                </div>
              ) : (
                <div className="sa-table-responsive">
                  <table className="sa-modern-table">
                    <thead><tr><th>USERNAME</th><th>IP</th><th>MAC</th><th>UPTIME</th><th>DATA</th><th>ACTION</th></tr></thead>
                    <tbody>
                      {sessions.map(s => (
                        <tr key={s['.id'] || s.user}>
                          <td className="sa-font-bold"><span className="sa-user-dot" />{s.user}</td>
                          <td>{s.address}</td>
                          <td><code className="sa-mac-code">{s['mac-address']}</code></td>
                          <td>{s.uptime}</td>
                          <td>{formatBytes(s['bytes-in'])} / {formatBytes(s['bytes-out'])}</td>
                          <td><button className="sa-action-btn-danger" onClick={() => kickUser(s['.id'], s.user)}>Disconnect</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: VOUCHER FACTORY ═══ */}
        {activeTab === 'vouchers' && (
          <div className="sa-tab-body">
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Bulk Voucher Generator</h3>
                  <p className="sa-card-sub">Generate 1-100 vouchers with configurable expiry, provisioned directly on MikroTik</p>
                </div>
                <span className="sa-badge sa-badge-purple"><TicketIcon size={14} color="#7257FF" /> Factory</span>
              </div>

              <div className="sa-form-grid-3">
                <div className="sa-field-box">
                  <label>Quantity (1-100)</label>
                  <input type="number" min="1" max="100" value={voucherGen.quantity}
                    onChange={e => setVoucherGen({ ...voucherGen, quantity: e.target.value })} />
                </div>
                <div className="sa-field-box">
                  <label>Display Name</label>
                  <input value={voucherGen.plan_name}
                    onChange={e => setVoucherGen({ ...voucherGen, plan_name: e.target.value })}
                    placeholder="e.g. 1 Day Pass" />
                </div>
                <div className="sa-field-box">
                  <label>Price (₦)</label>
                  <input type="number" value={voucherGen.price}
                    onChange={e => setVoucherGen({ ...voucherGen, price: e.target.value })} />
                </div>
                <div className="sa-field-box">
                  <label>Expiry Type</label>
                  <select value={voucherGen.expiry_type}
                    onChange={e => setVoucherGen({ ...voucherGen, expiry_type: e.target.value })}>
                    <option value="1h">1 Hour</option>
                    <option value="3h">3 Hours</option>
                    <option value="6h">6 Hours</option>
                    <option value="12h">12 Hours</option>
                    <option value="daily">Daily (24h)</option>
                    <option value="weekly">Weekly (7d)</option>
                    <option value="monthly">Monthly (30d)</option>
                    <option value="custom">Custom Duration</option>
                  </select>
                </div>
                {voucherGen.expiry_type === 'custom' && (
                  <div className="sa-field-box">
                    <label>Custom Duration</label>
                    <input value={voucherGen.custom_duration}
                      onChange={e => setVoucherGen({ ...voucherGen, custom_duration: e.target.value })}
                      placeholder="e.g. 2d, 12h, 45m" />
                  </div>
                )}
                <div className="sa-field-box">
                  <label>Router Profile</label>
                  <input value={voucherGen.profile}
                    onChange={e => setVoucherGen({ ...voucherGen, profile: e.target.value })}
                    placeholder="default" />
                </div>
                <div className="sa-field-box">
                  <label>Devices (shared-users)</label>
                  <input type="number" min="1" max="10" value={voucherGen.devices}
                    onChange={e => setVoucherGen({ ...voucherGen, devices: e.target.value })} />
                </div>
                <div className="sa-field-box">
                  <label>Upload Speed</label>
                  <input value={voucherGen.upload_speed}
                    onChange={e => setVoucherGen({ ...voucherGen, upload_speed: e.target.value })}
                    placeholder="12M" />
                </div>
                <div className="sa-field-box">
                  <label>Download Speed</label>
                  <input value={voucherGen.download_speed}
                    onChange={e => setVoucherGen({ ...voucherGen, download_speed: e.target.value })}
                    placeholder="12M" />
                </div>
              </div>

              <div className="sa-plan-form-footer">
                <button className="sa-btn-primary sa-btn-lg" onClick={handleGenerateVouchers} disabled={genLoading}>
                  {genLoading ? `Generating ${voucherGen.quantity} vouchers...` : `🎟️ Generate ${voucherGen.quantity} Vouchers`}
                </button>
              </div>
            </div>

            {/* Generated Results */}
            {genResult && (
              <div className="sa-glass-card" style={{ marginTop: 24 }}>
                <div className="sa-card-header">
                  <div>
                    <h3 className="sa-card-title">Generated Vouchers</h3>
                    <p className="sa-card-sub">{genResult.generated} created • {genResult.expiry_label} expiry • {genResult.limit_uptime} uptime</p>
                  </div>
                  <div className="sa-header-actions">
                    {generatedVouchers.length > 0 && (
                      <button className="sa-btn-pill-small" onClick={copyAllVouchers}>
                        📋 Copy All Codes
                      </button>
                    )}
                    <span className="sa-badge sa-badge-success">{genResult.generated} Success</span>
                    {genResult.failed > 0 && <span className="sa-badge sa-badge-danger">{genResult.failed} Failed</span>}
                  </div>
                </div>

                {generatedVouchers.length > 0 && (
                  <div className="sa-voucher-grid">
                    {generatedVouchers.map((v, i) => (
                      <div key={i} className="sa-voucher-card-mini" onClick={() => copyCode(v.code)}>
                        <div className="sa-voucher-card-code">
                          <code>{v.code}</code>
                          <span className="sa-copy-icon">{copiedPin === v.code ? '✓' : '📋'}</span>
                        </div>
                        <div className="sa-voucher-card-meta">
                          <span>{v.expiry}</span>
                          <span className="sa-badge sa-badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>Active</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: FALLBACK VOUCHER POOL ═══ */}
        {activeTab === 'fallback-vouchers' && (
          <FallbackVouchersTab
            adminHeaders={adminHeaders}
            showToast={showToast}
            plans={plans}
          />
        )}

        {/* ═══ TAB: ROUTER USERS ═══ */}
        {activeTab === 'router-users' && (
          <div className="sa-tab-body">
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">MikroTik Hotspot Users</h3>
                  <p className="sa-card-sub">All voucher users provisioned on the router</p>
                </div>
                <div className="sa-header-actions">
                  <button className="sa-btn-pill-small" onClick={fetchRouterUsers} disabled={routerUsersLoading}>
                    {routerUsersLoading ? 'Loading...' : '🔄 Refresh'}
                  </button>
                  <span className="sa-badge sa-badge-purple">{routerUsers.length} Users</span>
                </div>
              </div>

              {/* Search */}
              <div className="sa-search-bar">
                <SearchIcon size={16} color="#8E8E93" />
                <input placeholder="Search by name, profile, or comment..."
                  value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              </div>

              {/* Edit modal */}
              {editingUser && (
                <div className="sa-inline-edit-panel">
                  <h4>Edit User: {routerUsers.find(u => u['.id'] === editingUser)?.name}</h4>
                  <div className="sa-form-grid-2">
                    <div className="sa-field-box">
                      <label>Limit Uptime</label>
                      <input value={userEditForm['limit-uptime']}
                        onChange={e => setUserEditForm({ ...userEditForm, 'limit-uptime': e.target.value })}
                        placeholder="e.g. 1h, 1d, 7d" />
                    </div>
                    <div className="sa-field-box">
                      <label>Profile</label>
                      <input value={userEditForm.profile}
                        onChange={e => setUserEditForm({ ...userEditForm, profile: e.target.value })}
                        placeholder="default" />
                    </div>
                  </div>
                  <div className="sa-button-row">
                    <button className="sa-btn-primary" onClick={handleUpdateRouterUser}>Save Changes</button>
                    <button className="sa-btn-outline" onClick={() => setEditingUser(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {routerUsersLoading ? (
                <div className="sa-empty-state"><div className="sa-loading-spinner" />Loading router users...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="sa-empty-state">
                  <div className="sa-empty-icon">👤</div>
                  <h4>No Users Found</h4>
                  <p>{userSearch ? 'No matches for your search.' : 'No hotspot users on the router.'}</p>
                </div>
              ) : (
                <div className="sa-table-responsive">
                  <table className="sa-modern-table">
                    <thead><tr><th>USERNAME</th><th>PROFILE</th><th>UPTIME LIMIT</th><th>COMMENT</th><th>ACTIONS</th></tr></thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr key={u['.id']}>
                          <td className="sa-font-bold">{u.name}</td>
                          <td><span className="sa-profile-pill">{u.profile || 'default'}</span></td>
                          <td>{u['limit-uptime'] || 'Unlimited'}</td>
                          <td className="sa-color-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.comment || '—'}</td>
                          <td>
                            <div className="sa-actions-flex">
                              <button className="sa-btn-action-edit" title="Edit" onClick={() => {
                                setEditingUser(u['.id']);
                                setUserEditForm({ 'limit-uptime': u['limit-uptime'] || '', profile: u.profile || '' });
                              }}>
                                <EditPencilIcon size={16} color="#141417" />
                              </button>
                              <button className="sa-btn-action-delete" title="Delete" onClick={() => handleDeleteRouterUser(u['.id'], u.name)}>
                                <TrashIcon size={16} color="#EF4444" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: HOTSPOT PROFILES ═══ */}
        {activeTab === 'profiles' && (
          <div className="sa-tab-body">
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">{editingProfile ? 'Edit Hotspot Profile' : 'Create Hotspot Profile'}</h3>
                  <p className="sa-card-sub">User profiles control bandwidth, sessions, and timeouts on the router</p>
                </div>
                {editingProfile && (
                  <button className="sa-btn-pill-small" onClick={() => {
                    setEditingProfile(null);
                    setProfileForm({ name: '', 'rate-limit': '', 'shared-users': '1', 'session-timeout': '', 'idle-timeout': '', 'keepalive-timeout': '' });
                  }}>Cancel Edit</button>
                )}
              </div>

              <div className="sa-form-grid-3">
                <div className="sa-field-box">
                  <label>Profile Name *</label>
                  <input value={profileForm.name}
                    onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                    placeholder="e.g. premium-1mbps" disabled={!!editingProfile} />
                </div>
                <div className="sa-field-box">
                  <label>Rate Limit (Upload/Download)</label>
                  <input value={profileForm['rate-limit']}
                    onChange={e => setProfileForm({ ...profileForm, 'rate-limit': e.target.value })}
                    placeholder="e.g. 1M/5M or 512K/2M" />
                </div>
                <div className="sa-field-box">
                  <label>Shared Users</label>
                  <input type="number" min="1" value={profileForm['shared-users']}
                    onChange={e => setProfileForm({ ...profileForm, 'shared-users': e.target.value })}
                    placeholder="1" />
                </div>
                <div className="sa-field-box">
                  <label>Session Timeout</label>
                  <input value={profileForm['session-timeout']}
                    onChange={e => setProfileForm({ ...profileForm, 'session-timeout': e.target.value })}
                    placeholder="e.g. 1h, 8h, 1d" />
                </div>
                <div className="sa-field-box">
                  <label>Idle Timeout</label>
                  <input value={profileForm['idle-timeout']}
                    onChange={e => setProfileForm({ ...profileForm, 'idle-timeout': e.target.value })}
                    placeholder="e.g. 5m, 30m" />
                </div>
                <div className="sa-field-box">
                  <label>Keepalive Timeout</label>
                  <input value={profileForm['keepalive-timeout']}
                    onChange={e => setProfileForm({ ...profileForm, 'keepalive-timeout': e.target.value })}
                    placeholder="e.g. 2m" />
                </div>
              </div>

              <div className="sa-plan-form-footer">
                <button className="sa-btn-primary" onClick={handleSaveProfile}>
                  {editingProfile ? 'Update Profile on Router' : 'Create Profile on Router'}
                </button>
              </div>
            </div>

            {/* Profiles Table */}
            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Router User Profiles</h3>
                  <p className="sa-card-sub">Profiles configured on MikroTik hotspot server</p>
                </div>
                <div className="sa-header-actions">
                  <button className="sa-btn-pill-small" onClick={fetchRouterProfiles} disabled={profilesLoading}>
                    {profilesLoading ? 'Loading...' : '🔄 Refresh'}
                  </button>
                  <span className="sa-badge">{routerProfiles.length} Profiles</span>
                </div>
              </div>

              {profilesLoading ? (
                <div className="sa-empty-state"><div className="sa-loading-spinner" />Loading profiles...</div>
              ) : routerProfiles.length === 0 ? (
                <div className="sa-empty-state">
                  <div className="sa-empty-icon">⚙️</div>
                  <h4>No Profiles Found</h4>
                  <p>Create a profile above to define bandwidth and session rules.</p>
                </div>
              ) : (
                <div className="sa-table-responsive">
                  <table className="sa-modern-table">
                    <thead><tr><th>PROFILE NAME</th><th>RATE LIMIT</th><th>SHARED USERS</th><th>SESSION TIMEOUT</th><th>IDLE TIMEOUT</th><th>ACTIONS</th></tr></thead>
                    <tbody>
                      {routerProfiles.map(p => (
                        <tr key={p['.id']}>
                          <td className="sa-font-bold">{p.name}</td>
                          <td><code className="sa-mac-code">{p['rate-limit'] || 'Unlimited'}</code></td>
                          <td>{p['shared-users'] || '1'}</td>
                          <td>{p['session-timeout'] || 'None'}</td>
                          <td>{p['idle-timeout'] || 'None'}</td>
                          <td>
                            <div className="sa-actions-flex">
                              <button className="sa-btn-action-edit" onClick={() => startEditProfile(p)} title="Edit">
                                <EditPencilIcon size={16} color="#141417" />
                              </button>
                              {p.name !== 'default' && (
                                <button className="sa-btn-action-delete" onClick={() => handleDeleteProfile(p['.id'], p.name)} title="Delete">
                                  <TrashIcon size={16} color="#EF4444" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: INTERNET PLANS ═══ */}
        {activeTab === 'plans' && (
          <div className="sa-tab-body">
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">{editingPlan ? 'Edit Internet Package' : 'Create Internet Package'}</h3>
                  <p className="sa-card-sub">Packages visible in the user storefront</p>
                </div>
                {editingPlan && (
                  <button className="sa-btn-pill-small" onClick={() => {
                    setEditingPlan(null);
                    setPlanForm({ id: '', name: '', speed: '', price: '', duration: '', popular: false, sort_order: 0, devices: 1, upload_speed: '12M', download_speed: '12M' });
                  }}>Cancel</button>
                )}
              </div>

              <div className="sa-form-grid-3">
                <div className="sa-field-box"><label>Plan ID *</label><input value={planForm.id} onChange={e => setPlanForm({ ...planForm, id: e.target.value })} placeholder="e.g. 1-Hour-Pass" disabled={!!editingPlan} /></div>
                <div className="sa-field-box"><label>Display Name *</label><input value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} placeholder="e.g. 1 Hour Unlimited" /></div>
                <div className="sa-field-box"><label>Speed / Spec</label><input value={planForm.speed} onChange={e => setPlanForm({ ...planForm, speed: e.target.value })} placeholder="e.g. 12Mbps • 1 Device" /></div>
                <div className="sa-field-box"><label>Price (₦) *</label><input type="number" value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} placeholder="100" /></div>
                <div className="sa-field-box"><label>Duration *</label><input value={planForm.duration} onChange={e => setPlanForm({ ...planForm, duration: e.target.value })} placeholder="e.g. 1h, 24h, 7d" /></div>
                <div className="sa-field-box"><label>Devices (shared-users)</label><input type="number" min="1" max="10" value={planForm.devices} onChange={e => setPlanForm({ ...planForm, devices: e.target.value })} /></div>
                <div className="sa-field-box"><label>Upload Speed</label><input value={planForm.upload_speed} onChange={e => setPlanForm({ ...planForm, upload_speed: e.target.value })} placeholder="12M" /></div>
                <div className="sa-field-box"><label>Download Speed</label><input value={planForm.download_speed} onChange={e => setPlanForm({ ...planForm, download_speed: e.target.value })} placeholder="12M" /></div>
                <div className="sa-field-box"><label>Sort Order</label><input type="number" value={planForm.sort_order} onChange={e => setPlanForm({ ...planForm, sort_order: e.target.value })} /></div>
              </div>

              <div className="sa-plan-form-footer">
                <label className="sa-checkbox-label">
                  <input type="checkbox" checked={planForm.popular} onChange={e => setPlanForm({ ...planForm, popular: e.target.checked })} />
                  <span>Featured / Best Value</span>
                </label>
                <button className="sa-btn-primary" onClick={savePlan}>{editingPlan ? 'Update' : 'Publish'} Package</button>
              </div>
            </div>

            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div><h3 className="sa-card-title">Active Catalog</h3><p className="sa-card-sub">Available for purchase</p></div>
                <span className="sa-badge">{plans.length} Plans</span>
              </div>
              <div className="sa-table-responsive">
                <table className="sa-modern-table">
                  <thead><tr><th>NAME</th><th>PRICE</th><th>DURATION</th><th>DEVICES</th><th>SPEED</th><th>FEATURED</th><th>ACTIONS</th></tr></thead>
                  <tbody>
                    {plans.map(p => (
                      <tr key={p.id}>
                        <td className="sa-font-bold">{p.name}</td>
                        <td className="sa-color-purple sa-font-bold">{formatPrice(p.price)}</td>
                        <td>{p.duration}</td>
                        <td>{p.devices || 1} Device{(p.devices || 1) > 1 ? 's' : ''}</td>
                        <td className="sa-color-muted">{p.upload_speed || '12M'}/{p.download_speed || '12M'}</td>
                        <td>{p.popular ? <span className="sa-badge sa-badge-purple">★ Popular</span> : <span className="sa-color-muted">—</span>}</td>
                        <td>
                          <div className="sa-actions-flex">
                            <button className="sa-btn-action-edit" onClick={() => startEditPlan(p)}><EditPencilIcon size={16} color="#141417" /></button>
                            <button className="sa-btn-action-delete" onClick={() => deletePlan(p.id)}><TrashIcon size={16} color="#EF4444" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: NETWORK HEALTH ═══ */}
        {activeTab === 'network' && (
          <div className="sa-tab-body">
            {/* System Health Sensors */}
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">System Health Sensors</h3>
                  <p className="sa-card-sub">Hardware telemetry from <code>/system/health</code></p>
                </div>
                <button className="sa-btn-pill-small" onClick={fetchNetworkHealth} disabled={networkLoading}>
                  {networkLoading ? 'Loading...' : '🔄 Refresh'}
                </button>
              </div>
              {networkData.health.length === 0 ? (
                <div className="sa-empty-state-mini">No health data available. Router may not support health sensors or is offline.</div>
              ) : (
                <div className="sa-health-grid">
                  {networkData.health.map((h, i) => (
                    <div key={i} className="sa-health-item">
                      <span className="sa-health-label">{h.name || h.type || `Sensor ${i+1}`}</span>
                      <span className="sa-health-val">{h.value !== undefined ? h.value : JSON.stringify(h)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Network Interfaces */}
            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Network Interfaces</h3>
                  <p className="sa-card-sub">All interfaces with traffic statistics</p>
                </div>
                <span className="sa-badge">{networkData.interfaces.length} Interfaces</span>
              </div>
              {networkData.interfaces.length === 0 ? (
                <div className="sa-empty-state-mini">No interface data available.</div>
              ) : (
                <div className="sa-table-responsive">
                  <table className="sa-modern-table">
                    <thead><tr><th>NAME</th><th>TYPE</th><th>STATUS</th><th>TX (OUT)</th><th>RX (IN)</th><th>MAC</th></tr></thead>
                    <tbody>
                      {networkData.interfaces.map(iface => (
                        <tr key={iface['.id'] || iface.name}>
                          <td className="sa-font-bold">{iface.name}</td>
                          <td>{iface.type || '—'}</td>
                          <td>
                            <span className={`sa-badge ${iface.running === 'true' || iface.running === true ? 'sa-badge-success' : 'sa-badge-danger'}`}>
                              {iface.running === 'true' || iface.running === true ? '● Up' : '○ Down'}
                            </span>
                          </td>
                          <td>{formatBytes(iface['tx-byte'])}</td>
                          <td>{formatBytes(iface['rx-byte'])}</td>
                          <td><code className="sa-mac-code">{iface['mac-address'] || '—'}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* DHCP Leases */}
            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">DHCP Leases</h3>
                  <p className="sa-card-sub">Active IP address assignments</p>
                </div>
                <span className="sa-badge">{networkData.leases.length} Leases</span>
              </div>
              {networkData.leases.length === 0 ? (
                <div className="sa-empty-state-mini">No DHCP leases found.</div>
              ) : (
                <div className="sa-table-responsive">
                  <table className="sa-modern-table">
                    <thead><tr><th>IP ADDRESS</th><th>MAC ADDRESS</th><th>HOSTNAME</th><th>STATUS</th><th>SERVER</th></tr></thead>
                    <tbody>
                      {networkData.leases.map(l => (
                        <tr key={l['.id']}>
                          <td className="sa-font-bold">{l.address}</td>
                          <td><code className="sa-mac-code">{l['mac-address']}</code></td>
                          <td>{l['host-name'] || '—'}</td>
                          <td>
                            <span className={`sa-badge ${l.status === 'bound' ? 'sa-badge-success' : 'sa-badge-warn'}`}>
                              {l.status || 'unknown'}
                            </span>
                          </td>
                          <td className="sa-color-muted">{l.server || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* System Logs */}
            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">System Logs</h3>
                  <p className="sa-card-sub">Recent 50 log entries from RouterOS</p>
                </div>
                <span className="sa-badge">{networkData.logs.length} Entries</span>
              </div>
              {networkData.logs.length === 0 ? (
                <div className="sa-empty-state-mini">No log data available.</div>
              ) : (
                <div className="sa-log-viewer">
                  {networkData.logs.map((log, i) => (
                    <div key={i} className={`sa-log-entry ${(log.topics || '').includes('error') ? 'sa-log-error' : (log.topics || '').includes('warning') ? 'sa-log-warn' : ''}`}>
                      <span className="sa-log-time">{log.time || ''}</span>
                      <span className="sa-log-topics">{log.topics || ''}</span>
                      <span className="sa-log-message">{log.message || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: MIKROTIK CONFIG ═══ */}
        {activeTab === 'mikrotik' && (
          <div className="sa-tab-body">
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">MikroTik RouterOS REST API</h3>
                  <p className="sa-card-sub">Connection parameters stored in Supabase</p>
                </div>
                <span className={`sa-badge ${testResult?.connected ? 'sa-badge-success' : 'sa-badge-danger'}`}>
                  {testResult?.connected ? '● Connected' : '○ Offline'}
                </span>
              </div>
              <div className="sa-form-grid-2">
                <div className="sa-field-box"><label>Router IP / Hostname *</label><input value={mikrotikForm.ip} onChange={e => setMikrotikForm({ ...mikrotikForm, ip: e.target.value })} placeholder="192.168.88.1" /></div>
                <div className="sa-field-box"><label>REST API Port *</label><input value={mikrotikForm.port} onChange={e => setMikrotikForm({ ...mikrotikForm, port: e.target.value })} placeholder="443" /></div>
                <div className="sa-field-box"><label>API Username *</label><input value={mikrotikForm.user} onChange={e => setMikrotikForm({ ...mikrotikForm, user: e.target.value })} placeholder="admin" /></div>
                <div className="sa-field-box"><label>API Password</label><input type="password" value={mikrotikForm.pass} onChange={e => setMikrotikForm({ ...mikrotikForm, pass: e.target.value })} placeholder="••••••••" /></div>
                <div className="sa-field-box">
                  <label>Hotspot Portal Domain / URL (e.g. asuktech.net) *</label>
                  <input value={mikrotikForm.hotspot_url || ''} onChange={e => setMikrotikForm({ ...mikrotikForm, hotspot_url: e.target.value })} placeholder="asuktech.net" />
                  <span style={{ fontSize: '11px', color: '#71717A', marginTop: 4 }}>Used for automatic 1-click user redirection and router profile DNS Name</span>
                </div>
                <div className="sa-field-box">
                  <label>Wi-Fi Broadcast Name (SSID) *</label>
                  <input value={mikrotikForm.wifi_ssid || ''} onChange={e => setMikrotikForm({ ...mikrotikForm, wifi_ssid: e.target.value })} placeholder="Asuk Tech Wi-Fi" />
                  <span style={{ fontSize: '11px', color: '#71717A', marginTop: 4 }}>Displayed to users on vouchers and connection instructions</span>
                </div>
              </div>
              <div className="sa-ssl-check-row">
                <label className="sa-checkbox-label">
                  <input type="checkbox" checked={mikrotikForm.use_ssl} onChange={e => setMikrotikForm({ ...mikrotikForm, use_ssl: e.target.checked })} />
                  <span>Use SSL / HTTPS (self-signed router certificates supported)</span>
                </label>
              </div>
              <div className="sa-button-row" style={{ flexWrap: 'wrap', gap: 10 }}>
                <button className="sa-btn-primary" onClick={saveMikrotik}>Save Configuration</button>
                <button className="sa-btn-outline" onClick={() => handleTestMikrotik(false)} disabled={testLoading}>
                  {testLoading ? 'Testing...' : '⚡ Test Connection'}
                </button>
                <button
                  className="sa-btn-outline"
                  onClick={handleSyncHotspot}
                  disabled={syncingHotspot}
                  style={{ borderColor: '#7257FF', color: '#7257FF', fontWeight: 700 }}
                >
                  {syncingHotspot ? 'Pushing...' : `🌐 Push "${mikrotikForm.hotspot_url || 'asuktech.net'}" to Router`}
                </button>
                <button
                  className="sa-btn-outline"
                  onClick={() => setShowTutorial(!showTutorial)}
                  style={{ fontWeight: 600 }}
                >
                  {showTutorial ? '📖 Hide WinBox Guide' : '📖 WinBox Setup Guide'}
                </button>
              </div>
            </div>

            {/* ═══ MIKROTIK WINBOX SETUP GUIDE & TUTORIAL ═══ */}
            {showTutorial && (
              <MikroTikSetupGuide
                mikrotikForm={mikrotikForm}
                onSyncRouter={handleSyncHotspot}
                isSyncing={syncingHotspot}
              />
            )}

            {testResult && (
              <div className="sa-glass-card" style={{ marginTop: 24 }}>
                <div className="sa-card-header">
                  <div><h3 className="sa-card-title">Diagnostics</h3><p className="sa-card-sub"><code>/rest/system/resource</code></p></div>
                  <span className={`sa-badge ${testResult.connected ? 'sa-badge-success' : 'sa-badge-danger'}`}>
                    {testResult.connected ? '🟢 ONLINE' : '🔴 OFFLINE'}
                  </span>
                </div>
                {testResult.connected ? (
                  <div className="sa-diag-grid">
                    <div className="sa-diag-item"><span className="sa-diag-label">Model</span><strong className="sa-diag-val">{testResult.router?.model}</strong></div>
                    <div className="sa-diag-item"><span className="sa-diag-label">RouterOS</span><strong className="sa-diag-val">{testResult.router?.version}</strong></div>
                    <div className="sa-diag-item"><span className="sa-diag-label">Uptime</span><strong className="sa-diag-val">{testResult.router?.uptime}</strong></div>
                    <div className="sa-diag-item"><span className="sa-diag-label">CPU</span><strong className="sa-diag-val">{testResult.router?.cpuLoad}</strong></div>
                    <div className="sa-diag-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="sa-diag-label">Hotspot Profiles</span>
                      <div className="sa-profiles-tag-wrap">
                        {testResult.profiles?.length > 0 ? testResult.profiles.map(p => (
                          <span key={p} className="sa-profile-pill">{p}</span>
                        )) : <span className="sa-color-muted">default</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="sa-offline-troubleshoot-box">
                    <div className="sa-error-alert">{testResult.error}</div>
                    <div className="sa-troubleshoot-steps">
                      <strong>Troubleshooting:</strong>
                      <ol>
                        <li>Confirm router is powered and accessible.</li>
                        <li>Enable REST API: <code>/ip service enable www-ssl</code></li>
                        <li>For HTTP, uncheck SSL and set port to 80.</li>
                        <li>Verify credentials.</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Hotspot Sharing Control */}
            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Hotspot Device Sharing</h3>
                  <p className="sa-card-sub">Control whether vouchers allow multiple simultaneous device connections</p>
                </div>
                <span className={`sa-badge ${hotspotSettings.sharing_enabled ? 'sa-badge-success' : 'sa-badge-danger'}`}>
                  {hotspotSettings.sharing_enabled ? '● Sharing ON' : '○ Sharing OFF'}
                </span>
              </div>
              <div className="sa-form-grid-2">
                <div className="sa-field-box">
                  <label>Allow Multi-Device Sharing</label>
                  <div className="sa-ssl-check-row">
                    <label className="sa-checkbox-label">
                      <input type="checkbox" checked={hotspotSettings.sharing_enabled}
                        onChange={e => setHotspotSettings({ ...hotspotSettings, sharing_enabled: e.target.checked })} />
                      <span>{hotspotSettings.sharing_enabled ? 'Enabled — plans use their own device count' : 'Disabled — all vouchers forced to 1 device'}</span>
                    </label>
                  </div>
                </div>
                <div className="sa-field-box">
                  <label>Default Devices (when sharing enabled)</label>
                  <input type="number" min="1" max="10" value={hotspotSettings.default_devices}
                    onChange={e => setHotspotSettings({ ...hotspotSettings, default_devices: Number(e.target.value) || 1 })} />
                </div>
                <div className="sa-field-box">
                  <label>Default Upload Speed</label>
                  <input value={hotspotSettings.default_upload_speed}
                    onChange={e => setHotspotSettings({ ...hotspotSettings, default_upload_speed: e.target.value })}
                    placeholder="12M" />
                </div>
                <div className="sa-field-box">
                  <label>Default Download Speed</label>
                  <input value={hotspotSettings.default_download_speed}
                    onChange={e => setHotspotSettings({ ...hotspotSettings, default_download_speed: e.target.value })}
                    placeholder="12M" />
                </div>
              </div>

              {/* Voucher Expiry Mode */}
              <div className="sa-glass-card" style={{ marginTop: 16, background: 'rgba(114, 87, 255, 0.06)', border: '1px solid rgba(114, 87, 255, 0.18)' }}>
                <div className="sa-card-header">
                  <div>
                    <h3 className="sa-card-title" style={{ fontSize: '0.95rem' }}>⏱️ Voucher Expiry Mode</h3>
                    <p className="sa-card-sub">Controls how MikroTik counts voucher time when user disconnects from Wi-Fi</p>
                  </div>
                  <span className={`sa-badge ${hotspotSettings.expiry_mode === 'elapsed' ? 'sa-badge-purple' : 'sa-badge-success'}`}>
                    {hotspotSettings.expiry_mode === 'elapsed' ? '⏰ Elapsed Time' : '⏸️ Paused Time'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {/* Elapsed Option */}
                  <div
                    onClick={() => setHotspotSettings({ ...hotspotSettings, expiry_mode: 'elapsed' })}
                    style={{
                      flex: 1, minWidth: 220, padding: '16px', borderRadius: 14, cursor: 'pointer',
                      background: hotspotSettings.expiry_mode === 'elapsed' ? 'rgba(114, 87, 255, 0.12)' : 'rgba(0,0,0,0.03)',
                      border: hotspotSettings.expiry_mode === 'elapsed' ? '2px solid #7257FF' : '1.5px solid rgba(0,0,0,0.12)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: hotspotSettings.expiry_mode === 'elapsed' ? '6px solid #7257FF' : '2px solid rgba(0,0,0,0.25)',
                        background: hotspotSettings.expiry_mode === 'elapsed' ? '#7257FF' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {hotspotSettings.expiry_mode === 'elapsed' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <strong style={{ fontSize: '0.95rem', color: '#1a1a2e' }}>⏰ Elapsed Time (Recommended)</strong>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.55)', margin: 0, lineHeight: 1.5, paddingLeft: 30 }}>
                      Countdown <strong style={{ color: 'rgba(0,0,0,0.75)' }}>continues running</strong> even when user disconnects from Wi-Fi. A 24-hour voucher expires exactly 24 hours after first login, regardless of usage. Uses MikroTik <code style={{ background: 'rgba(114,87,255,0.1)', padding: '2px 5px', borderRadius: 4, color: '#5b3cc4' }}>keepalive-timeout</code> matching the plan duration.
                    </p>
                  </div>

                  {/* Paused Option */}
                  <div
                    onClick={() => setHotspotSettings({ ...hotspotSettings, expiry_mode: 'paused' })}
                    style={{
                      flex: 1, minWidth: 220, padding: '16px', borderRadius: 14, cursor: 'pointer',
                      background: hotspotSettings.expiry_mode === 'paused' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0,0,0,0.03)',
                      border: hotspotSettings.expiry_mode === 'paused' ? '2px solid #10B981' : '1.5px solid rgba(0,0,0,0.12)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: hotspotSettings.expiry_mode === 'paused' ? '6px solid #10B981' : '2px solid rgba(0,0,0,0.25)',
                        background: hotspotSettings.expiry_mode === 'paused' ? '#10B981' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {hotspotSettings.expiry_mode === 'paused' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <strong style={{ fontSize: '0.95rem', color: '#1a1a2e' }}>⏸️ Paused Time</strong>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.55)', margin: 0, lineHeight: 1.5, paddingLeft: 30 }}>
                      Countdown <strong style={{ color: 'rgba(0,0,0,0.75)' }}>pauses</strong> when user disconnects from Wi-Fi. A 24-hour voucher gives exactly 24 hours of active browsing time. Uses MikroTik default short <code style={{ background: 'rgba(16,185,129,0.1)', padding: '2px 5px', borderRadius: 4, color: '#0d7a54' }}>keepalive-timeout</code> (2 minutes).
                    </p>
                  </div>
                </div>
              </div>

              <div className="sa-button-row">
                <button className="sa-btn-primary" onClick={async () => {
                  try {
                    const res = await fetch('/api/super-admin/settings', {
                      method: 'POST', headers: adminHeaders(),
                      body: JSON.stringify({ key: 'hotspot_settings', value: hotspotSettings }),
                    });
                    if (res.ok) showToast('✅ Hotspot sharing settings saved!');
                    else showToast('❌ Failed to save');
                  } catch { showToast('Network error'); }
                }}>Save Hotspot Settings</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: BRANDING & THEME ═══ */}
        {activeTab === 'branding' && (
          <div className="sa-tab-body">
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">App Identity</h3>
                  <p className="sa-card-sub">Customize name, logo, and appearance</p>
                </div>
                <span className="sa-badge sa-badge-purple">Branding</span>
              </div>

              {/* Live Preview */}
              <div className="sa-branding-preview" style={{ background: THEME_PALETTES[brandingForm.theme]?.cardGradient || 'var(--card-gradient)' }}>
                <div className="sa-branding-preview-name">
                  {brandingForm.logo_url && <img src={brandingForm.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: 8, marginRight: 10, verticalAlign: 'middle' }} />}
                  {brandingForm.app_name || 'Your App Name'}
                </div>
                <div className="sa-branding-preview-sub">Wi-Fi Hotspot • Live Preview</div>
              </div>

              <div className="sa-form-grid-2">
                <div className="sa-field-box">
                  <label>App Name *</label>
                  <input value={brandingForm.app_name} onChange={e => setBrandingForm({ ...brandingForm, app_name: e.target.value })} placeholder="Asuk Tech" />
                </div>
                <div className="sa-field-box">
                  <label>Logo URL (optional)</label>
                  <input value={brandingForm.logo_url} onChange={e => setBrandingForm({ ...brandingForm, logo_url: e.target.value })} placeholder="https://example.com/logo.png" />
                </div>
              </div>

              <div className="sa-plan-form-footer">
                <button className="sa-btn-primary" onClick={async () => {
                  try {
                    const res = await fetch('/api/super-admin/settings', {
                      method: 'POST', headers: adminHeaders(),
                      body: JSON.stringify({ key: 'branding', value: brandingForm }),
                    });
                    if (res.ok) showToast('✅ Branding saved! Refresh user app to see changes.');
                    else showToast('❌ Failed to save branding');
                  } catch { showToast('Network error'); }
                }}>Save Branding</button>
              </div>
            </div>

            {/* Theme Palette Picker */}
            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Color Theme</h3>
                  <p className="sa-card-sub">Choose a color palette for the entire app</p>
                </div>
                <span className="sa-badge">{Object.keys(THEME_PALETTES).length} Themes</span>
              </div>

              <div className="sa-theme-grid">
                {Object.values(THEME_PALETTES).map(palette => (
                  <div
                    key={palette.id}
                    className={`sa-theme-swatch ${brandingForm.theme === palette.id ? 'active' : ''}`}
                    onClick={() => setBrandingForm({ ...brandingForm, theme: palette.id })}
                  >
                    <span className="sa-theme-swatch-emoji">{palette.emoji}</span>
                    <div className="sa-theme-color-preview" style={{ background: palette.cardGradient }} />
                    <span className="sa-theme-swatch-label">{palette.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: PAYMENT GATEWAY ═══ */}
        {activeTab === 'payments' && (
          <div className="sa-tab-body">
            <div className="sa-glass-card">
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Flutterwave Payment Gateway</h3>
                  <p className="sa-card-sub">Card, USSD, and bank transfer payments</p>
                </div>
                <span className={`sa-badge ${flutterwaveForm.enabled ? 'sa-badge-success' : 'sa-badge-warn'}`}>
                  {flutterwaveForm.enabled ? '● Active' : '○ Inactive'}
                </span>
              </div>
              <div className="sa-form-grid-1">
                <div className="sa-field-box"><label>Public Key *</label><input value={flutterwaveForm.public_key} onChange={e => setFlutterwaveForm({ ...flutterwaveForm, public_key: e.target.value })} placeholder="FLWPUBK_TEST-xxx" /></div>
                <div className="sa-field-box"><label>Secret Key *</label><input type="password" value={flutterwaveForm.secret_key} onChange={e => setFlutterwaveForm({ ...flutterwaveForm, secret_key: e.target.value })} placeholder="FLWSECK_TEST-xxx" /></div>
                <div className="sa-field-box"><label>Webhook Secret Hash</label><input value={flutterwaveForm.webhook_secret} onChange={e => setFlutterwaveForm({ ...flutterwaveForm, webhook_secret: e.target.value })} placeholder="Your webhook verification hash" /></div>
              </div>
              <div className="sa-ssl-check-row">
                <label className="sa-checkbox-label">
                  <input type="checkbox" checked={flutterwaveForm.enabled} onChange={e => setFlutterwaveForm({ ...flutterwaveForm, enabled: e.target.checked })} />
                  <span>Enable Live Flutterwave Checkout</span>
                </label>
              </div>
              <div style={{ marginTop: 20 }}>
                <button className="sa-btn-primary" onClick={saveFlutterwave}>Save Payment Configuration</button>
              </div>
            </div>

            {/* Webhook URL */}
            <div className="sa-glass-card" style={{ marginTop: 24 }}>
              <div className="sa-card-header">
                <div>
                  <h3 className="sa-card-title">Webhook Configuration</h3>
                  <p className="sa-card-sub">Set this URL in your Flutterwave dashboard under Settings → Webhooks</p>
                </div>
              </div>
              <div className="sa-webhook-url-box">
                <code>{typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/flutterwave` : '/api/webhook/flutterwave'}</code>
                <button className="sa-webhook-copy-btn" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/api/webhook/flutterwave`);
                  setWebhookCopied(true);
                  showToast('Webhook URL copied!');
                  setTimeout(() => setWebhookCopied(false), 2000);
                }}>{webhookCopied ? '✓ Copied' : '📋 Copy'}</button>
              </div>
              <div className="sa-card-sub" style={{ padding: '0 4px', marginTop: 8 }}>
                <strong>Instructions:</strong> Copy this URL and paste it in Flutterwave Dashboard → Settings → Webhooks → Webhook URL. The webhook verifies payments and auto-credits wallets.
              </div>
            </div>
          </div>
        )}
      </main>

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
