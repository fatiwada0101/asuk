/**
 * Hotspot Login Page Templates — 5 Beautiful Responsive Designs
 * Each template produces a standalone HTML string with embedded CSS,
 * compatible with MikroTik hotspot template variables.
 *
 * MikroTik variables used:
 *   $(link-login-only)    — form action URL
 *   $(link-orig)          — original destination
 *   $(link-orig-esc)      — URL-encoded original destination
 *   $(link-login-only-esc)— URL-encoded login URL
 *   $(mac)                — client MAC
 *   $(ip)                 — client IP
 *   $(error)              — error message (empty if none)
 *   $(username)           — last entered username
 *   $(if error)…$(endif)  — conditional error block
 */

// ─── TEMPLATE REGISTRY ──────────────────────────────────────
export const TEMPLATE_REGISTRY = [
  {
    id: 'midnight-glass',
    name: 'Midnight Glass',
    emoji: '🌙',
    description: 'Dark glassmorphism with frosted card, purple glow orbs, and gradient accents',
    thumbnailCss: 'background: linear-gradient(135deg, #0f0a1e 0%, #1a1035 50%, #2d1b69 100%);',
    accentColor: '#7c3aed',
  },
  {
    id: 'sunrise-gradient',
    name: 'Sunrise Gradient',
    emoji: '🌅',
    description: 'Warm orange-to-pink gradient, white clean card, soft shadows',
    thumbnailCss: 'background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%);',
    accentColor: '#f97316',
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    emoji: '🌊',
    description: 'Cool teal-blue waves, rounded card, aqua gradient accents',
    thumbnailCss: 'background: linear-gradient(135deg, #0d9488 0%, #0ea5e9 50%, #6366f1 100%);',
    accentColor: '#0ea5e9',
  },
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    emoji: '⚡',
    description: 'Electric dark background, neon green-cyan borders, cyberpunk aesthetic',
    thumbnailCss: 'background: linear-gradient(135deg, #0a0a0a 0%, #0d1117 50%, #1a1a2e 100%);',
    accentColor: '#00ff88',
  },
  {
    id: 'clean-minimal',
    name: 'Clean Minimal',
    emoji: '✨',
    description: 'Ultra-clean white card, soft gradient, Apple-inspired simplicity',
    thumbnailCss: 'background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);',
    accentColor: '#3b82f6',
  },
];

// ─── SHARED HELPERS ──────────────────────────────────────────

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildLogoHtml(logoUrl, size = 56) {
  if (!logoUrl) return '';
  return `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:12px;margin:0 auto 12px;display:block" onerror="this.style.display='none'" />`;
}

function buildFooterHtml(contactFooter, color = '#888') {
  if (!contactFooter) return '';
  return `<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(128,128,128,0.15);text-align:center;font-size:11px;color:${color};line-height:1.6">${escapeHtml(contactFooter)}</div>`;
}

export function getDefaultBuyUrl() {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/packages`;
  }
  return 'https://www.asuk.tech/packages';
}

function buildBuySection(buyUrl, accentColor, textColor, bgColor, borderColor) {
  const cleanUrl = buyUrl || getDefaultBuyUrl();
  const sep = cleanUrl.includes('?') ? '&' : '?';
  return `<div style="margin-top:22px;padding-top:16px;border-top:1px solid ${borderColor}">
<div style="font-size:12px;color:${textColor};margin-bottom:10px;text-align:center">Don't have a voucher?</div>
<a href="${cleanUrl}${sep}mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only-esc)&link-orig=$(link-orig-esc)" style="display:flex;align-items:center;justify-content:center;gap:6px;color:${accentColor};font-size:13px;font-weight:700;text-decoration:none;padding:11px 20px;background:${bgColor};border:1px solid ${borderColor};border-radius:12px;transition:opacity .2s">&#128722; Buy a Data Plan &rarr;</a>
</div>`;
}


function buildScript(buyUrl) {
  // Derive the app base URL from the buyUrl (strip /packages and any trailing path)
  const appBaseUrl = (buyUrl || getDefaultBuyUrl()).replace(/\/packages.*$/, '');

  return `<script>
var c=document.getElementById('code'),p=document.getElementById('pass');
var loginForm=document.forms['login'];
var btn=loginForm?loginForm.querySelector('button[type="submit"]'):null;
var errBox=document.querySelector('.err');

c.addEventListener('input',function(){p.value=c.value.trim()});

// Show error message in the template's error box
function showError(msg){
  if(!errBox){
    errBox=document.createElement('div');
    errBox.className='err';
    var formEl=loginForm||document.querySelector('form');
    if(formEl)formEl.parentNode.insertBefore(errBox,formEl);
  }
  errBox.innerHTML='&#9888; '+msg;
  errBox.style.display='block';
}
function hideError(){if(errBox)errBox.style.display='none'}

// Intercept form submission to validate via app API first
// The validate endpoint auto-provisions missing voucher users on MikroTik,
// preventing the 501 "Not Implemented" error from the router.
if(loginForm){
  loginForm.addEventListener('submit',function(e){
    var code=c.value.trim();
    if(!code)return;

    e.preventDefault();
    p.value=code;
    hideError();

    if(btn){btn.disabled=true;btn.textContent='Validating...';}

    var apiUrl='${appBaseUrl}/api/vouchers/validate?code='+encodeURIComponent(code);

    // Use a timeout to detect network failures (walled garden, etc)
    var controller=typeof AbortController!=='undefined'?new AbortController():null;
    var timeoutId=setTimeout(function(){
      if(controller)controller.abort();
    },8000);

    fetch(apiUrl,{signal:controller?controller.signal:undefined})
    .then(function(res){
      clearTimeout(timeoutId);
      return res.json().then(function(data){return{status:res.status,data:data}});
    })
    .then(function(result){
      var d=result.data;
      if(d.valid){
        // Voucher is valid and provisioned on MikroTik — submit form to router
        if(btn)btn.textContent='Connecting...';
        loginForm.submit();
      }else{
        // Show specific error message
        var msg=d.error||'Invalid or expired voucher code.';
        if(d.is_expired)msg=d.error||'This voucher has expired. Please purchase a new plan.';
        showError(msg);
        if(btn){btn.disabled=false;btn.textContent='\\u26A1 Connect to Internet';}
      }
    })
    .catch(function(err){
      clearTimeout(timeoutId);
      // API unreachable (walled garden not configured, network issue, etc)
      // Fall back to direct MikroTik submission as before
      console.warn('Voucher API unreachable, falling back to direct router login:',err.message||err);
      if(btn)btn.textContent='Connecting...';
      loginForm.submit();
    });
  });
}

// Pre-fill code if present in URL query params or template variable, but do NOT auto-submit.
// The user must click "Connect" to start their session.
try {
  var urlParams = new URLSearchParams(window.location.search);
  var qCode = urlParams.get('code') || urlParams.get('username');
  if (qCode && !c.value) {
    c.value = qCode;
  }
} catch(e) {}
if (c && c.value) {
  p.value = c.value.trim();
}
</script>`;
}

function buildMeta(title) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${escapeHtml(title)}</title>`;
}


// ═══════════════════════════════════════════════════════════════
// TEMPLATE 1: MIDNIGHT GLASS
// ═══════════════════════════════════════════════════════════════
export function generateMidnightGlassTemplate(opts = {}) {
  const wifiSsid = opts.wifiSsid || 'Wi-Fi';
  const buyUrl = opts.buyUrl || getDefaultBuyUrl();
  const businessName = opts.businessName || wifiSsid;
  const logoUrl = opts.logoUrl || '';
  const contactFooter = opts.contactFooter || '';
  const accent = opts.primaryColor || '#7c3aed';

  return `${buildMeta(businessName)}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f0a1e;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden;position:relative}
body::before{content:'';position:absolute;width:300px;height:300px;background:radial-gradient(circle,${accent}44 0%,transparent 70%);top:-80px;right:-60px;border-radius:50%;animation:float 8s ease-in-out infinite}
body::after{content:'';position:absolute;width:200px;height:200px;background:radial-gradient(circle,#ec489944 0%,transparent 70%);bottom:-40px;left:-40px;border-radius:50%;animation:float 6s ease-in-out infinite reverse}
@keyframes float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-30px) scale(1.1)}}
.card{width:100%;max-width:400px;background:rgba(255,255,255,0.06);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:36px 28px;box-shadow:0 32px 64px rgba(0,0,0,0.5);position:relative;z-index:1}
.icon-wrap{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,${accent},${accent}88);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;box-shadow:0 8px 32px ${accent}55}
h1{font-size:22px;font-weight:800;text-align:center;margin-bottom:4px;color:#fff}
.sub{font-size:13px;color:#a1a1aa;text-align:center;margin-bottom:24px}
.err{background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#fca5a5;padding:10px 14px;border-radius:12px;font-size:13px;margin-bottom:18px;text-align:center}
.lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a1a1aa;margin-bottom:8px}
input[type="text"]{width:100%;padding:14px 16px;font-size:18px;font-weight:800;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.12);border-radius:14px;color:#fff;text-align:center;letter-spacing:2.5px;outline:none;font-family:'Courier New',monospace;text-transform:uppercase;transition:border-color .25s,box-shadow .25s}
input[type="text"]:focus{border-color:${accent};box-shadow:0 0 0 3px ${accent}33}
.btn{width:100%;padding:15px;margin-top:18px;font-size:15px;font-weight:800;background:linear-gradient(135deg,${accent},${accent}dd);color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 24px ${accent}44;transition:transform .15s,box-shadow .2s;letter-spacing:.3px}
.btn:active{transform:scale(0.97)}
.info{margin-top:16px;font-size:10px;color:#52525b;text-align:center}
</style>
</head>
<body>
<div class="card">
${buildLogoHtml(logoUrl)}
<div class="icon-wrap">&#9889;</div>
<h1>${escapeHtml(businessName)}</h1>
<p class="sub">Enter your voucher code to connect</p>
$(if error)<div class="err">&#9888; $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" onsubmit="var c=document.getElementById('code'),p=document.getElementById('pass');if(c&&p)p.value=c.value.trim()">
<input type="hidden" name="dst" value="$(link-orig)" />
<input type="hidden" name="popup" value="true" />
<label class="lbl">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="XXXX-XXXX" autofocus required autocomplete="off" />
<input type="hidden" name="password" id="pass" value="$(username)" />
<button type="submit" class="btn">&#9889; Connect to Internet</button>
</form>
${buildBuySection(buyUrl, '#c4b5fd', '#71717a', `${accent}15`, `${accent}33`)}
<div class="info">MAC: $(mac) &bull; IP: $(ip)</div>
${buildFooterHtml(contactFooter, '#71717a')}
</div>
${buildScript(buyUrl)}
</body>
</html>`;
}


// ═══════════════════════════════════════════════════════════════
// TEMPLATE 2: SUNRISE GRADIENT
// ═══════════════════════════════════════════════════════════════
export function generateSunriseGradientTemplate(opts = {}) {
  const wifiSsid = opts.wifiSsid || 'Wi-Fi';
  const buyUrl = opts.buyUrl || getDefaultBuyUrl();
  const businessName = opts.businessName || wifiSsid;
  const logoUrl = opts.logoUrl || '';
  const contactFooter = opts.contactFooter || '';
  const accent = opts.primaryColor || '#f97316';

  return `${buildMeta(businessName)}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:linear-gradient(135deg,#fef3c7 0%,#fdba74 30%,${accent} 60%,#ec4899 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{width:100%;max-width:400px;background:#fff;border-radius:28px;padding:40px 28px;box-shadow:0 24px 80px rgba(0,0,0,0.15);text-align:center}
.icon-wrap{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,${accent},#ec4899);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px;box-shadow:0 6px 20px rgba(249,115,22,0.35)}
h1{font-size:22px;font-weight:800;color:#1e293b;margin-bottom:4px}
.sub{font-size:13px;color:#94a3b8;margin-bottom:24px}
.err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:12px;font-size:13px;margin-bottom:18px}
.lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:8px;text-align:left}
input[type="text"]{width:100%;padding:14px 16px;font-size:18px;font-weight:800;background:#f8fafc;border:2px solid #e2e8f0;border-radius:14px;color:#1e293b;text-align:center;letter-spacing:2.5px;outline:none;font-family:'Courier New',monospace;text-transform:uppercase;transition:border-color .25s,box-shadow .25s}
input[type="text"]:focus{border-color:${accent};box-shadow:0 0 0 3px ${accent}22}
.btn{width:100%;padding:15px;margin-top:18px;font-size:15px;font-weight:800;background:linear-gradient(135deg,${accent},#ea580c);color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 20px rgba(249,115,22,0.35);transition:transform .15s}
.btn:active{transform:scale(0.97)}
.info{margin-top:16px;font-size:10px;color:#cbd5e1;text-align:center}
</style>
</head>
<body>
<div class="card">
${buildLogoHtml(logoUrl)}
<div class="icon-wrap">&#9728;&#65039;</div>
<h1>${escapeHtml(businessName)}</h1>
<p class="sub">Enter your voucher code to connect</p>
$(if error)<div class="err">&#9888; $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" onsubmit="var c=document.getElementById('code'),p=document.getElementById('pass');if(c&&p)p.value=c.value.trim()">
<input type="hidden" name="dst" value="$(link-orig)" />
<input type="hidden" name="popup" value="true" />
<label class="lbl">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="XXXX-XXXX" autofocus required autocomplete="off" />
<input type="hidden" name="password" id="pass" value="$(username)" />
<button type="submit" class="btn">&#9728;&#65039; Connect to Internet</button>
</form>
${buildBuySection(buyUrl, accent, '#94a3b8', `${accent}0a`, '#e2e8f0')}
<div class="info">MAC: $(mac) &bull; IP: $(ip)</div>
${buildFooterHtml(contactFooter, '#94a3b8')}
</div>
${buildScript(buyUrl)}
</body>
</html>`;
}


// ═══════════════════════════════════════════════════════════════
// TEMPLATE 3: OCEAN BREEZE
// ═══════════════════════════════════════════════════════════════
export function generateOceanBreezeTemplate(opts = {}) {
  const wifiSsid = opts.wifiSsid || 'Wi-Fi';
  const buyUrl = opts.buyUrl || getDefaultBuyUrl();
  const businessName = opts.businessName || wifiSsid;
  const logoUrl = opts.logoUrl || '';
  const contactFooter = opts.contactFooter || '';
  const accent = opts.primaryColor || '#0ea5e9';

  return `${buildMeta(businessName)}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:linear-gradient(160deg,#0c4a6e 0%,#0369a1 30%,${accent} 60%,#06b6d4 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;position:relative;overflow:hidden}
body::before{content:'';position:absolute;bottom:0;left:0;right:0;height:120px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 120'%3E%3Cpath fill='%23ffffff15' d='M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,48C672,43,768,53,864,69.3C960,85,1056,107,1152,101.3C1248,96,1344,64,1392,48L1440,32L1440,120L0,120Z'/%3E%3C/svg%3E") no-repeat bottom;background-size:cover}
.card{width:100%;max-width:400px;background:rgba(255,255,255,0.12);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.2);border-radius:28px;padding:36px 28px;box-shadow:0 24px 64px rgba(0,0,0,0.2);position:relative;z-index:1;text-align:center}
.icon-wrap{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,${accent},#06b6d4);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:28px;box-shadow:0 8px 28px rgba(14,165,233,0.4)}
h1{font-size:22px;font-weight:800;color:#fff;margin-bottom:4px}
.sub{font-size:13px;color:rgba(255,255,255,0.65);margin-bottom:24px}
.err{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:10px 14px;border-radius:12px;font-size:13px;margin-bottom:18px}
.lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.55);margin-bottom:8px;text-align:left}
input[type="text"]{width:100%;padding:14px 16px;font-size:18px;font-weight:800;background:rgba(255,255,255,0.1);border:1.5px solid rgba(255,255,255,0.2);border-radius:14px;color:#fff;text-align:center;letter-spacing:2.5px;outline:none;font-family:'Courier New',monospace;text-transform:uppercase;transition:border-color .25s,box-shadow .25s}
input[type="text"]:focus{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,0.25)}
input[type="text"]::placeholder{color:rgba(255,255,255,0.3)}
.btn{width:100%;padding:15px;margin-top:18px;font-size:15px;font-weight:800;background:linear-gradient(135deg,${accent},#06b6d4);color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 24px rgba(14,165,233,0.4);transition:transform .15s}
.btn:active{transform:scale(0.97)}
.info{margin-top:16px;font-size:10px;color:rgba(255,255,255,0.35);text-align:center}
</style>
</head>
<body>
<div class="card">
${buildLogoHtml(logoUrl)}
<div class="icon-wrap">&#127754;</div>
<h1>${escapeHtml(businessName)}</h1>
<p class="sub">Enter your voucher code to connect</p>
$(if error)<div class="err">&#9888; $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" onsubmit="var c=document.getElementById('code'),p=document.getElementById('pass');if(c&&p)p.value=c.value.trim()">
<input type="hidden" name="dst" value="$(link-orig)" />
<input type="hidden" name="popup" value="true" />
<label class="lbl">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="XXXX-XXXX" autofocus required autocomplete="off" />
<input type="hidden" name="password" id="pass" value="$(username)" />
<button type="submit" class="btn">&#127754; Connect to Internet</button>
</form>
${buildBuySection(buyUrl, '#7dd3fc', 'rgba(255,255,255,0.45)', 'rgba(14,165,233,0.12)', 'rgba(255,255,255,0.15)')}
<div class="info">MAC: $(mac) &bull; IP: $(ip)</div>
${buildFooterHtml(contactFooter, 'rgba(255,255,255,0.4)')}
</div>
${buildScript(buyUrl)}
</body>
</html>`;
}


// ═══════════════════════════════════════════════════════════════
// TEMPLATE 4: NEON PULSE
// ═══════════════════════════════════════════════════════════════
export function generateNeonPulseTemplate(opts = {}) {
  const wifiSsid = opts.wifiSsid || 'Wi-Fi';
  const buyUrl = opts.buyUrl || getDefaultBuyUrl();
  const businessName = opts.businessName || wifiSsid;
  const logoUrl = opts.logoUrl || '';
  const contactFooter = opts.contactFooter || '';
  const accent = opts.primaryColor || '#00ff88';

  return `${buildMeta(businessName)}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;font-family:'Courier New',monospace;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;position:relative}
body::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.015) 2px,rgba(255,255,255,0.015) 4px);pointer-events:none;z-index:0}
.card{width:100%;max-width:400px;background:#111;border:1.5px solid ${accent}66;border-radius:4px;padding:36px 28px;box-shadow:0 0 40px ${accent}15,inset 0 0 40px rgba(0,0,0,0.5);position:relative;z-index:1;text-align:center}
.card::before{content:'';position:absolute;top:-1px;left:20%;right:20%;height:2px;background:linear-gradient(90deg,transparent,${accent},transparent);border-radius:2px}
.icon-wrap{width:60px;height:60px;border:2px solid ${accent};border-radius:4px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;box-shadow:0 0 20px ${accent}33;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 20px ${accent}33}50%{box-shadow:0 0 30px ${accent}55}}
h1{font-size:20px;font-weight:700;color:${accent};margin-bottom:4px;text-transform:uppercase;letter-spacing:3px;text-shadow:0 0 20px ${accent}44}
.sub{font-size:12px;color:#555;margin-bottom:24px;text-transform:uppercase;letter-spacing:1.5px}
.err{background:rgba(255,0,0,0.08);border:1px solid #ff000055;color:#ff6b6b;padding:10px 14px;border-radius:2px;font-size:12px;margin-bottom:18px;text-transform:uppercase;letter-spacing:1px}
.lbl{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#555;margin-bottom:8px;text-align:left}
input[type="text"]{width:100%;padding:14px 16px;font-size:20px;font-weight:700;background:#0a0a0a;border:1.5px solid #333;border-radius:2px;color:${accent};text-align:center;letter-spacing:4px;outline:none;font-family:'Courier New',monospace;text-transform:uppercase;transition:border-color .25s,box-shadow .25s}
input[type="text"]:focus{border-color:${accent};box-shadow:0 0 20px ${accent}22}
input[type="text"]::placeholder{color:#333}
.btn{width:100%;padding:14px;margin-top:18px;font-size:13px;font-weight:700;background:transparent;color:${accent};border:2px solid ${accent};border-radius:2px;cursor:pointer;text-transform:uppercase;letter-spacing:2px;transition:all .2s}
.btn:hover{background:${accent};color:#0a0a0a}
.btn:active{transform:scale(0.97)}
.info{margin-top:16px;font-size:9px;color:#333;text-align:center;letter-spacing:1px;text-transform:uppercase}
</style>
</head>
<body>
<div class="card">
${buildLogoHtml(logoUrl, 48)}
<div class="icon-wrap">&#9889;</div>
<h1>${escapeHtml(businessName)}</h1>
<p class="sub">// ENTER ACCESS CODE //</p>
$(if error)<div class="err">[!] $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" onsubmit="var c=document.getElementById('code'),p=document.getElementById('pass');if(c&&p)p.value=c.value.trim()">
<input type="hidden" name="dst" value="$(link-orig)" />
<input type="hidden" name="popup" value="true" />
<label class="lbl">&gt; Access Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="XXXX-XXXX" autofocus required autocomplete="off" />
<input type="hidden" name="password" id="pass" value="$(username)" />
<button type="submit" class="btn">[CONNECT] &gt;&gt;</button>
</form>
${buildBuySection(buyUrl, accent, '#444', 'transparent', `${accent}44`)}
<div class="info">MAC: $(mac) // IP: $(ip)</div>
${buildFooterHtml(contactFooter, '#444')}
</div>
${buildScript(buyUrl)}
</body>
</html>`;
}


// ═══════════════════════════════════════════════════════════════
// TEMPLATE 5: CLEAN MINIMAL
// ═══════════════════════════════════════════════════════════════
export function generateCleanMinimalTemplate(opts = {}) {
  const wifiSsid = opts.wifiSsid || 'Wi-Fi';
  const buyUrl = opts.buyUrl || getDefaultBuyUrl();
  const businessName = opts.businessName || wifiSsid;
  const logoUrl = opts.logoUrl || '';
  const contactFooter = opts.contactFooter || '';
  const accent = opts.primaryColor || '#3b82f6';

  return `${buildMeta(businessName)}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:linear-gradient(160deg,#f0f4ff 0%,#e8ecf4 50%,#dfe6f0 100%);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{width:100%;max-width:400px;background:#fff;border-radius:24px;padding:44px 32px;box-shadow:0 2px 8px rgba(0,0,0,0.04),0 16px 48px rgba(0,0,0,0.06);text-align:center}
.icon-wrap{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,${accent},${accent}cc);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:24px;color:#fff;box-shadow:0 4px 16px ${accent}33}
h1{font-size:24px;font-weight:700;color:#111827;margin-bottom:4px;letter-spacing:-0.3px}
.sub{font-size:14px;color:#9ca3af;margin-bottom:28px;font-weight:400}
.err{background:#fef2f2;border:1px solid #fee2e2;color:#dc2626;padding:12px 16px;border-radius:14px;font-size:13px;margin-bottom:20px}
.lbl{display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:8px;text-align:left}
input[type="text"]{width:100%;padding:16px 18px;font-size:18px;font-weight:700;background:#f9fafb;border:2px solid #e5e7eb;border-radius:16px;color:#111827;text-align:center;letter-spacing:3px;outline:none;font-family:'SF Mono','Courier New',monospace;text-transform:uppercase;transition:border-color .2s,box-shadow .2s}
input[type="text"]:focus{border-color:${accent};box-shadow:0 0 0 4px ${accent}15}
input[type="text"]::placeholder{color:#d1d5db}
.btn{width:100%;padding:16px;margin-top:20px;font-size:15px;font-weight:700;background:${accent};color:#fff;border:none;border-radius:16px;cursor:pointer;box-shadow:0 2px 8px ${accent}33;transition:transform .15s,opacity .2s;letter-spacing:.2px}
.btn:active{transform:scale(0.98);opacity:.9}
.info{margin-top:20px;font-size:11px;color:#d1d5db}
</style>
</head>
<body>
<div class="card">
${buildLogoHtml(logoUrl)}
<div class="icon-wrap">&#128246;</div>
<h1>${escapeHtml(businessName)}</h1>
<p class="sub">Enter your voucher code to get online</p>
$(if error)<div class="err">$(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" onsubmit="var c=document.getElementById('code'),p=document.getElementById('pass');if(c&&p)p.value=c.value.trim()">
<input type="hidden" name="dst" value="$(link-orig)" />
<input type="hidden" name="popup" value="true" />
<label class="lbl">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="XXXX-XXXX" autofocus required autocomplete="off" />
<input type="hidden" name="password" id="pass" value="$(username)" />
<button type="submit" class="btn">Connect</button>
</form>
${buildBuySection(buyUrl, accent, '#9ca3af', `${accent}08`, '#e5e7eb')}
<div class="info">MAC: $(mac) &bull; IP: $(ip)</div>
${buildFooterHtml(contactFooter, '#9ca3af')}
</div>
${buildScript(buyUrl)}
</body>
</html>`;
}


// ─── TEMPLATE ROUTER ─────────────────────────────────────────
/**
 * Generate hotspot login HTML for a given template.
 * @param {string} templateId — one of the TEMPLATE_REGISTRY ids
 * @param {object} opts — { wifiSsid, buyUrl, businessName, logoUrl, contactFooter, primaryColor }
 * @returns {string} Complete standalone HTML
 */
export function getTemplateGenerator(templateId) {
  switch (templateId) {
    case 'sunrise-gradient': return generateSunriseGradientTemplate;
    case 'ocean-breeze':     return generateOceanBreezeTemplate;
    case 'neon-pulse':       return generateNeonPulseTemplate;
    case 'clean-minimal':    return generateCleanMinimalTemplate;
    case 'midnight-glass':
    default:                 return generateMidnightGlassTemplate;
  }
}
