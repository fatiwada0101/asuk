/**
 * lib/receiptGenerator.js
 * High-resolution canvas rendering and PDF/Image/Print export engine
 * for Wi-Fi Passes, Individual Transactions, and Account Statements.
 */

// Helper to format currency
export function formatCurrency(amount) {
  const num = Number(amount || 0);
  return '₦' + num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Helper to format date
export function formatReceiptDate(dateString) {
  if (!dateString) {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Draws a rounded rectangle path on a 2D canvas context
 */
function roundRect(ctx, x, y, width, height, radius) {
  if (typeof radius === 'number') {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  } else {
    radius = {
      tl: radius.tl || 0,
      tr: radius.tr || 0,
      br: radius.br || 0,
      bl: radius.bl || 0,
    };
  }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
}

/**
 * Draws simulated barcode lines
 */
function drawBarcode(ctx, x, y, width, height, seed = 'ASUK') {
  ctx.save();
  ctx.fillStyle = '#18181B';
  const pattern = [
    2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 4, 2,
    1, 3, 1, 2, 3, 1, 4, 2, 1, 2, 3, 1, 2, 1, 4, 2, 3, 1, 2, 1,
    3, 2, 1, 4, 1, 2, 3, 1, 2, 4, 2, 1, 3, 1, 2, 3, 1, 4, 2, 1
  ];
  let curX = x;
  const totalPatternWidth = pattern.reduce((a, b) => a + b, 0);
  const scale = width / totalPatternWidth;

  for (let i = 0; i < pattern.length; i++) {
    const barWidth = pattern[i] * scale;
    if (i % 2 === 0) {
      ctx.fillRect(curX, y, Math.max(1, barWidth - 0.5), height);
    }
    curX += barWidth;
  }
  ctx.restore();
}

/**
 * ─────────────────────────────────────────────────────────────
 * PASS RECEIPT CANVAS GENERATOR
 * Renders a high-DPI Wi-Fi Access Pass receipt
 * ─────────────────────────────────────────────────────────────
 */
export function generatePassReceiptCanvas(passData = {}) {
  const scale = 2; // Retina sharpness
  const canvasWidth = 560 * scale;
  const canvasHeight = 840 * scale;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const w = 560;
  const h = 840;
  const margin = 20;
  const cardW = w - margin * 2;
  const cardH = h - margin * 2;

  // Background canvas fill (soft light gray)
  ctx.fillStyle = '#F4F4F7';
  ctx.fillRect(0, 0, w, h);

  // Outer Receipt Card with subtle drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, margin, margin, cardW, cardH, 20);
  ctx.fill();
  ctx.restore();

  // 1. TOP HEADER BANNER (Dark Navy Gradient)
  const headerH = 150;
  ctx.save();
  const grad = ctx.createLinearGradient(margin, margin, margin + cardW, margin + headerH);
  grad.addColorStop(0, '#0F172A');
  grad.addColorStop(1, '#1E293B');
  ctx.fillStyle = grad;
  roundRect(ctx, margin, margin, cardW, headerH, { tl: 20, tr: 20, br: 0, bl: 0 });
  ctx.fill();

  // Branding Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(passData.brandName || 'ASUK TECH WI-FI', w / 2, margin + 42);

  // Subtitle
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('HIGH-SPEED HOTSPOT ACCESS PASS', w / 2, margin + 64);

  // Status Pill in Header
  const pillW = 140;
  const pillH = 24;
  const pillX = w / 2 - pillW / 2;
  const pillY = margin + 82;
  ctx.fillStyle = passData.isUsed ? '#334155' : '#10B981';
  roundRect(ctx, pillX, pillY, pillW, pillH, 12);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(passData.isUsed ? '● PASS USED' : '● READY TO CONNECT', w / 2, pillY + 16);

  // Timestamp & Ref
  ctx.fillStyle = '#64748B';
  ctx.font = '500 11px monospace';
  ctx.fillText(formatReceiptDate(passData.createdAt), w / 2, margin + 130);
  ctx.restore();

  // 2. PERFORATION LINE WITH CIRCLE CUTOUTS
  const perfY = margin + headerH;
  ctx.save();
  // Left Cutout
  ctx.fillStyle = '#F4F4F7';
  ctx.beginPath();
  ctx.arc(margin, perfY, 14, 0, Math.PI * 2);
  ctx.fill();

  // Right Cutout
  ctx.beginPath();
  ctx.arc(margin + cardW, perfY, 14, 0, Math.PI * 2);
  ctx.fill();

  // Dashed Line
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(margin + 20, perfY);
  ctx.lineTo(margin + cardW - 20, perfY);
  ctx.stroke();
  ctx.restore();

  // 3. VOUCHER PIN HERO BOX
  let curY = perfY + 30;
  const pinBoxW = cardW - 48;
  const pinBoxH = 88;
  const pinBoxX = (w - pinBoxW) / 2;

  ctx.save();
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  roundRect(ctx, pinBoxX, curY, pinBoxW, pinBoxH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '800 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('YOUR WI-FI VOUCHER PIN', w / 2, curY + 24);

  // PIN Code
  ctx.fillStyle = '#0F172A';
  ctx.font = '900 32px "Courier New", Courier, monospace';
  ctx.letterSpacing = '3px';
  ctx.fillText(passData.voucherCode || 'ASUK-0000', w / 2, curY + 62);
  ctx.restore();

  // 4. PLAN & ACCESS SPECIFICATIONS TABLE
  curY += pinBoxH + 26;
  const rowH = 26;
  const leftX = margin + 34;
  const rightX = margin + cardW - 34;

  const rows = [
    { label: 'Hotspot Plan', value: passData.planName || 'Wi-Fi Access Pass' },
    { label: 'Validity / Duration', value: passData.duration || 'Standard Session' },
    { label: 'Amount Paid', value: formatCurrency(passData.price) },
    { label: 'Payment Method', value: passData.paymentMethod || 'Online Payment' },
    { label: 'Network Name (SSID)', value: passData.wifiSsid || 'Asuk Tech Wi-Fi' },
    { label: 'Login Portal', value: passData.hotspotUrl || 'asuktech.net' },
    { label: 'Device Limit', value: '1 Device Simultaneously' },
  ];

  rows.forEach((row, idx) => {
    // Row background zebra stripe
    if (idx % 2 === 0) {
      ctx.fillStyle = '#FAFAFC';
      roundRect(ctx, margin + 24, curY - 17, cardW - 48, rowH, 6);
      ctx.fill();
    }

    ctx.fillStyle = '#64748B';
    ctx.font = '600 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, leftX, curY);

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(row.value, rightX, curY);

    curY += rowH + 4;
  });

  // 5. CONNECTION GUIDE BOX
  curY += 8;
  const guideW = cardW - 48;
  const guideH = 80;
  const guideX = (w - guideW) / 2;

  ctx.save();
  ctx.fillStyle = '#F1F5F9';
  roundRect(ctx, guideX, curY, guideW, guideH, 12);
  ctx.fill();

  ctx.fillStyle = '#0F172A';
  ctx.font = '800 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('⚡ HOW TO CONNECT:', guideX + 16, curY + 22);

  ctx.fillStyle = '#334155';
  ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`1. Connect device Wi-Fi to "${passData.wifiSsid || 'Asuk Tech Wi-Fi'}"`, guideX + 16, curY + 40);
  ctx.fillText(`2. Open browser to http://${passData.hotspotUrl || 'asuktech.net'}`, guideX + 16, curY + 56);
  ctx.fillText(`3. Enter voucher code "${passData.voucherCode || 'PIN'}" as Username & Password`, guideX + 16, curY + 72);
  ctx.restore();

  // 6. SIMULATED BARCODE
  curY += guideH + 24;
  const barcodeW = 260;
  const barcodeH = 34;
  const barcodeX = (w - barcodeW) / 2;
  drawBarcode(ctx, barcodeX, curY, barcodeW, barcodeH, passData.voucherCode);

  ctx.fillStyle = '#71717A';
  ctx.font = '500 10.5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`* ${passData.voucherCode || 'ASUK-WIFI'} *`, w / 2, curY + barcodeH + 16);

  // 7. FOOTER NOTE
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Thank you for connecting with Asuk Tech Hotspots • Support: asuktech.net', w / 2, cardH + margin - 16);

  return canvas;
}

/**
 * ─────────────────────────────────────────────────────────────
 * TRANSACTION RECEIPT CANVAS GENERATOR
 * Renders a high-DPI Receipt for Deposits or Voucher Purchases
 * ─────────────────────────────────────────────────────────────
 */
export function generateTransactionReceiptCanvas(txData = {}) {
  const scale = 2;
  const canvasWidth = 540 * scale;
  const canvasHeight = 780 * scale;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const w = 540;
  const h = 780;
  const margin = 20;
  const cardW = w - margin * 2;
  const cardH = h - margin * 2;

  // Background
  ctx.fillStyle = '#F4F4F7';
  ctx.fillRect(0, 0, w, h);

  // Receipt Card
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, margin, margin, cardW, cardH, 20);
  ctx.fill();
  ctx.restore();

  // 1. TOP BRAND HEADER
  const isDeposit = txData.type === 'wallet_topup' || txData.type === 'deposit';
  const headerH = 160;

  ctx.save();
  const grad = ctx.createLinearGradient(margin, margin, margin + cardW, margin + headerH);
  if (isDeposit) {
    grad.addColorStop(0, '#064E3B');
    grad.addColorStop(1, '#065F46');
  } else {
    grad.addColorStop(0, '#1E1B4B');
    grad.addColorStop(1, '#312E81');
  }
  ctx.fillStyle = grad;
  roundRect(ctx, margin, margin, cardW, headerH, { tl: 20, tr: 20, br: 0, bl: 0 });
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(txData.brandName || 'ASUK TECH WI-FI', w / 2, margin + 40);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText(isDeposit ? 'WALLET DEPOSIT RECEIPT' : 'VOUCHER PURCHASE RECEIPT', w / 2, margin + 62);

  // Amount Banner
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const prefix = isDeposit ? '+' : '-';
  ctx.fillText(`${prefix}${formatCurrency(txData.amount)}`, w / 2, margin + 108);

  // Status Badge
  const statusW = 120;
  const statusH = 22;
  const statusX = w / 2 - statusW / 2;
  const statusY = margin + 124;
  ctx.fillStyle = '#10B981';
  roundRect(ctx, statusX, statusY, statusW, statusH, 11);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('✓ SUCCESSFUL', w / 2, statusY + 15);
  ctx.restore();

  // 2. PERFORATION DIVIDER
  const perfY = margin + headerH;
  ctx.save();
  ctx.fillStyle = '#F4F4F7';
  ctx.beginPath();
  ctx.arc(margin, perfY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(margin + cardW, perfY, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(margin + 18, perfY);
  ctx.lineTo(margin + cardW - 18, perfY);
  ctx.stroke();
  ctx.restore();

  // 3. TRANSACTION DETAILS
  let curY = perfY + 40;
  const leftX = margin + 32;
  const rightX = margin + cardW - 32;
  const rowH = 30;

  const rows = [
    { label: 'Transaction Type', value: isDeposit ? 'Wallet Deposit' : 'Wi-Fi Pass Purchase' },
    { label: 'Date & Time', value: formatReceiptDate(txData.createdAt) },
    { label: 'Payment Gateway Ref', value: txData.flwRef ? `${txData.flwRef.substring(0, 18)}…` : 'Internal Wallet' },
    { label: 'Payment Method', value: txData.paymentMethod || (isDeposit ? 'Card / Bank Transfer' : 'Wallet Balance') },
    { label: 'Transaction Status', value: 'Completed' },
  ];

  if (!isDeposit && txData.metadata?.plan_name) {
    rows.unshift({ label: 'Wi-Fi Plan', value: txData.metadata.plan_name });
  }
  if (!isDeposit && txData.metadata?.voucher_code) {
    rows.unshift({ label: 'Voucher PIN', value: txData.metadata.voucher_code });
  }
  if (txData.userEmail) {
    rows.push({ label: 'Account Holder', value: txData.userEmail });
  }

  rows.forEach((row, idx) => {
    if (idx % 2 === 0) {
      ctx.fillStyle = '#FAFAFC';
      roundRect(ctx, margin + 20, curY - 18, cardW - 40, rowH, 6);
      ctx.fill();
    }

    ctx.fillStyle = '#64748B';
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, leftX, curY);

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(row.value, rightX, curY);

    curY += rowH + 6;
  });

  // 4. BARCODE & FOOTER
  curY += 24;
  const barcodeW = 240;
  const barcodeH = 34;
  const barcodeX = (w - barcodeW) / 2;
  drawBarcode(ctx, barcodeX, curY, barcodeW, barcodeH, txData.flwRef || txData.id || 'ASUK-TX');

  ctx.fillStyle = '#71717A';
  ctx.font = '500 10.5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`* REF: ${txData.flwRef ? txData.flwRef.substring(0, 16) : 'TX-' + (txData.id || '0000')} *`, w / 2, curY + barcodeH + 16);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Official Electronic Receipt • Asuk Tech Automated Billing System', w / 2, cardH + margin - 16);

  return canvas;
}

/**
 * ─────────────────────────────────────────────────────────────
 * STATEMENT CANVAS GENERATOR (Summary Ledger Image)
 * ─────────────────────────────────────────────────────────────
 */
export function generateStatementCanvas(statementData = {}) {
  const scale = 2;
  const canvasWidth = 600 * scale;
  const transactions = statementData.transactions || [];
  const rowsToDisplay = transactions.slice(0, 10); // Show up to top 10 in image summary

  const baseH = 500;
  const rowH = 36;
  const calculatedH = baseH + rowsToDisplay.length * rowH;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = calculatedH * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const w = 600;
  const h = calculatedH;
  const margin = 20;
  const cardW = w - margin * 2;
  const cardH = h - margin * 2;

  ctx.fillStyle = '#F4F4F7';
  ctx.fillRect(0, 0, w, h);

  // Card
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, margin, margin, cardW, cardH, 20);
  ctx.fill();
  ctx.restore();

  // Header Banner
  const headerH = 120;
  ctx.save();
  const grad = ctx.createLinearGradient(margin, margin, margin + cardW, margin + headerH);
  grad.addColorStop(0, '#0F172A');
  grad.addColorStop(1, '#1E293B');
  ctx.fillStyle = grad;
  roundRect(ctx, margin, margin, cardW, headerH, { tl: 20, tr: 20, br: 0, bl: 0 });
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statementData.brandName || 'ASUK TECH WI-FI', w / 2, margin + 40);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('ACCOUNT TRANSACTION STATEMENT', w / 2, margin + 62);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 11px monospace';
  ctx.fillText(`Generated: ${formatReceiptDate()}`, w / 2, margin + 90);
  ctx.restore();

  // Financial Summary Cards
  let curY = margin + headerH + 24;
  const boxW = (cardW - 48 - 16) / 3;
  const boxH = 68;

  // Box 1: Total Inflow
  ctx.fillStyle = '#F0FDF4';
  roundRect(ctx, margin + 24, curY, boxW, boxH, 12);
  ctx.fill();
  ctx.fillStyle = '#166534';
  ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL DEPOSITS', margin + 36, curY + 22);
  ctx.fillStyle = '#15803D';
  ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`+${formatCurrency(statementData.totalDeposits || 0)}`, margin + 36, curY + 48);

  // Box 2: Total Spent
  ctx.fillStyle = '#FAF5FF';
  roundRect(ctx, margin + 24 + boxW + 8, curY, boxW, boxH, 12);
  ctx.fill();
  ctx.fillStyle = '#581C87';
  ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('PASS PURCHASES', margin + 24 + boxW + 20, curY + 22);
  ctx.fillStyle = '#6B21A8';
  ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`-${formatCurrency(statementData.totalSpent || 0)}`, margin + 24 + boxW + 20, curY + 48);

  // Box 3: Current Balance
  ctx.fillStyle = '#F8FAFC';
  roundRect(ctx, margin + 24 + (boxW + 8) * 2, curY, boxW, boxH, 12);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('WALLET BALANCE', margin + 24 + (boxW + 8) * 2 + 12, curY + 22);
  ctx.fillStyle = '#0F172A';
  ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(formatCurrency(statementData.walletBalance || 0), margin + 24 + (boxW + 8) * 2 + 12, curY + 48);

  // Ledger Table Header
  curY += boxH + 28;
  ctx.fillStyle = '#0F172A';
  ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Transaction History (${transactions.length} Total)`, margin + 24, curY);

  curY += 14;
  ctx.fillStyle = '#94A3B8';
  ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('DATE / TIME', margin + 24, curY + 12);
  ctx.fillText('DESCRIPTION', margin + 150, curY + 12);
  ctx.textAlign = 'right';
  ctx.fillText('AMOUNT', margin + cardW - 24, curY + 12);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin + 24, curY + 20);
  ctx.lineTo(margin + cardW - 24, curY + 20);
  ctx.stroke();

  curY += 26;

  rowsToDisplay.forEach((tx, idx) => {
    const isDep = tx.type === 'wallet_topup' || tx.type === 'deposit';

    if (idx % 2 === 0) {
      ctx.fillStyle = '#FAFAFC';
      roundRect(ctx, margin + 20, curY - 14, cardW - 40, rowH - 4, 6);
      ctx.fill();
    }

    ctx.fillStyle = '#64748B';
    ctx.font = '500 11.5px monospace';
    ctx.textAlign = 'left';
    const dStr = tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
    ctx.fillText(dStr, margin + 24, curY + 6);

    ctx.fillStyle = '#1E293B';
    ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const desc = isDep
      ? 'Wallet Deposit'
      : (tx.metadata?.plan_name || 'Wi-Fi Pass');
    ctx.fillText(desc, margin + 150, curY + 6);

    ctx.textAlign = 'right';
    ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isDep ? '#16A34A' : '#0F172A';
    ctx.fillText(`${isDep ? '+' : '-'}${formatCurrency(tx.amount)}`, margin + cardW - 24, curY + 6);

    curY += rowH;
  });

  if (transactions.length > rowsToDisplay.length) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'italic 500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`+ ${transactions.length - rowsToDisplay.length} more transactions in full PDF report`, w / 2, curY + 16);
    curY += 26;
  }

  // Footer
  ctx.fillStyle = '#A1A1AA';
  ctx.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Asuk Tech Wi-Fi Hotspot Network • Certified Statement', w / 2, cardH + margin - 14);

  return canvas;
}

/**
 * ─────────────────────────────────────────────────────────────
 * DOWNLOAD UTILITIES
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Download an HTMLCanvasElement directly as a PNG image
 */
export function downloadCanvasAsImage(canvas, filename = 'asuk-receipt.png') {
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Wrap canvas inside jsPDF for a pixel-perfect PDF download
 */
export async function downloadCanvasAsPdf(canvas, filename = 'asuk-receipt.pdf', title = 'Receipt') {
  const { jsPDF } = await import('jspdf');

  const imgData = canvas.toDataURL('image/png', 1.0);
  const imgWidth = 140; // mm width for a neat receipt size
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: [imgWidth + 10, imgHeight + 10],
  });

  doc.addImage(imgData, 'PNG', 5, 5, imgWidth, imgHeight);
  doc.save(filename);
}

/**
 * Generate a comprehensive multi-page PDF statement using jsPDF + jsPDF-autotable
 */
export async function downloadStatementPdf(statementData = {}, filename = 'asuk-statement.pdf') {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF();
  const brand = statementData.brandName || 'Asuk Tech Wi-Fi';
  const transactions = statementData.transactions || [];

  // Header Banner
  doc.setFillColor(15, 23, 42); // #0F172A
  doc.rect(0, 0, 210, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(brand.toUpperCase(), 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // #94A3B8
  doc.text('ACCOUNT TRANSACTION STATEMENT & ACTIVITY REPORT', 14, 28);
  doc.text(`Generated on: ${formatReceiptDate()}`, 14, 35);

  // User details & Balance (Right side)
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  if (statementData.userEmail) {
    doc.text(`Account: ${statementData.userEmail}`, 196, 20, { align: 'right' });
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Balance: ${formatCurrency(statementData.walletBalance || 0)}`, 196, 30, { align: 'right' });

  // Summary Metrics Section
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary Overview', 14, 52);

  // Draw 3 metric boxes
  const boxWidth = 58;
  const boxHeight = 22;

  // Box 1: Deposits
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(14, 56, boxWidth, boxHeight, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setTextColor(22, 101, 52);
  doc.text('TOTAL DEPOSITS', 18, 62);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`+${formatCurrency(statementData.totalDeposits || 0)}`, 18, 72);

  // Box 2: Voucher Purchases
  doc.setFillColor(250, 245, 255);
  doc.roundedRect(76, 56, boxWidth, boxHeight, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setTextColor(88, 28, 135);
  doc.text('VOUCHER PURCHASES', 80, 62);
  doc.setFontSize(12);
  doc.text(`-${formatCurrency(statementData.totalSpent || 0)}`, 80, 72);

  // Box 3: Total Transactions
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(138, 56, boxWidth, boxHeight, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('TOTAL TRANSACTIONS', 142, 62);
  doc.setFontSize(12);
  doc.text(`${transactions.length} Records`, 142, 72);

  // Table using jspdf-autotable
  const tableData = transactions.map((tx) => {
    const isDep = tx.type === 'wallet_topup' || tx.type === 'deposit';
    const dateStr = formatReceiptDate(tx.created_at);
    const desc = isDep
      ? 'Wallet Deposit'
      : (tx.metadata?.plan_name ? `Pass: ${tx.metadata.plan_name}` : 'Wi-Fi Pass');
    const pin = tx.metadata?.voucher_code ? ` (PIN: ${tx.metadata.voucher_code})` : '';
    const ref = tx.flw_ref ? tx.flw_ref.substring(0, 16) : `TX-${tx.id ? String(tx.id).substring(0, 8) : '-'}`;
    const amountStr = `${isDep ? '+' : '-'}${formatCurrency(tx.amount)}`;

    return [
      dateStr,
      desc + pin,
      tx.payment_method || (isDep ? 'Card/Transfer' : 'Wallet'),
      ref,
      amountStr,
      'Successful',
    ];
  });

  doc.autoTable({
    startY: 86,
    head: [['Date & Time', 'Description', 'Method', 'Reference', 'Amount', 'Status']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      4: { fontStyle: 'bold', halign: 'right' },
      5: { halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
    foot: [
      ['', '', '', 'Total Volume:', formatCurrency(statementData.totalDeposits || 0), '']
    ],
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
  });

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${i} of ${pageCount} • Asuk Tech Wi-Fi Hotspot Network • support@asuktech.net`,
      105,
      290,
      { align: 'center' }
    );
  }

  doc.save(filename);
}

/**
 * Native Print Utility: opens a print window and prints high-res canvas
 */
export function printReceipt(canvas) {
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const printWindow = window.open('', '_blank', 'width=600,height=800');
  if (!printWindow) {
    alert('Please allow pop-ups to print receipt');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Receipt - Asuk Tech</title>
        <style>
          @page {
            size: auto;
            margin: 8mm;
          }
          body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #fff;
          }
          img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" onload="window.focus(); window.print(); window.close();" />
      </body>
    </html>
  `);
  printWindow.document.close();
}
