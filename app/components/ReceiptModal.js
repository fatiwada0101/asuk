'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DownloadIcon,
  PrinterIcon,
  FileTextIcon,
  ImageIcon,
  CheckIcon,
} from './Icons';
import {
  generatePassReceiptCanvas,
  generateTransactionReceiptCanvas,
  generateStatementCanvas,
  downloadCanvasAsImage,
  downloadCanvasAsPdf,
  downloadStatementPdf,
  printReceipt,
} from '../../lib/receiptGenerator';

export default function ReceiptModal({
  isOpen,
  onClose,
  type = 'pass', // 'pass' | 'transaction' | 'statement'
  data = {},
  brandName = 'Asuk Tech Wi-Fi',
  wifiSsid = 'Asuk Tech Wi-Fi',
  hotspotUrl = 'asuktech.net',
}) {
  const canvasContainerRef = useRef(null);
  const activeCanvasRef = useRef(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImg, setDownloadingImg] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Render canvas whenever modal opens or data changes
  useEffect(() => {
    if (!isOpen || !data) return;

    let canvas = null;
    if (type === 'pass') {
      canvas = generatePassReceiptCanvas({
        brandName,
        wifiSsid,
        hotspotUrl,
        planName: data.plan_name || data.profile_name || data.plan || 'Wi-Fi Access Pass',
        duration: data.duration || (data.limit_uptime_seconds ? `${Math.round(data.limit_uptime_seconds / 3600)} Hours` : 'Standard'),
        voucherCode: data.voucher_code || data.code || 'ASUK-PASS',
        price: data.price || data.amount || 0,
        paymentMethod: data.payment_method || 'Online Payment',
        createdAt: data.created_at || new Date().toISOString(),
        isUsed: data.is_used || false,
      });
    } else if (type === 'transaction') {
      canvas = generateTransactionReceiptCanvas({
        brandName,
        id: data.id,
        type: data.type,
        amount: data.amount,
        flwRef: data.flw_ref,
        paymentMethod: data.payment_method,
        metadata: data.metadata,
        userEmail: data.user_email || data.email,
        createdAt: data.created_at,
      });
    } else if (type === 'statement') {
      canvas = generateStatementCanvas({
        brandName,
        userEmail: data.userEmail || data.email,
        walletBalance: data.walletBalance || 0,
        totalDeposits: data.totalDeposits || 0,
        totalSpent: data.totalSpent || 0,
        transactions: data.transactions || [],
      });
    }

    activeCanvasRef.current = canvas;

    if (canvasContainerRef.current) {
      canvasContainerRef.current.innerHTML = '';
      if (canvas) {
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        canvas.style.borderRadius = '16px';
        canvas.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.12)';
        canvasContainerRef.current.appendChild(canvas);
      }
    }
  }, [isOpen, type, data, brandName, wifiSsid, hotspotUrl]);

  if (!isOpen) return null;

  const showFeedback = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const getFilePrefix = () => {
    if (type === 'pass') {
      const code = data.voucher_code || data.code || 'pass';
      return `AsukTech-Pass-${code}`;
    }
    if (type === 'transaction') {
      const ref = data.flw_ref || data.id || 'receipt';
      return `AsukTech-Receipt-${ref}`;
    }
    return `AsukTech-Statement-${new Date().toISOString().slice(0, 10)}`;
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      const filename = `${getFilePrefix()}.pdf`;

      if (type === 'statement') {
        await downloadStatementPdf(
          {
            brandName,
            userEmail: data.userEmail || data.email,
            walletBalance: data.walletBalance || 0,
            totalDeposits: data.totalDeposits || 0,
            totalSpent: data.totalSpent || 0,
            transactions: data.transactions || [],
          },
          filename
        );
      } else if (activeCanvasRef.current) {
        await downloadCanvasAsPdf(activeCanvasRef.current, filename, 'Receipt');
      }
      showFeedback('✓ PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF export error:', err);
      showFeedback('Could not generate PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadImage = () => {
    try {
      setDownloadingImg(true);
      if (activeCanvasRef.current) {
        const filename = `${getFilePrefix()}.png`;
        downloadCanvasAsImage(activeCanvasRef.current, filename);
        showFeedback('✓ Image saved to downloads!');
      }
    } catch (err) {
      console.error('Image export error:', err);
      showFeedback('Could not save image');
    } finally {
      setDownloadingImg(false);
    }
  };

  const handlePrint = () => {
    if (activeCanvasRef.current) {
      printReceipt(activeCanvasRef.current);
    }
  };

  const getTitle = () => {
    if (type === 'pass') return 'Wi-Fi Access Pass Receipt';
    if (type === 'transaction') return 'Transaction Payment Receipt';
    return 'Account Activity Statement';
  };

  return (
    <div className="receipt-modal-backdrop" onClick={onClose}>
      <div
        className="receipt-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="receipt-modal-header">
          <div>
            <span className="receipt-modal-pill">OFFICIAL RECEIPT</span>
            <h3 className="receipt-modal-title">{getTitle()}</h3>
          </div>
          <button
            type="button"
            className="receipt-modal-close"
            onClick={onClose}
            aria-label="Close receipt"
          >
            ✕
          </button>
        </div>

        {/* Status Toast */}
        {statusMsg && (
          <div className="receipt-status-banner">
            <CheckIcon size={16} color="#10B981" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Live Receipt Preview */}
        <div className="receipt-preview-viewport">
          <div ref={canvasContainerRef} className="receipt-canvas-wrap" />
        </div>

        {/* Action Buttons Toolbar */}
        <div className="receipt-actions-toolbar">
          <button
            type="button"
            className="receipt-btn receipt-btn-pdf"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            title="Download vector PDF document"
          >
            <FileTextIcon size={18} color="#FFFFFF" />
            <span>{downloadingPdf ? 'Exporting...' : 'PDF Document'}</span>
          </button>

          <button
            type="button"
            className="receipt-btn receipt-btn-img"
            onClick={handleDownloadImage}
            disabled={downloadingImg}
            title="Save high-resolution image"
          >
            <ImageIcon size={18} color="#18181B" />
            <span>{downloadingImg ? 'Saving...' : 'Save as Image'}</span>
          </button>

          <button
            type="button"
            className="receipt-btn receipt-btn-print"
            onClick={handlePrint}
            title="Print thermal or paper receipt"
          >
            <PrinterIcon size={18} color="#18181B" />
            <span>Print</span>
          </button>
        </div>

        <div className="receipt-modal-footer-hint">
          <span>Encrypted with SHA-256 validation • Printable on 80mm thermal & A4 printers</span>
        </div>
      </div>
    </div>
  );
}
