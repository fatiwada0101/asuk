'use client';

export default function VoucherModal({ isOpen, onClose, voucherCode, planName, routerProvisioned, warning }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(voucherCode);
      const btn = document.getElementById('copy-btn');
      if (btn) {
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy Code'; }, 2000);
      }
    } catch {
      const el = document.createElement('textarea');
      el.value = voucherCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`}>
      <div className="modal">
        <div className="modal-icon">{routerProvisioned ? '✅' : '⚠️'}</div>
        <h2>{routerProvisioned ? 'Voucher Created!' : 'Voucher Generated'}</h2>
        <p>
          Your <strong>{planName}</strong> voucher code
          {routerProvisioned
            ? ' has been provisioned on the router and is ready to use.'
            : ' was generated, but could not be provisioned on the router.'}
        </p>

        {warning && (
          <div className="modal-warning">
            <span>⚠️</span> {warning}
          </div>
        )}

        <div className="voucher-code-box">
          <div className="voucher-code">{voucherCode || '...'}</div>
        </div>

        <div className="modal-status">
          <div className="modal-status-row">
            <span>Router Status</span>
            <span className={routerProvisioned ? 'status-ok' : 'status-warn'}>
              {routerProvisioned ? '● Provisioned' : '● Pending'}
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button id="copy-btn" className="btn btn-primary" onClick={handleCopy}>
            📋 Copy Code
          </button>
          <button className="btn btn-dark" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
