'use client';

/**
 * Voucher Card Generator — Canvas-based rendering engine for printable voucher cards.
 * Supports PDF export, image export, and native print dialog.
 */

// ═══════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════

const CARD_W = 360;
const CARD_H = 220;
const DPR = 2; // Retina

const STYLES = {
  minimal: {
    bg: '#ffffff',
    headerBg: '#1a1a2e',
    headerColor: '#ffffff',
    accentColor: '#7257FF',
    codeBg: '#f0f0f5',
    codeColor: '#1a1a2e',
    textColor: '#333333',
    subColor: '#888888',
    borderColor: '#e0e0e0',
  },
  branded: {
    bg: '#ffffff',
    headerBg: 'linear-gradient(135deg, #7257FF, #5b3cc4)',
    headerColor: '#ffffff',
    accentColor: '#7257FF',
    codeBg: '#f3f0ff',
    codeColor: '#5b3cc4',
    textColor: '#333333',
    subColor: '#888888',
    borderColor: '#d4ccff',
  },
  premium: {
    bg: '#0f0f23',
    headerBg: 'linear-gradient(135deg, #FFD700, #FFA500)',
    headerColor: '#0f0f23',
    accentColor: '#FFD700',
    codeBg: '#1a1a3e',
    codeColor: '#FFD700',
    textColor: '#e0e0e0',
    subColor: '#888899',
    borderColor: '#2a2a4e',
  },
};

function formatPdfCurrency(amount) {
  const num = Number(amount) || 0;
  return 'N' + num.toLocaleString('en-NG');
}

// ═══════════════════════════════════════════════════════════
// SINGLE CARD RENDERER
// ═══════════════════════════════════════════════════════════

function drawVoucherCard(ctx, x, y, voucher, options = {}) {
  const {
    style = 'branded',
    brandName = 'Asuk Tech Wi-Fi',
    ssid = 'Asuk Tech Wi-Fi',
    showSsid = true,
    showPrice = true,
    showExpiry = true,
    showDataLimit = true,
    showSerial = true,
  } = options;

  const s = STYLES[style] || STYLES.branded;
  const w = CARD_W;
  const h = CARD_H;

  // Card background
  ctx.save();
  ctx.beginPath();
  const r = 12;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fillStyle = s.bg;
  ctx.fill();
  ctx.strokeStyle = s.borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();

  // Header band
  const headerH = 52;
  if (s.headerBg.includes('gradient')) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + headerH);
    grad.addColorStop(0, s.headerBg.includes('#7257FF') ? '#7257FF' : '#FFD700');
    grad.addColorStop(1, s.headerBg.includes('#5b3cc4') ? '#5b3cc4' : '#FFA500');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = s.headerBg;
  }
  ctx.fillRect(x, y, w, headerH);

  // Brand name
  ctx.fillStyle = s.headerColor;
  ctx.font = 'bold 16px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(brandName, x + 16, y + 22);

  // Subtitle with Serial Number
  ctx.font = '12px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  const serialText = (showSerial && voucher.serial_number) 
    ? `Wi-Fi Voucher • #${String(voucher.serial_number).padStart(3, '0')}`
    : 'Wi-Fi Voucher';
  ctx.fillText(serialText, x + 16, y + 40);

  // Plan name and Data Limit on the right
  if (voucher.expiry || voucher.plan_name) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px "Inter", "Segoe UI", system-ui, sans-serif';
    const labelText = voucher.plan_name || voucher.expiry || '';
    ctx.fillText(labelText.length > 18 ? labelText.substring(0, 16) + '…' : labelText, x + w - 16, y + 22);

    let metaRight = '';
    if (showExpiry && voucher.expiry) metaRight = voucher.expiry;
    if (showDataLimit && voucher.data_limit && voucher.data_limit.toLowerCase() !== 'unlimited') {
      metaRight = metaRight ? `${metaRight} • ${voucher.data_limit}` : voucher.data_limit;
    }
    if (metaRight) {
      ctx.font = '11px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillText(metaRight, x + w - 16, y + 38);
    }
  }

  // Perforation line
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = s.borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + headerH);
  ctx.lineTo(x + w - 12, y + headerH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Code section
  const codeY = y + headerH + 16;
  const codeBoxW = w - 48;
  const codeBoxH = 44;
  const codeBoxX = x + 24;

  // Code background
  ctx.fillStyle = s.codeBg;
  const cr = 8;
  ctx.beginPath();
  ctx.moveTo(codeBoxX + cr, codeY);
  ctx.lineTo(codeBoxX + codeBoxW - cr, codeY);
  ctx.arcTo(codeBoxX + codeBoxW, codeY, codeBoxX + codeBoxW, codeY + cr, cr);
  ctx.lineTo(codeBoxX + codeBoxW, codeY + codeBoxH - cr);
  ctx.arcTo(codeBoxX + codeBoxW, codeY + codeBoxH, codeBoxX + codeBoxW - cr, codeY + codeBoxH, cr);
  ctx.lineTo(codeBoxX + cr, codeY + codeBoxH);
  ctx.arcTo(codeBoxX, codeY + codeBoxH, codeBoxX, codeY + codeBoxH - cr, cr);
  ctx.lineTo(codeBoxX, codeY + cr);
  ctx.arcTo(codeBoxX, codeY, codeBoxX + cr, codeY, cr);
  ctx.closePath();
  ctx.fill();

  // Dashed border on code box
  ctx.setLineDash([6, 3]);
  ctx.strokeStyle = s.accentColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Code text
  ctx.fillStyle = s.codeColor;
  const code = voucher.code || voucher.voucher_code || 'WIFI-XXXXXX';
  const fontSize = code.length > 14 ? 18 : code.length > 10 ? 20 : 24;
  ctx.font = `bold ${fontSize}px "Courier New", "Consolas", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(code, codeBoxX + codeBoxW / 2, codeY + codeBoxH / 2 + fontSize / 3);

  // Bottom section
  const bottomY = codeY + codeBoxH + 14;
  ctx.font = '10px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';

  if (showSsid && ssid) {
    ctx.fillStyle = s.subColor;
    ctx.fillText('Network:', x + 24, bottomY);
    ctx.fillStyle = s.textColor;
    ctx.font = 'bold 10px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(ssid.length > 20 ? ssid.substring(0, 18) + '…' : ssid, x + 74, bottomY);
  }

  if (showPrice && voucher.price !== undefined) {
    ctx.font = 'bold 13px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = s.accentColor;
    ctx.fillText(formatPdfCurrency(voucher.price), x + w - 24, bottomY);
  }

  // Instructions footer
  const footerY = bottomY + 16;
  ctx.font = '9px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = s.subColor;
  ctx.textAlign = 'center';
  const footerText = voucher.batch_id
    ? `Connect to Wi-Fi → Enter code to login • [${voucher.batch_id}]`
    : 'Connect to Wi-Fi → Open browser → Enter code above → Enjoy!';
  ctx.fillText(footerText, x + w / 2, footerY);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// SHEET RENDERER (Multiple cards on a page)
// ═══════════════════════════════════════════════════════════

/**
 * Render a full sheet of voucher cards as a canvas.
 * @param {Array} vouchers - Array of voucher objects with { code, expiry, plan_name, price }
 * @param {object} options - { style, brandName, ssid, showSsid, showPrice, showExpiry, cols, rows }
 * @returns {HTMLCanvasElement}
 */
export function generateVoucherSheet(vouchers, options = {}) {
  const { cols = 2, rows = 4 } = options;
  const padding = 20;
  const gap = 16;

  const sheetW = cols * CARD_W + (cols - 1) * gap + padding * 2;
  const sheetH = rows * CARD_H + (rows - 1) * gap + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = sheetW * DPR;
  canvas.height = sheetH * DPR;
  canvas.style.width = sheetW + 'px';
  canvas.style.height = sheetH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sheetW, sheetH);

  const perPage = cols * rows;
  for (let i = 0; i < Math.min(vouchers.length, perPage); i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padding + col * (CARD_W + gap);
    const y = padding + row * (CARD_H + gap);
    drawVoucherCard(ctx, x, y, vouchers[i], options);
  }

  return canvas;
}

// ═══════════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════════

/**
 * Generate a multi-page PDF with voucher cards.
 * @param {Array} vouchers - All vouchers to render
 * @param {object} options - Card rendering options + { cols, rows }
 */
export async function downloadVoucherSheetPdf(vouchers, options = {}) {
  const { cols = 2, rows = 4 } = options;
  const perPage = cols * rows;

  const jspdfModule = await import('jspdf');
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;

  const padding = 20;
  const gap = 16;
  const sheetW = cols * CARD_W + (cols - 1) * gap + padding * 2;
  const sheetH = rows * CARD_H + (rows - 1) * gap + padding * 2;

  // A4 orientation
  const orientation = sheetW > sheetH ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'px', format: [sheetW, sheetH] });

  const totalPages = Math.ceil(vouchers.length / perPage);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) doc.addPage([sheetW, sheetH], orientation);

    const pageVouchers = vouchers.slice(page * perPage, (page + 1) * perPage);
    const canvas = generateVoucherSheet(pageVouchers, { ...options, cols, rows });
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0, 0, sheetW, sheetH);
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  doc.save(`voucher-cards-${timestamp}.pdf`);
}

// ═══════════════════════════════════════════════════════════
// IMAGE EXPORT
// ═══════════════════════════════════════════════════════════

/**
 * Download all vouchers as a single PNG image sheet.
 */
export function downloadVoucherSheetImage(vouchers, options = {}) {
  const canvas = generateVoucherSheet(vouchers, options);
  const dataUrl = canvas.toDataURL('image/png');

  try {
    const blob = dataURLtoBlob(dataUrl);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voucher-cards-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `voucher-cards-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }
}

function dataURLtoBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const b64 = atob(parts[1]);
  const u8arr = new Uint8Array(b64.length);
  for (let i = 0; i < b64.length; i++) u8arr[i] = b64.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}

// ═══════════════════════════════════════════════════════════
// PRINT
// ═══════════════════════════════════════════════════════════

/**
 * Print voucher cards using a hidden iframe with native print dialog.
 */
export async function printVoucherCards(vouchers, options = {}) {
  const { cols = 2, rows = 4 } = options;
  const perPage = cols * rows;
  const totalPages = Math.ceil(vouchers.length / perPage);

  let imagesHtml = '';
  for (let page = 0; page < totalPages; page++) {
    const pageVouchers = vouchers.slice(page * perPage, (page + 1) * perPage);
    const canvas = generateVoucherSheet(pageVouchers, { ...options, cols, rows });
    const imgData = canvas.toDataURL('image/png');
    imagesHtml += `<img src="${imgData}" style="width:100%;max-width:800px;margin:0 auto;display:block;${page > 0 ? 'page-break-before:always;' : ''}" />`;
  }

  const printHtml = `<!DOCTYPE html><html><head><title>Voucher Cards</title>
<style>
  @page { margin: 10mm; }
  body { margin: 0; padding: 0; background: #fff; display: flex; flex-direction: column; align-items: center; }
  img { margin-bottom: 8px; }
  @media print { body { margin: 0; } img { margin: 0; } }
</style></head><body>${imagesHtml}</body></html>`;

  // Use hidden iframe approach
  let iframe = document.getElementById('voucher-print-frame');
  if (iframe) iframe.remove();

  iframe = document.createElement('iframe');
  iframe.id = 'voucher-print-frame';
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:700px;border:none;';
  document.body.appendChild(iframe);

  iframe.contentDocument.open();
  iframe.contentDocument.write(printHtml);
  iframe.contentDocument.close();

  await new Promise(resolve => {
    iframe.onload = resolve;
    setTimeout(resolve, 600);
  });

  try {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  } catch {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(printHtml);
      win.document.close();
      win.focus();
      win.print();
    }
  }
}
