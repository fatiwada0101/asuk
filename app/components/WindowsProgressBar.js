'use client';

import React from 'react';

/**
 * WindowsProgressBar — Authentic Windows-style animated glowing progress bar
 * Features:
 * - Recessed track with subtle inner glow
 * - Specular animated sheen running across the fill bar (@keyframes winProgressSheen)
 * - Dynamic percentage badge (1% - 100%)
 * - Adaptive color states (normal / active green-cyan, warning amber, error crimson, success green)
 * - Current task / domain subtitle and real-time counter
 * - Action buttons for Retry, Cancel, or Dismiss
 */
export default function WindowsProgressBar({
  percent = 0,
  title = 'Processing...',
  subtitle = '',
  status = 'normal', // 'normal' | 'warning' | 'error' | 'success'
  itemCount = '',
  elapsedText = '',
  onRetry = null,
  onCancel = null,
  onDismiss = null,
  canRetry = false,
  showSheen = true,
  style = {},
}) {
  const clampedPercent = Math.min(Math.max(Math.round(percent), 0), 100);

  // Determine status color modifier
  const statusClass = {
    normal: 'is-normal',
    warning: 'is-warning',
    error: 'is-error',
    success: 'is-success',
  }[status] || 'is-normal';

  const statusBadge = {
    normal: { text: `${clampedPercent}%`, color: '#38bdf8' },
    warning: { text: `⚠️ ${clampedPercent}% (Slow)`, color: '#fbbf24' },
    error: { text: `❌ ${clampedPercent}% (Failed)`, color: '#f87171' },
    success: { text: `✅ 100% Completed`, color: '#4ade80' },
  }[status] || { text: `${clampedPercent}%`, color: '#38bdf8' };

  return (
    <div className={`sa-win-progress-card ${statusClass}`} style={style}>
      {/* Top Header Row: Title & Percentage */}
      <div className="sa-win-progress-header">
        <div className="sa-win-progress-title-col">
          <div className="sa-win-progress-title">
            <span className="sa-win-progress-pulse" />
            {title}
          </div>
          {subtitle && (
            <div className="sa-win-progress-sub">
              {subtitle}
            </div>
          )}
        </div>

        <div className="sa-win-progress-badge" style={{ color: statusBadge.color }}>
          {statusBadge.text}
        </div>
      </div>

      {/* Windows-Style Recessed Groove Track */}
      <div className="sa-win-progress-track">
        <div
          className={`sa-win-progress-fill ${statusClass} ${showSheen && clampedPercent > 0 && clampedPercent < 100 ? 'has-sheen' : ''}`}
          style={{ width: `${clampedPercent}%` }}
        >
          {/* Internal specular highlight reflection */}
          <div className="sa-win-progress-specular" />
        </div>
      </div>

      {/* Bottom Info & Actions Row */}
      <div className="sa-win-progress-footer">
        <div className="sa-win-progress-meta">
          {itemCount && <span className="sa-win-progress-pill">{itemCount}</span>}
          {elapsedText && <span className="sa-win-progress-pill secondary">{elapsedText}</span>}
        </div>

        <div className="sa-win-progress-actions">
          {canRetry && onRetry && (
            <button
              type="button"
              className="sa-win-btn retry"
              onClick={onRetry}
            >
              🔄 Retry
            </button>
          )}

          {onCancel && status !== 'success' && status !== 'error' && (
            <button
              type="button"
              className="sa-win-btn cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}

          {onDismiss && (status === 'success' || status === 'error') && (
            <button
              type="button"
              className="sa-win-btn dismiss"
              onClick={onDismiss}
            >
              ✕ Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
