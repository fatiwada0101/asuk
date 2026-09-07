'use client';

import { useState, useEffect, useCallback } from 'react';

export default function MikroTikDiagnosticsAndLogs({
  testResult,
  testLoading,
  onTest,
  adminHeaders,
  showToast,
}) {
  const [logsData, setLogsData] = useState({ logs: [], stats: null });
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Fetch connection logs
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/mikrotik/logs?limit=30', {
        headers: adminHeaders ? adminHeaders() : {},
      });
      if (res.ok) {
        const json = await res.json();
        setLogsData({
          logs: json.logs || [],
          stats: json.stats || null,
        });
      }
    } catch (err) {
      console.warn('Could not fetch connection logs:', err.message);
    } finally {
      setLogsLoading(false);
    }
  }, [adminHeaders]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Refresh logs when testResult changes
  useEffect(() => {
    if (testResult) {
      fetchLogs();
    }
  }, [testResult, fetchLogs]);

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear the connection log history?')) return;
    setClearing(true);
    try {
      const res = await fetch('/api/mikrotik/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminHeaders ? adminHeaders() : {}),
        },
        body: JSON.stringify({ action: 'clear' }),
      });
      if (res.ok) {
        setLogsData({ logs: [], stats: null });
        setSelectedLog(null);
        if (showToast) showToast('✅ Connection logs cleared');
      }
    } catch (err) {
      if (showToast) showToast('Failed to clear logs');
    } finally {
      setClearing(false);
    }
  };

  const getStatusBadge = (log) => {
    if (log.connected || log.errorCode === 'OK') {
      return { label: '🟢 CONNECTED', color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)' };
    }
    if (log.errorCode === 'TIMEOUT') {
      return { label: '⏱️ TIMEOUT', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' };
    }
    if (log.errorCode === 'REFUSED') {
      return { label: '🚫 REFUSED', color: '#F97316', bg: 'rgba(249, 115, 22, 0.12)' };
    }
    if (log.errorCode === 'AUTH_FAILED') {
      return { label: '🔒 AUTH ERROR', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)' };
    }
    if (log.errorCode === 'NOT_CONFIGURED') {
      return { label: '⚙️ NOT CONFIGURED', color: '#8E8E93', bg: 'rgba(142, 142, 147, 0.12)' };
    }
    return { label: `🔴 ${log.errorCode || 'FAILED'}`, color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' };
  };

  const formatLogTime = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (${d.toLocaleDateString()})`;
    } catch {
      return ts;
    }
  };

  const currentStatus = testResult ? getStatusBadge(testResult) : null;
  const logsToDisplay = showAllLogs ? logsData.logs : logsData.logs.slice(0, 5);

  return (
    <div style={{ marginTop: '24px' }}>
      {/* ── 1. ACTIVE DIAGNOSTICS CARD ── */}
      {testResult && (
        <div className="sa-glass-card" style={{ marginBottom: '20px' }}>
          <div className="sa-card-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 className="sa-card-title">MikroTik Live Diagnostics</h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    color: currentStatus?.color,
                    background: currentStatus?.bg,
                  }}
                >
                  {currentStatus?.label}
                </span>
              </div>
              <p className="sa-card-sub" style={{ marginTop: '4px' }}>
                Target: <code style={{ color: '#7257FF', fontWeight: 700 }}>{testResult.target || 'Router Endpoint'}</code>
                {testResult.duration_ms ? ` • Latency: ${testResult.duration_ms}ms` : ''}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="sa-btn-pill-small"
                onClick={onTest}
                disabled={testLoading}
                style={{ cursor: testLoading ? 'not-allowed' : 'pointer' }}
              >
                {testLoading ? '⏳ Testing...' : '⚡ Test Connection'}
              </button>
            </div>
          </div>

          {/* Connected State */}
          {testResult.connected ? (
            <div className="sa-diag-grid">
              <div className="sa-diag-item">
                <span className="sa-diag-label">Router Model</span>
                <strong className="sa-diag-val">{testResult.router?.model || 'MikroTik Router'}</strong>
              </div>
              <div className="sa-diag-item">
                <span className="sa-diag-label">RouterOS Version</span>
                <strong className="sa-diag-val">{testResult.router?.version || 'v7+'}</strong>
              </div>
              <div className="sa-diag-item">
                <span className="sa-diag-label">Uptime</span>
                <strong className="sa-diag-val">{testResult.router?.uptime || 'Active'}</strong>
              </div>
              <div className="sa-diag-item">
                <span className="sa-diag-label">CPU Load</span>
                <strong className="sa-diag-val">{testResult.router?.cpuLoad || 'Optimal'}</strong>
              </div>
              <div className="sa-diag-item" style={{ gridColumn: '1 / -1' }}>
                <span className="sa-diag-label">Hotspot Server Profiles</span>
                <div className="sa-profiles-tag-wrap">
                  {testResult.profiles?.length > 0 ? (
                    testResult.profiles.map((p) => (
                      <span key={p} className="sa-profile-pill">
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="sa-color-muted">default</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Connection Failed State */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
              {/* Primary Error Alert */}
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1.5px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '14px',
                  padding: '14px 18px',
                  color: '#EF4444',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px' }}>
                  <span>⚠️</span>
                  <span>{testResult.error || testResult.diagnostics?.summary || 'Connection Failed'}</span>
                </div>
                {testResult.details && (
                  <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#B91C1C', lineHeight: 1.5 }}>
                    {testResult.details}
                  </p>
                )}
              </div>

              {/* Subnet / Cloud Reachability Notice */}
              {testResult.is_private_ip && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1.5px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    color: '#B45309',
                  }}
                >
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px' }}>
                    <span>💡</span> Why Private IP (e.g. 192.168.88.1) Fails from Cloud or Different Networks
                  </strong>
                  <p style={{ fontSize: '12.5px', marginTop: '6px', lineHeight: 1.5, color: '#92400E' }}>
                    The target IP is a private local network address (RFC 1918). If this website is running in the cloud (such as Vercel) or your PC is on a different Wi-Fi subnet or VPN, public servers <strong>cannot route directly to private LAN IPs</strong>.
                  </p>
                  <ul style={{ fontSize: '12px', marginTop: '6px', paddingLeft: '18px', color: '#92400E', lineHeight: 1.5 }}>
                    <li><strong>To connect from cloud / Vercel:</strong> Enable MikroTik Cloud in WinBox (<code>IP -&gt; Cloud -&gt; DDNS Enabled</code>), and enter your <code>*.sn.mynetname.net</code> domain as the Router IP with port 443 forwarded.</li>
                    <li><strong>To test locally:</strong> Ensure your computer is directly connected to the MikroTik router Wi-Fi or LAN cable.</li>
                  </ul>
                </div>
              )}

              {/* Recommended Steps to Fix */}
              {testResult.remediation?.length > 0 && (
                <div
                  style={{
                    background: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    borderRadius: '14px',
                    padding: '14px 18px',
                  }}
                >
                  <strong style={{ fontSize: '13px', color: '#1F2937' }}>
                    🛠️ Step-by-Step Fixes to Resolve This:
                  </strong>
                  <ol style={{ margin: '8px 0 0', paddingLeft: '20px', fontSize: '12.5px', color: '#4B5563', lineHeight: 1.6 }}>
                    {testResult.remediation.map((step, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 2. CONNECTION LOGS & HISTORY SECTION ── */}
      <div className="sa-glass-card">
        <div className="sa-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 className="sa-card-title">Connection Logs &amp; Audit Trail</h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: '#ECEEF2',
                  color: '#71717A',
                }}
              >
                {logsData.logs.length} Recorded
              </span>
            </div>
            <p className="sa-card-sub">
              Historical record of router REST API connectivity checks and diagnostic verdicts
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="sa-btn-pill-small"
              onClick={fetchLogs}
              disabled={logsLoading}
              style={{ cursor: logsLoading ? 'not-allowed' : 'pointer' }}
              title="Refresh log history"
            >
              {logsLoading ? '⏳ Refreshing...' : '🔄 Refresh'}
            </button>

            {logsData.logs.length > 0 && (
              <button
                type="button"
                className="sa-btn-pill-small"
                onClick={handleClearLogs}
                disabled={clearing}
                style={{
                  color: '#EF4444',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  cursor: clearing ? 'not-allowed' : 'pointer',
                }}
                title="Clear all recorded connection logs"
              >
                {clearing ? 'Clearing...' : '🗑️ Clear Logs'}
              </button>
            )}
          </div>
        </div>

        {/* Aggregate Stats Summary */}
        {logsData.stats && logsData.stats.total > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              marginBottom: '16px',
            }}
          >
            <div style={{ background: '#F8F9FB', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Checks
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#121217', marginTop: '2px' }}>
                {logsData.stats.total}
              </div>
            </div>

            <div style={{ background: '#F8F9FB', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
                Uptime Rate
              </div>
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: logsData.stats.uptimePercent >= 80 ? '#10B981' : '#EF4444',
                  marginTop: '2px',
                }}
              >
                {logsData.stats.uptimePercent}%
              </div>
            </div>

            <div style={{ background: '#F8F9FB', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
                Successful
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#10B981', marginTop: '2px' }}>
                {logsData.stats.successful}
              </div>
            </div>

            <div style={{ background: '#F8F9FB', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
                Failed / Timeout
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#EF4444', marginTop: '2px' }}>
                {logsData.stats.failed}
              </div>
            </div>

            <div style={{ background: '#F8F9FB', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
                Avg Response
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#7257FF', marginTop: '2px' }}>
                {logsData.stats.avgLatencyMs ? `${logsData.stats.avgLatencyMs}ms` : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Logs List Table */}
        {logsData.logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 16px', color: '#8E8E93', fontSize: '13px' }}>
            No connection attempts logged yet. Click <strong>&ldquo;⚡ Test Connection&rdquo;</strong> above to record your first diagnostic test.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {logsToDisplay.map((log) => {
              const badge = getStatusBadge(log);
              const isSelected = selectedLog?.id === log.id;
              return (
                <div
                  key={log.id}
                  style={{
                    background: isSelected ? 'rgba(114, 87, 255, 0.05)' : '#F9FAFB',
                    border: isSelected ? '1.5px solid #7257FF' : '1px solid #ECEEF2',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '999px',
                          color: badge.color,
                          background: badge.bg,
                        }}
                      >
                        {badge.label}
                      </span>
                      <strong style={{ fontSize: '13px', color: '#18181B' }}>
                        {log.target}
                      </strong>
                      <span style={{ fontSize: '11px', color: '#71717A' }}>
                        • {log.durationMs ? `${log.durationMs}ms` : '0ms'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '11px', color: '#8E8E93', fontFamily: 'monospace' }}>
                        {formatLogTime(log.timestamp)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedLog(isSelected ? null : log)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#7257FF',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: '4px 8px',
                        }}
                      >
                        {isSelected ? '▲ Hide Details' : '▼ Inspect'}
                      </button>
                    </div>
                  </div>

                  {/* Summary preview */}
                  <div style={{ fontSize: '12px', color: '#52525B', marginTop: '4px' }}>
                    {log.summary}
                  </div>

                  {/* Expanded detail box */}
                  {isSelected && (
                    <div
                      style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px dashed #E4E4E7',
                        fontSize: '12.5px',
                      }}
                    >
                      {log.details && (
                        <div style={{ marginBottom: '8px' }}>
                          <strong style={{ color: '#27272A' }}>Diagnosis: </strong>
                          <span style={{ color: '#52525B' }}>{log.details}</span>
                        </div>
                      )}

                      {log.rawError && (
                        <div style={{ marginBottom: '8px' }}>
                          <strong style={{ color: '#27272A' }}>Raw System Cause: </strong>
                          <code style={{ background: '#ECEEF2', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#DC2626' }}>
                            {log.rawError}
                          </code>
                        </div>
                      )}

                      {log.routerInfo && (
                        <div style={{ marginBottom: '8px', fontSize: '12px', color: '#059669' }}>
                          ✓ Router Details: {log.routerInfo.model} • RouterOS {log.routerInfo.version} • Uptime {log.routerInfo.uptime} • CPU {log.routerInfo.cpuLoad}
                        </div>
                      )}

                      {log.remediation?.length > 0 && (
                        <div style={{ marginTop: '8px', background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ECEEF2' }}>
                          <strong style={{ color: '#18181B' }}>Remediation Checklist:</strong>
                          <ul style={{ margin: '4px 0 0', paddingLeft: '18px', color: '#52525B', lineHeight: 1.5 }}>
                            {log.remediation.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* View More toggle */}
            {logsData.logs.length > 5 && (
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAllLogs(!showAllLogs)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#7257FF',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '6px 12px',
                  }}
                >
                  {showAllLogs ? `▲ Show Recent 5 Only` : `▼ Show All ${logsData.logs.length} Recorded Logs`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
