'use client';

import { useState, useEffect } from 'react';
import { DatabaseIcon, CheckIcon, DownloadIcon } from './Icons';

export default function DatabaseSchemaTab({ adminHeaders, showToast }) {
  const [schemaData, setSchemaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'tables' | 'procedures' | 'rls' | 'seeds'

  useEffect(() => {
    async function loadSchema() {
      try {
        const res = await fetch('/api/super-admin/schema', {
          headers: adminHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setSchemaData(data);
        }
      } catch (err) {
        console.error('Failed to load schema:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSchema();
  }, [adminHeaders]);

  const fullSql = schemaData?.sql || '';

  // Filter SQL by section
  const getFilteredSql = () => {
    if (!fullSql) return '';
    if (activeFilter === 'all') return fullSql;

    const lines = fullSql.split('\n');
    let capturing = false;
    let sectionLines = [];

    const sectionMarkers = {
      tables: { start: '-- 1. CORE APPLICATION TABLES', end: '-- ==============================================================================\n-- 3.' },
      procedures: { start: '-- 3. STORED PROCEDURES & DATABASE FUNCTIONS', end: '-- ==============================================================================\n-- 4.' },
      rls: { start: '-- 4. ROW LEVEL SECURITY (RLS) POLICIES', end: '-- ==============================================================================\n-- 5.' },
      seeds: { start: '-- 5. DEFAULT SEED DATA', end: '___END___' },
    };

    const marker = sectionMarkers[activeFilter];
    if (!marker) return fullSql;

    const startIdx = fullSql.indexOf(marker.start);
    if (startIdx === -1) return fullSql;

    let endIdx = marker.end === '___END___' ? fullSql.length : fullSql.indexOf(marker.end, startIdx);
    if (endIdx === -1) endIdx = fullSql.length;

    return fullSql.slice(startIdx, endIdx).trim();
  };

  const handleCopy = (textToCopy) => {
    const text = textToCopy || getFilteredSql();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('✅ Schema copied to clipboard!');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownload = () => {
    const text = displaySql || fullSql;
    if (!text) return;
    const blob = new Blob([text], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFilter !== 'all' ? `schema-${activeFilter}.sql` : 'schema.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 schema.sql downloaded successfully!');
  };

  const displaySql = getFilteredSql();

  return (
    <div className="sa-tab-body">
      {/* Hero / Overview Banner */}
      <div
        className="sa-glass-card"
        style={{
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(114, 87, 255, 0.12) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 24 }}>📦</span>
              <h3 className="sa-card-title" style={{ fontSize: 20, color: '#FFFFFF' }}>
                Turnkey Supabase Database Schema
              </h3>
              <span className="sa-badge sa-badge-purple" style={{ fontSize: 11 }}>
                PostgreSQL • 10 Tables • RLS Enabled
              </span>
            </div>
            <p className="sa-card-sub" style={{ maxWidth: 720, color: '#D4D4D8', fontSize: 13 }}>
              Everything needed to provision a brand-new Supabase project or clone this entire Wi-Fi Hotspot platform. Includes all tables, indexes, race-protected wallet RPC functions, automated triggers, customer RLS security policies, and default seed packages.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="sa-btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 12,
                background: copied ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #38BDF8 0%, #2563EB 100%)',
                boxShadow: '0 4px 16px rgba(56, 189, 248, 0.3)',
              }}
              onClick={() => handleCopy()}
            >
              {copied ? <CheckIcon size={16} /> : <span>📋</span>}
              {copied ? 'Copied to Clipboard!' : 'Copy Turnkey SQL'}
            </button>

            <button
              type="button"
              className="sa-btn-outline"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '12px 18px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 12,
                cursor: 'pointer',
              }}
              onClick={handleDownload}
            >
              <DownloadIcon size={16} /> Download schema.sql
            </button>

            {schemaData?.sqlEditorUrl && (
              <a
                href={schemaData.sqlEditorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sa-btn-outline"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '12px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 12,
                  textDecoration: 'none',
                }}
              >
                <span>🚀</span> Open Supabase SQL Editor
              </a>
            )}
          </div>
        </div>

        {/* Live Project Info Pills */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#A1A1AA' }}>
            <span>Active Supabase Endpoint:</span>
            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '3px 8px', borderRadius: 6, color: '#38BDF8', fontFamily: 'monospace' }}>
              {schemaData?.supabaseUrl || 'https://your-project.supabase.co'}
            </code>
          </div>
          {schemaData?.projectRef && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#A1A1AA' }}>
              <span>Project Ref:</span>
              <code style={{ background: 'rgba(0,0,0,0.3)', padding: '3px 8px', borderRadius: 6, color: '#A78BFA', fontFamily: 'monospace' }}>
                {schemaData.projectRef}
              </code>
            </div>
          )}
        </div>
      </div>

      {/* 3-Step Setup Guide */}
      <div className="sa-glass-card" style={{ marginBottom: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#FFFFFF' }}>
          ⚡ 3-Step Deployment Guide for Cloned / New Instances
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ background: '#38BDF8', color: '#000', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>1</span>
              <strong style={{ fontSize: 13, color: '#FFFFFF' }}>Create Supabase Project</strong>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#A1A1AA' }}>
              Visit <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: '#38BDF8' }}>supabase.com</a>, create an organization, and launch a new PostgreSQL project in your preferred region.
            </p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ background: '#38BDF8', color: '#000', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>2</span>
              <strong style={{ fontSize: 13, color: '#FFFFFF' }}>Run Schema in SQL Editor</strong>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#A1A1AA' }}>
              Click <strong>&quot;Copy Turnkey SQL&quot;</strong> above, open the <strong>SQL Editor</strong> in your new Supabase project, paste the SQL query, and click <strong>&quot;RUN&quot;</strong>.
            </p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ background: '#38BDF8', color: '#000', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>3</span>
              <strong style={{ fontSize: 13, color: '#FFFFFF' }}>Configure Environment Keys</strong>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#A1A1AA' }}>
              Add your Project URL, anon key, service_role key, and <code style={{ color: '#38BDF8' }}>NEXT_PUBLIC_APP_URL</code> to <code style={{ color: '#38BDF8' }}>.env.local</code> or Vercel settings.
            </p>
          </div>
        </div>
      </div>

      {/* Table & Security Catalog */}
      <div className="sa-glass-card" style={{ marginBottom: 20 }}>
        <div className="sa-card-header">
          <div>
            <h3 className="sa-card-title">🗂️ Database Tables &amp; Security Catalog ({schemaData?.tables?.length || 10})</h3>
            <p className="sa-card-sub">Architecture overview of all managed relations and their active RLS access models</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
          {(schemaData?.tables || [
            { name: 'profiles', desc: 'User accounts linked to auth.users with roles', rls: 'Auth-Scoped (Users view/edit own)' },
            { name: 'wallets', desc: 'Prepaid balances with balance >= 0 check constraint', rls: 'Auth-Scoped (Users view own)' },
            { name: 'transactions', desc: 'Payment ledger with Flutterwave refs and transaction types', rls: 'Auth-Scoped (Users view own)' },
            { name: 'vouchers', desc: 'Wi-Fi credentials, profiles, limits, durations, and batch tracking', rls: 'Auth-Scoped (Users view own)' },
            { name: 'fallback_vouchers', desc: 'Pre-generated offline voucher cache for emergency router failover', rls: 'Service-Role (Secure server access)' },
            { name: 'plans', desc: 'Bandwidth passes with upload/download rate limits and devices', rls: 'Public (Read-only for active passes)' },
            { name: 'app_settings', desc: 'Central router configuration, branding, payments, and login templates', rls: 'Service-Role (Super Admin guarded)' },
            { name: 'change_history', desc: 'Audit log of admin configurations with 1-click state rollback', rls: 'Service-Role (Super Admin guarded)' },
            { name: 'pending_router_tasks', desc: 'Asynchronous task queue for router sync and polling mode', rls: 'Service-Role (Router/Server sync)' },
            { name: 'notifications', desc: 'Customer in-app alert notifications for transactions & top-ups', rls: 'Auth-Scoped (Users view/update own)' },
          ]).map((t, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <code style={{ fontSize: 13, fontWeight: 700, color: '#38BDF8' }}>public.{t.name}</code>
                  <span
                    className="sa-badge"
                    style={{
                      fontSize: 10,
                      background: t.rls.includes('Auth-Scoped')
                        ? 'rgba(16, 185, 129, 0.15)'
                        : t.rls.includes('Public')
                        ? 'rgba(56, 189, 248, 0.15)'
                        : 'rgba(168, 85, 247, 0.15)',
                      color: t.rls.includes('Auth-Scoped')
                        ? '#34D399'
                        : t.rls.includes('Public')
                        ? '#38BDF8'
                        : '#C084FC',
                      border: 'none',
                    }}
                  >
                    {t.rls.split(' ')[0]}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#A1A1AA', lineHeight: 1.4 }}>
                  {t.desc}
                </p>
              </div>
              <div style={{ marginTop: 8, fontSize: 10.5, color: '#71717A' }}>
                🛡️ {t.rls}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SQL Script Viewer */}
      <div className="sa-glass-card">
        <div className="sa-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 className="sa-card-title">📜 PostgreSQL Schema Script (`schema.sql`)</h3>
            <p className="sa-card-sub">Interactive viewer with section filtering and instant copy</p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
              {[
                { id: 'all', label: 'All SQL' },
                { id: 'tables', label: 'Tables' },
                { id: 'procedures', label: 'Procedures' },
                { id: 'rls', label: 'RLS Policies' },
                { id: 'seeds', label: 'Default Seeds' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  style={{
                    background: activeFilter === f.id ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: activeFilter === f.id ? '#38BDF8' : '#A1A1AA',
                    border: 'none',
                    borderRadius: 7,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: activeFilter === f.id ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              className="sa-btn-pill-small"
              onClick={() => handleCopy()}
              style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {copied ? <CheckIcon size={14} /> : <span>📋</span>}
              {copied ? 'Copied' : 'Copy View'}
            </button>
          </div>
        </div>

        {/* Code Frame */}
        <div
          style={{
            position: 'relative',
            marginTop: 12,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
            background: '#090D16',
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              padding: '8px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11.5,
              color: '#71717A',
            }}
          >
            <span>scripts/schema.sql ({displaySql.split('\n').length} lines)</span>
            <span style={{ color: '#38BDF8' }}>PostgreSQL 14+ / Supabase DDL</span>
          </div>

          <pre
            style={{
              margin: 0,
              padding: 16,
              maxHeight: 520,
              overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              color: '#E2E8F0',
              tabSize: 2,
              whiteSpace: 'pre',
            }}
          >
            <code>{loading ? '-- Loading schema from server...' : displaySql}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
