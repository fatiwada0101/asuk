import { supabaseAdmin } from '@/lib/supabase-server.js';

// Allow local router self-signed HTTPS certificates
if (typeof process !== 'undefined' && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

/**
 * Cleanly sanitize MikroTik host, port, protocol, and credentials.
 * Handles inputs like:
 *   "http://hgn09g0fv3t.sn.mynetname.net:443"
 *   "https://hgn09g0fv3t.sn.mynetname.net/"
 *   "hgn09g0fv3t.sn.mynetname.net:8443"
 *   "192.168.88.1"
 */
export function sanitizeMikroTikConfig(rawCfg = {}) {
  let rawIp = typeof rawCfg.ip === 'string' ? rawCfg.ip.trim() : '';
  let rawPort = rawCfg.port !== undefined && rawCfg.port !== null ? String(rawCfg.port).trim() : '';
  let useSsl = rawCfg.use_ssl;

  // 1. Detect and strip protocol prefix (http:// or https://)
  if (/^https?:\/\//i.test(rawIp)) {
    if (rawIp.toLowerCase().startsWith('http://')) {
      if (useSsl === undefined) useSsl = false;
    } else if (rawIp.toLowerCase().startsWith('https://')) {
      if (useSsl === undefined) useSsl = true;
    }
    rawIp = rawIp.replace(/^https?:\/\//i, '');
  }

  // 2. Strip any trailing slashes or subpaths (e.g. /rest/system/resource or trailing /)
  rawIp = rawIp.replace(/\/.*$/, '').trim();

  // 3. Extract port if user appended :port to the IP/hostname field
  if (rawIp.includes(':')) {
    const colonIdx = rawIp.lastIndexOf(':');
    const possiblePort = rawIp.substring(colonIdx + 1).trim();
    const possibleHost = rawIp.substring(0, colonIdx).trim();
    if (/^\d+$/.test(possiblePort)) {
      rawIp = possibleHost;
      if (!rawPort) rawPort = possiblePort;
    }
  }

  // 4. Default ports and protocol determination
  if (!rawPort) {
    rawPort = useSsl === false ? '80' : '443';
  }

  let isSsl;
  if (useSsl !== undefined && useSsl !== null) {
    isSsl = Boolean(useSsl);
  } else {
    isSsl = rawPort !== '80';
  }

  const protocol = isSsl ? 'https' : 'http';

  const user = typeof rawCfg.user === 'string' && rawCfg.user.trim() ? rawCfg.user.trim() : 'admin';
  const pass = typeof rawCfg.pass === 'string' ? rawCfg.pass : '';
  const hotspot_url = typeof rawCfg.hotspot_url === 'string' && rawCfg.hotspot_url.trim()
    ? rawCfg.hotspot_url.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    : 'asuktech.net';
  const wifi_ssid = typeof rawCfg.wifi_ssid === 'string' && rawCfg.wifi_ssid.trim()
    ? rawCfg.wifi_ssid.trim()
    : 'Asuk Tech Wi-Fi';

  // Check if genuinely configured:
  const isDefaultIp = rawIp === '192.168.88.1' || !rawIp;
  const hasPassword = Boolean(pass && pass.trim().length > 0);
  const isConfigured = Boolean(
    rawCfg.configured === true ||
    (rawIp && !isDefaultIp) ||
    (!isDefaultIp && hasPassword) ||
    (isDefaultIp && hasPassword)
  );

  return {
    ip: rawIp,
    port: String(rawPort),
    protocol,
    use_ssl: isSsl,
    user,
    pass,
    isConfigured,
    configured: isConfigured,
    hotspot_url,
    wifi_ssid,
  };
}

/**
 * Get current MikroTik configuration from Supabase `app_settings`
 * with fallback to environment variables.
 */
export async function getMikroTikConfig() {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'mikrotik')
      .maybeSingle();

    if (!error && data?.value && data.value.ip) {
      return sanitizeMikroTikConfig(data.value);
    }
  } catch (err) {
    console.warn('Could not read MikroTik config from DB, using env:', err.message);
  }

  // Fallback to environment variables
  if (process.env.MIKROTIK_IP && process.env.MIKROTIK_IP.trim()) {
    return sanitizeMikroTikConfig({
      ip: process.env.MIKROTIK_IP,
      port: process.env.MIKROTIK_PORT,
      user: process.env.MIKROTIK_USER,
      pass: process.env.MIKROTIK_PASS,
      protocol: process.env.MIKROTIK_PROTOCOL,
      use_ssl: process.env.MIKROTIK_USE_SSL !== undefined ? process.env.MIKROTIK_USE_SSL === 'true' : undefined,
      hotspot_url: process.env.MIKROTIK_HOTSPOT_URL,
      wifi_ssid: process.env.MIKROTIK_WIFI_SSID,
    });
  }

  return sanitizeMikroTikConfig({
    ip: '192.168.88.1',
    user: 'admin',
    pass: '',
    port: '443',
    use_ssl: true,
    configured: false,
    hotspot_url: 'asuktech.net',
    wifi_ssid: 'Asuk Tech Wi-Fi',
  });
}

/**
 * Check if MikroTik router is configured in settings
 */
export async function isMikroTikConfigured() {
  const config = await getMikroTikConfig();
  return Boolean(config.isConfigured);
}

/**
 * Helper to build MikroTik REST API URL and headers
 */
export async function buildMikroTikRequest(endpoint) {
  const config = await getMikroTikConfig();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const cleanIp = (config.ip || '').replace(/\/+$/, '');
  const url = `${config.protocol}://${cleanIp}:${config.port}${cleanEndpoint}`;
  const authStr = Buffer.from(`${config.user}:${config.pass}`).toString('base64');

  return {
    url,
    config,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${authStr}`,
    },
  };
}

/**
 * Detect whether an IP address is a private RFC 1918 / loopback / link-local address
 */
export function isPrivateIp(ip) {
  if (!ip) return false;
  const clean = ip.trim().toLowerCase();
  if (clean === 'localhost' || clean.startsWith('127.')) return true;
  if (clean.startsWith('192.168.')) return true;
  if (clean.startsWith('10.')) return true;
  if (clean.startsWith('169.254.')) return true; // link-local
  const match172 = clean.match(/^172\.(\d+)\./);
  if (match172) {
    const octet = parseInt(match172[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

/**
 * Detailed error diagnostics for MikroTik connection attempts
 */
export function diagnoseConnectionError(err, config = {}, durationMs = 0) {
  const causeCode = String(err?.cause?.code || err?.code || '');
  const causeMsg = String(err?.cause?.message || '');
  const errMsg = String(err?.message || '');
  const target = `${config.protocol || 'https'}://${config.ip || 'unknown'}:${config.port || '443'}`;
  const isPrivate = isPrivateIp(config.ip);

  let errorCode = 'UNKNOWN';
  let summary = `Connection to ${target} failed`;
  let details = '';
  let remediation = [];

  const isTimeout =
    err?.name === 'AbortError' ||
    err?.name === 'TimeoutError' ||
    causeCode === 'ETIMEDOUT' ||
    causeMsg.includes('ETIMEDOUT') ||
    errMsg.toLowerCase().includes('timeout');

  const isRefused =
    causeCode === 'ECONNREFUSED' ||
    causeMsg.includes('ECONNREFUSED') ||
    errMsg.includes('ECONNREFUSED');

  const isDnsFailed =
    causeCode === 'ENOTFOUND' ||
    causeMsg.includes('ENOTFOUND') ||
    errMsg.includes('ENOTFOUND');

  const isUnreachable =
    causeCode === 'EHOSTUNREACH' ||
    causeCode === 'ENETUNREACH' ||
    causeMsg.includes('EHOSTUNREACH') ||
    causeMsg.includes('ENETUNREACH');

  const isTlsError =
    causeCode?.includes('CERT') ||
    causeMsg.includes('CERT') ||
    causeCode?.includes('TLS') ||
    errMsg.includes('certificate');

  const isAuthFailed =
    err?.status === 401 ||
    errMsg.includes('Authentication failed') ||
    errMsg.includes('401');

  const isForbidden =
    err?.status === 403 ||
    errMsg.includes('403');

  const isNotFound =
    err?.status === 404 ||
    errMsg.includes('404');

  if (!config.isConfigured) {
    errorCode = 'NOT_CONFIGURED';
    summary = 'MikroTik Router Not Configured';
    details = 'Router IP address, port, or credentials have not been configured in Super Admin settings.';
    remediation = [
      'Enter your router IP address, API username, and password in the form below.',
      'Click "Save MikroTik Settings" to apply changes.',
      'Refer to the "View WinBox Connection Tutorial" guide for step-by-step setup.'
    ];
  } else if (isAuthFailed) {
    errorCode = 'AUTH_FAILED';
    summary = `Authentication Failed: Invalid Credentials for ${config.user}@${config.ip}`;
    details = `The router responded, but rejected the login for user "${config.user}". Incorrect username or password.`;
    remediation = [
      `Open WinBox -> go to "System" -> "Users" and verify that user "${config.user}" exists.`,
      'Carefully verify and re-type the router user password.',
      'Ensure the user is assigned to the "full" group or has "read,write,api,rest-api" policies enabled.',
      'If you forgot the password, create a new API user in WinBox: System -> Users -> Add.'
    ];
  } else if (isForbidden) {
    errorCode = 'FORBIDDEN';
    summary = `Access Forbidden: Insufficient Permissions for user "${config.user}"`;
    details = `User "${config.user}" authenticated successfully, but does not have permission to execute REST API commands.`;
    remediation = [
      `In WinBox, go to "System" -> "Users", double-click "${config.user}".`,
      'Set "Group" to "full".',
      'Or create a group with policies: read, write, api, rest-api, policy, test.'
    ];
  } else if (isNotFound) {
    errorCode = 'NOT_FOUND';
    summary = 'REST API Not Found: RouterOS Version or Endpoint Unsupported';
    details = `The router returned HTTP 404 for the /rest/ endpoint. The MikroTik REST API was introduced in RouterOS v7.1. Older RouterOS v6 firmware does not support the REST API.`;
    remediation = [
      'Check your RouterOS version in WinBox: "System" -> "Resources".',
      'If your router is running RouterOS v6, upgrade to RouterOS v7 via "System" -> "Packages" -> "Check For Updates".',
      'Ensure the "www-ssl" service is running: "IP" -> "Services" -> enable "www-ssl".'
    ];
  } else if (isRefused) {
    errorCode = 'REFUSED';
    summary = `Connection Refused on ${config.ip}:${config.port}`;
    details = `The router host (${config.ip}) was reached, but port ${config.port} is closed or refusing incoming connections.`;
    remediation = [
      `In WinBox, go to "IP" -> "Services".`,
      config.protocol === 'https'
        ? `Ensure "www-ssl" is enabled (blue icon) and listening on port ${config.port}.`
        : `Ensure "www" is enabled (blue icon) and listening on port ${config.port}.`,
      `If you are using port 80, set Protocol to HTTP and port to 80 in settings.`,
      `RouterOS CLI shortcut: /ip service set www-ssl disabled=no port=${config.port}`
    ];
  } else if (isDnsFailed) {
    errorCode = 'DNS_FAILED';
    summary = `Hostname Not Found: Could not resolve "${config.ip}"`;
    details = `The domain name or hostname "${config.ip}" could not be resolved by DNS.`;
    remediation = [
      'Check for typos in the router hostname or domain.',
      'If using MikroTik Cloud DDNS (*.sn.mynetname.net), verify in WinBox: "IP" -> "Cloud" -> check "DDNS Enabled" and verify the DNS Name.'
    ];
  } else if (isTimeout || isUnreachable) {
    errorCode = isTimeout ? 'TIMEOUT' : 'UNREACHABLE';
    summary = `Connection Timed Out: Router at ${config.ip}:${config.port} did not respond`;
    details = isPrivate
      ? `Router IP "${config.ip}" is a private local network (LAN) address and did not respond within ${durationMs > 0 ? (durationMs / 1000).toFixed(1) + 's' : 'timeout period'}.`
      : `No response was received from ${config.ip}:${config.port} within ${durationMs > 0 ? (durationMs / 1000).toFixed(1) + 's' : 'timeout period'}.`;

    remediation = [
      'Verify the router is powered on and connected to your network.',
      isPrivate
        ? `⚠️ IP SUBNET REACHABILITY: "${config.ip}" is a local LAN address. If this web application is hosted on Vercel or in the cloud, public cloud servers CANNOT reach private LAN IPs (like 192.168.88.1). You must use your MikroTik Cloud DDNS (*.sn.mynetname.net) or Public IP with port ${config.port} forwarded.`
        : `FIREWALL ALLOW RULE: In WinBox -> Terminal, run: /ip firewall filter add chain=input protocol=tcp dst-port=${config.port} action=accept place-before=1 comment="Allow REST API for Vercel"`,
      isPrivate
        ? `If running this app locally on your PC, ensure your PC is connected to the same Wi-Fi or Ethernet network as the MikroTik router.`
        : `ROUTER SERVICE: In WinBox -> IP -> Services, ensure "${config.protocol === 'https' ? 'www-ssl' : 'www'}" is enabled on port ${config.port}.${config.protocol === 'https' ? ' (Run `/certificate enable-ssl-certificate` in Terminal to assign a valid certificate).' : ''}`,
      `CARRIER-GRADE NAT / ISP MODEM: If your ISP (e.g. MTN, Starlink) uses CGNAT or an upstream modem without a public IP, inbound WAN ports are blocked. Use a free Cloudflare Tunnel or ngrok (\`ngrok http 192.168.88.1:80\`) to connect Vercel to your MikroTik with zero port forwarding.`
    ];
  } else if (isTlsError) {
    errorCode = 'TLS_ERROR';
    summary = `TLS/SSL Handshake Error with ${config.ip}:${config.port}`;
    details = `The HTTPS connection failed due to an SSL/TLS error: ${causeMsg || errMsg}.`;
    remediation = [
      'The app automatically accepts self-signed certificates. If issues persist, try testing with port 80 (HTTP) temporarily.',
      'In WinBox, check "IP" -> "Services" -> "www-ssl" and verify the Certificate is assigned (or set to "none" for RouterOS default self-signed).'
    ];
  } else {
    errorCode = 'NETWORK_ERROR';
    summary = `Failed to Connect to MikroTik (${config.ip}:${config.port})`;
    details = causeMsg || errMsg || 'An unexpected network error occurred while communicating with the router.';
    remediation = [
      'Verify the router is online and reachable.',
      'Test router reachability using ping or WinBox.',
      'Review the WinBox setup tutorial in the Super Admin dashboard.'
    ];
  }

  return {
    errorCode,
    summary,
    details,
    remediation,
    target,
    durationMs,
    isPrivateIp: isPrivate,
    rawError: causeMsg || errMsg,
    causeCode: causeCode || null,
  };
}

// In-memory ring buffer of connection logs (latest 50 attempts)
let connectionLogsCache = [];
let logsLoadedFromDb = false;

/**
 * Record a connection attempt to memory and Supabase app_settings
 */
export async function recordConnectionLog(logEntry) {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...logEntry,
  };

  connectionLogsCache.unshift(entry);
  if (connectionLogsCache.length > 50) {
    connectionLogsCache = connectionLogsCache.slice(0, 50);
  }

  // Persist to Supabase app_settings asynchronously (fire-and-forget, never throws)
  try {
    await supabaseAdmin
      .from('app_settings')
      .upsert({
        key: 'mikrotik_connection_logs',
        value: connectionLogsCache,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
  } catch (err) {
    console.warn('Could not persist connection log to DB:', err.message);
  }

  return entry;
}

/**
 * Get recent connection logs with aggregate stats
 */
export async function getConnectionLogs(limit = 30) {
  if (!logsLoadedFromDb) {
    try {
      const { data } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'mikrotik_connection_logs')
        .maybeSingle();
      if (data?.value && Array.isArray(data.value)) {
        connectionLogsCache = data.value;
      }
      logsLoadedFromDb = true;
    } catch (err) {
      console.warn('Could not load connection logs from DB:', err.message);
    }
  }

  const logs = connectionLogsCache.slice(0, limit);
  const total = connectionLogsCache.length;
  const successful = connectionLogsCache.filter(l => l.connected).length;
  const failed = total - successful;
  const uptimePercent = total > 0 ? Math.round((successful / total) * 100) : 0;
  const latencies = connectionLogsCache.filter(l => l.durationMs > 0).map(l => l.durationMs);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  return {
    logs,
    latest: logs[0] || null,
    stats: {
      total,
      successful,
      failed,
      uptimePercent,
      avgLatencyMs: avgLatency,
    }
  };
}

/**
 * Clear connection logs from memory and database
 */
export async function clearConnectionLogs() {
  connectionLogsCache = [];
  logsLoadedFromDb = true;
  try {
    await supabaseAdmin
      .from('app_settings')
      .upsert({
        key: 'mikrotik_connection_logs',
        value: [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
  } catch (err) {
    console.warn('Could not clear connection logs in DB:', err.message);
  }
  return { success: true };
}

/**
 * Test connection to MikroTik router with comprehensive diagnostics
 * Queries /rest/system/resource
 */
export async function testConnection(options = {}) {
  const startTime = Date.now();
  let config;
  try {
    config = await getMikroTikConfig();
  } catch (e) {
    config = { ip: '192.168.88.1', port: '443', protocol: 'https', isConfigured: false, user: 'admin' };
  }

  const cleanIp = (config.ip || '').replace(/\/+$/, '');
  const target = `${config.protocol}://${cleanIp}:${config.port}`;

  if (!config.isConfigured) {
    const diag = diagnoseConnectionError(new Error('Router not configured'), config, 0);
    const result = {
      connected: false,
      success: false,
      duration_ms: 0,
      timestamp: new Date().toISOString(),
      target,
      diagnostics: diag,
      error: diag.summary,
      error_code: diag.errorCode,
      details: diag.details,
      remediation: diag.remediation,
      is_private_ip: diag.isPrivateIp,
    };
    await recordConnectionLog({
      connected: false,
      durationMs: 0,
      target,
      errorCode: diag.errorCode,
      summary: diag.summary,
      details: diag.details,
      remediation: diag.remediation,
      isPrivateIp: diag.isPrivateIp,
    });
    if (options.throwOnError) throw new Error(diag.summary);
    return result;
  }

  const { url, headers } = await buildMikroTikRequest('/rest/system/resource');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    if (res.status === 401) {
      const err = new Error(`Authentication failed: Invalid username or password for ${config.user}@${config.ip}`);
      err.status = 401;
      throw err;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Router returned status ${res.status}: ${text || res.statusText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const routerInfo = {
      model: data['board-name'] || data.platform || 'MikroTik Router',
      version: data.version || 'RouterOS v7+',
      uptime: data.uptime || 'unknown',
      cpuLoad: data['cpu-load'] !== undefined ? `${data['cpu-load']}%` : 'unknown',
      freeMemory: data['free-memory'] ? `${Math.round(data['free-memory'] / 1024 / 1024)} MB` : 'unknown',
      ip: config.ip,
      port: config.port,
      protocol: config.protocol,
    };

    const successResult = {
      connected: true,
      success: true,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
      target,
      router: routerInfo,
      diagnostics: {
        errorCode: 'OK',
        summary: `Connected to ${routerInfo.model} (${routerInfo.version})`,
        details: `Router is online and responding via REST API on port ${config.port}. Latency: ${durationMs}ms.`,
        remediation: [],
        target,
        durationMs,
        isPrivateIp: isPrivateIp(config.ip),
      }
    };

    await recordConnectionLog({
      connected: true,
      durationMs,
      target,
      errorCode: 'OK',
      summary: `Connected to ${routerInfo.model} (${routerInfo.version}) in ${durationMs}ms`,
      details: `RouterOS ${routerInfo.version} online. Uptime: ${routerInfo.uptime}. CPU: ${routerInfo.cpuLoad}.`,
      routerInfo,
      isPrivateIp: isPrivateIp(config.ip),
    });

    return successResult;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const diag = diagnoseConnectionError(err, config, durationMs);
    const failResult = {
      connected: false,
      success: false,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
      target,
      diagnostics: diag,
      error: diag.summary,
      error_code: diag.errorCode,
      details: diag.details,
      remediation: diag.remediation,
      raw_error: diag.rawError,
      is_private_ip: diag.isPrivateIp,
    };

    await recordConnectionLog({
      connected: false,
      durationMs,
      target,
      errorCode: diag.errorCode,
      summary: diag.summary,
      details: diag.details,
      remediation: diag.remediation,
      isPrivateIp: diag.isPrivateIp,
      rawError: diag.rawError,
    });

    if (options.throwOnError) {
      throw new Error(diag.summary);
    }
    return failResult;
  }
}

let cachedHealth = null;
let lastCheckTime = 0;
const HEALTH_CACHE_TTL = 15000; // 15 seconds

/**
 * Fast connectivity check (returns boolean true/false, does not throw)
 */
export async function isMikroTikOnline(timeoutMs = 2500) {
  try {
    const { url, headers, config } = await buildMikroTikRequest('/rest/system/resource');
    if (!config.isConfigured) {
      return false;
    }
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Cached health check to prevent hammering router / hanging requests
 */
export async function checkMikroTikHealth(timeoutMs = 2500, force = false) {
  const now = Date.now();
  if (!force && cachedHealth !== null && (now - lastCheckTime) < HEALTH_CACHE_TTL) {
    return cachedHealth;
  }
  const online = await isMikroTikOnline(timeoutMs);
  cachedHealth = online;
  lastCheckTime = now;
  return online;
}

/**
 * Retrieve list of user profiles from MikroTik
 */
export async function getHotspotProfiles() {
  const { url, headers, config } = await buildMikroTikRequest('/rest/ip/hotspot/user/profile');
  if (!config.isConfigured) return [];
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch hotspot profiles from router:', err.message);
    return [];
  }
}

/**
 * Calculate expiration ISO timestamp based on duration string (e.g. '1h', '3h', '24h', '3d', '7d', '30d')
 */
export function calculateExpiresAt(durationStr, fromDate = new Date()) {
  const baseTime = fromDate instanceof Date ? fromDate.getTime() : new Date(fromDate).getTime();
  const map = {
    '1h': 1 * 3600 * 1000,
    '3h': 3 * 3600 * 1000,
    '24h': 24 * 3600 * 1000,
    '1d': 24 * 3600 * 1000,
    '3d': 3 * 24 * 3600 * 1000,
    '7d': 7 * 24 * 3600 * 1000,
    '30d': 30 * 24 * 3600 * 1000,
  };
  const ms = map[durationStr] || 24 * 3600 * 1000;
  return new Date(baseTime + ms).toISOString();
}

/**
 * Create a hotspot user (voucher) on MikroTik router.
 * Throws error if router is unreachable, unconfigured, or creation fails.
 *
 * @param {Object} opts
 * @param {string} opts.code - Voucher username
 * @param {string} opts.password - Voucher password
 * @param {string} opts.profile - Hotspot profile name
 * @param {string} opts.limitUptime - e.g. '1h', '1d', '7d'
 * @param {string} opts.comment - Description
 * @param {number} opts.shared_users - Max simultaneous devices (default 1)
 * @param {string} opts.rate_limit - Upload/download limit e.g. '12M/12M' (MikroTik format)
 */
export async function createHotspotUser({ code, password, profile, limitUptime, comment, shared_users, rate_limit, expiry_mode }) {
  const { url, headers, config } = await buildMikroTikRequest('/rest/ip/hotspot/user');
  if (!config.isConfigured) {
    throw new Error('MikroTik router is not configured in settings');
  }

  // Verify router connectivity first or send create request
  const bodyData = {
    name: code,
    password: password || code,
    comment: comment || `Voucher: ${code}`,
  };

  if (limitUptime) {
    bodyData['limit-uptime'] = limitUptime;
  }

  // If a profile name was provided, try using it; otherwise omit or default
  if (profile && profile !== 'default') {
    bodyData.profile = profile;
  }

  // Shared users (number of devices) — defaults to 1
  const deviceCount = Number(shared_users) || 1;
  bodyData['shared-users'] = String(deviceCount);

  // Rate limit — format: "upload/download" e.g. "12M/12M"
  if (rate_limit) {
    bodyData['rate-limit'] = rate_limit;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    let res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(bodyData),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // If profile not found, retry with 'default' profile
    if (!res.ok && bodyData.profile) {
      const errText = await res.text();
      if (errText.toLowerCase().includes('profile') || res.status === 400) {
        console.warn(`Profile "${bodyData.profile}" not found on router, retrying with "default"`);
        delete bodyData.profile;
        const retryRes = await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(bodyData),
          signal: AbortSignal.timeout(5000),
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          // Apply expiry mode to the 'default' profile (fire-and-forget)
          applyExpiryModeToProfile('default', limitUptime, expiry_mode).catch(() => {});
          return {
            success: true,
            routerId: retryData['.id'] || null,
            name: code,
            profile: 'default',
          };
        }
      }
      throw new Error(`MikroTik router error (${res.status}): ${errText}`);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`MikroTik router error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const usedProfile = bodyData.profile || 'default';

    // Apply expiry mode keepalive-timeout to the profile (fire-and-forget, non-blocking)
    applyExpiryModeToProfile(usedProfile, limitUptime, expiry_mode).catch((err) => {
      console.warn(`Non-fatal: could not apply expiry mode to profile "${usedProfile}":`, err.message);
    });

    return {
      success: true,
      routerId: data['.id'] || null,
      name: code,
      profile: usedProfile,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`MikroTik router timeout: ${config.ip}:${config.port} did not respond.`);
    }
    throw err;
  }
}

/**
 * Apply expiry mode to a hotspot user profile by setting keepalive-timeout.
 *
 * MikroTik Behavior:
 * - `limit-uptime` on a hotspot user counts only while the user is connected (session active).
 * - `keepalive-timeout` on the user profile controls how long the router waits before
 *   considering a disconnected user as logged out.
 *
 * Elapsed Time Mode:
 *   Sets keepalive-timeout = plan duration (e.g., "1d" for 24h voucher).
 *   This keeps the session alive even when the user disconnects, so the uptime counter
 *   continues ticking. The voucher expires at the same wall-clock time regardless of usage.
 *   API: PATCH /rest/ip/hotspot/user/profile/{id} → { "keepalive-timeout": "1d" }
 *
 * Paused Time Mode:
 *   Sets keepalive-timeout = "00:02:00" (2 minutes, MikroTik default).
 *   When the user disconnects, the session ends after 2 minutes, and the uptime counter
 *   pauses. The user retains their remaining time for the next login.
 *   API: PATCH /rest/ip/hotspot/user/profile/{id} → { "keepalive-timeout": "00:02:00" }
 *
 * @param {string} profileName - Name of the hotspot user profile (e.g., "1 Day Pass")
 * @param {string} limitUptime - The plan duration in MikroTik format (e.g., "1d", "7d", "1h")
 * @param {string} expiryMode - "elapsed" or "paused" (defaults to "elapsed")
 */
export async function applyExpiryModeToProfile(profileName, limitUptime, expiryMode = 'elapsed') {
  if (!profileName || !limitUptime) return;

  try {
    // 1. Get all profiles to find the .id for the target profile
    const profiles = await getHotspotProfiles();
    const target = profiles.find(
      (p) => p.name === profileName || p.name?.toLowerCase() === profileName?.toLowerCase()
    );

    if (!target || !target['.id']) {
      console.warn(`Profile "${profileName}" not found on router — skipping expiry mode update`);
      return;
    }

    // 2. Determine the keepalive-timeout value based on expiry mode
    let keepaliveTimeout;
    if (expiryMode === 'elapsed') {
      // Match keepalive to the plan duration so session stays alive when user disconnects
      keepaliveTimeout = limitUptime;
    } else {
      // Paused mode: short keepalive so session dies quickly on disconnect
      keepaliveTimeout = '00:02:00';
    }

    // 3. PATCH the profile via REST API
    const profileId = encodeURIComponent(target['.id']);
    const { url, headers } = await buildMikroTikRequest(`/rest/ip/hotspot/user/profile/${profileId}`);

    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ 'keepalive-timeout': keepaliveTimeout }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      console.log(`✅ Set keepalive-timeout="${keepaliveTimeout}" on profile "${profileName}" (expiry mode: ${expiryMode})`);
    } else {
      const errText = await res.text();
      console.warn(`Failed to update profile "${profileName}" keepalive-timeout: ${errText}`);
    }
  } catch (err) {
    console.warn(`Non-fatal error applying expiry mode to profile "${profileName}":`, err.message);
  }
}

/**
 * Fetch active hotspot sessions from router
 */
export async function getActiveSessions() {
  const { url, headers, config } = await buildMikroTikRequest('/rest/ip/hotspot/active');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Router returned ${res.status}: ${text}`);
    }

    const sessions = await res.json();
    return Array.isArray(sessions) ? sessions : [];
  } catch (err) {
    console.error(`Active sessions error (${config.ip}):`, err.message);
    throw err;
  }
}

/**
 * Kick an active session by router .id
 */
export async function kickActiveSession(sessionId) {
  const cleanId = encodeURIComponent(sessionId);
  const { url, headers } = await buildMikroTikRequest(`/rest/ip/hotspot/active/${cleanId}`);

  const res = await fetch(url, {
    method: 'DELETE',
    headers,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to disconnect session: ${errText}`);
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// HOTSPOT USER MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * Get all hotspot users (vouchers) configured on the router
 */
export async function getHotspotUsers() {
  const { url, headers } = await buildMikroTikRequest('/rest/ip/hotspot/user');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Router returned ${res.status}: ${text}`);
    }
    const users = await res.json();
    return Array.isArray(users) ? users : [];
  } catch (err) {
    console.error('Failed to fetch hotspot users:', err.message);
    throw err;
  }
}

/**
 * Delete a hotspot user by router .id
 */
export async function deleteHotspotUser(userId) {
  const cleanId = encodeURIComponent(userId);
  const { url, headers } = await buildMikroTikRequest(`/rest/ip/hotspot/user/${cleanId}`);

  const res = await fetch(url, {
    method: 'DELETE',
    headers,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to delete hotspot user: ${errText}`);
  }

  return { success: true };
}

/**
 * Update a hotspot user's properties (limit-uptime, profile, password, etc.)
 */
export async function updateHotspotUser(userId, data) {
  const cleanId = encodeURIComponent(userId);
  const { url, headers } = await buildMikroTikRequest(`/rest/ip/hotspot/user/${cleanId}`);

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to update hotspot user: ${errText}`);
  }

  return await res.json();
}

// ═══════════════════════════════════════════════════════════
// HOTSPOT USER PROFILE MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * Create a new hotspot user profile
 * Properties: name, rate-limit, shared-users, session-timeout, idle-timeout, keepalive-timeout
 */
export async function createHotspotProfile(profileData) {
  const { url, headers } = await buildMikroTikRequest('/rest/ip/hotspot/user/profile');

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(profileData),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create profile: ${errText}`);
  }

  return await res.json();
}

/**
 * Update an existing hotspot user profile
 */
export async function updateHotspotProfile(profileId, data) {
  const cleanId = encodeURIComponent(profileId);
  const { url, headers } = await buildMikroTikRequest(`/rest/ip/hotspot/user/profile/${cleanId}`);

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to update profile: ${errText}`);
  }

  return await res.json();
}

/**
 * Delete a hotspot user profile
 */
export async function deleteHotspotProfile(profileId) {
  const cleanId = encodeURIComponent(profileId);
  const { url, headers } = await buildMikroTikRequest(`/rest/ip/hotspot/user/profile/${cleanId}`);

  const res = await fetch(url, {
    method: 'DELETE',
    headers,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to delete profile: ${errText}`);
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// SYSTEM MONITORING & NETWORK ANALYTICS
// ═══════════════════════════════════════════════════════════

/**
 * Get system health data (voltage, temperature, fan speed)
 */
export async function getSystemHealth() {
  const { url, headers } = await buildMikroTikRequest('/rest/system/health');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    console.warn('Failed to fetch system health:', err.message);
    return [];
  }
}

/**
 * Get all DHCP server leases
 */
export async function getDHCPLeases() {
  const { url, headers } = await buildMikroTikRequest('/rest/ip/dhcp-server/lease');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Failed to fetch DHCP leases:', err.message);
    return [];
  }
}

/**
 * Get recent router logs (optionally filtered by topics)
 */
export async function getRouterLogs(topics = null) {
  const { url, headers } = await buildMikroTikRequest('/rest/log/print');
  try {
    const body = topics
      ? { '.query': [`topics="${topics}"`] }
      : {};

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Return last 50 log entries
    const logs = Array.isArray(data) ? data : [];
    return logs.slice(-50);
  } catch (err) {
    console.warn('Failed to fetch router logs:', err.message);
    return [];
  }
}

/**
 * Get all network interfaces with traffic statistics
 */
export async function getInterfaces() {
  const { url, headers } = await buildMikroTikRequest('/rest/interface');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Failed to fetch interfaces:', err.message);
    return [];
  }
}

/**
 * Retrieve Hotspot Server Profiles (e.g. hsprof1, default)
 * Endpoint: /rest/ip/hotspot/profile
 */
export async function getHotspotServerProfiles() {
  const { url, headers, config } = await buildMikroTikRequest('/rest/ip/hotspot/profile');
  if (!config.isConfigured) return [];
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Failed to fetch hotspot server profiles:', err.message);
    return [];
  }
}

/**
 * Auto-provision Hotspot DNS Name (e.g. "asuktech.net") to the router's Hotspot Server Profiles.
 * Configures the router so user login redirects directly to the configured domain.
 */
export async function setHotspotDnsName(dnsName) {
  if (!dnsName) throw new Error('DNS name is required');
  const cleanDns = dnsName.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const profiles = await getHotspotServerProfiles();
  if (!profiles || profiles.length === 0) {
    throw new Error('No hotspot server profiles found on router');
  }

  const updated = [];
  for (const prof of profiles) {
    if (!prof['.id']) continue;
    const profId = encodeURIComponent(prof['.id']);
    const { url, headers } = await buildMikroTikRequest(`/rest/ip/hotspot/profile/${profId}`);
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          'dns-name': cleanDns,
          'login-by': 'cookie,http-chap,http-pap',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        updated.push(prof.name || prof['.id']);
      }
    } catch (e) {
      console.warn(`Failed to patch dns-name on profile ${prof.name}:`, e.message);
    }
  }

  if (updated.length === 0) {
    throw new Error(`Could not update Hotspot Server Profile on router. Verify REST API permissions.`);
  }

  return { success: true, updatedProfiles: updated, dnsName: cleanDns };
}


// ═══════════════════════════════════════════════════════════════════════════════
// POLLING MODE — Router-Initiated Connection (bypasses ISP CGNAT)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current connection mode ('direct' or 'polling')
 * @returns {Promise<{mode: string, enabled: boolean, interval: number}>}
 */
export async function getConnectionMode() {
  try {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'polling_config')
      .maybeSingle();

    if (data?.value?.enabled) {
      return {
        mode: 'polling',
        enabled: true,
        interval: data.value.interval || 10,
        secret: data.value.secret || '',
      };
    }
  } catch (err) {
    console.warn('Could not read polling config:', err.message);
  }

  return { mode: 'direct', enabled: false, interval: 0, secret: '' };
}

/**
 * Queue a task for the MikroTik router to pick up during its next poll.
 * Used when connection_mode is 'polling'.
 * 
 * @param {string} taskType - Type of task (e.g., 'create_hotspot_user')
 * @param {Object} payload - Task data
 * @returns {Promise<{queued: boolean, task_id: string}>}
 */
export async function queueRouterTask(taskType, payload) {
  const { data, error } = await supabaseAdmin
    .from('pending_router_tasks')
    .insert({
      task_type: taskType,
      payload,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to queue router task: ${error.message}`);
  }

  return { queued: true, task_id: data.id };
}

/**
 * Create a hotspot user either directly (direct mode) or via polling queue.
 * Drop-in replacement for createHotspotUser() that respects the connection mode setting.
 * 
 * @param {Object} opts - Same parameters as createHotspotUser()
 * @returns {Promise<Object>} - In direct mode: router result. In polling mode: { queued: true, task_id }
 */
export async function createOrQueueHotspotUser(opts) {
  const { mode } = await getConnectionMode();

  if (mode === 'polling') {
    // Queue the task for the router to pick up
    const result = await queueRouterTask('create_hotspot_user', {
      code: opts.code,
      password: opts.password || opts.code,
      profile: opts.profile || 'default',
      limitUptime: opts.limitUptime || '1d',
      comment: opts.comment || `Voucher: ${opts.code}`,
      shared_users: opts.shared_users || 1,
      rate_limit: opts.rate_limit || '',
      expiry_mode: opts.expiry_mode || 'elapsed',
    });

    return {
      success: true,
      queued: true,
      routerId: null,
      name: opts.code,
      profile: opts.profile || 'default',
      task_id: result.task_id,
    };
  }

  // Direct mode: call the router immediately (existing behavior)
  return createHotspotUser(opts);
}

/**
 * Generate the RouterOS script that users paste into WinBox Terminal.
 * Pre-fills the Vercel app URL and polling secret.
 * 
 * @param {string} appUrl - The Vercel app URL (e.g., 'https://asuk-tech.vercel.app')
 * @param {string} secret - The polling secret
 * @param {number} interval - Polling interval in seconds (default 10)
 * @returns {string} - Complete RouterOS script
 */
export function generateRouterOSScript(appUrl, secret, interval = 10) {
  const cleanUrl = appUrl.replace(/\/+$/, '');

  return `# ═══════════════════════════════════════════════════════════════
# Asuk Tech Polling Agent for MikroTik RouterOS v7+
# Paste this ENTIRE script into WinBox → Terminal
# ═══════════════════════════════════════════════════════════════

# Step 1: Create the polling script
/system script remove [find name="asuk-poll-agent"] 
/system script add name="asuk-poll-agent" policy=read,write,test,api source={
  :local appUrl "${cleanUrl}/api/mikrotik/polling"
  :local secret "${secret}"
  
  :do {
    # Fetch pending tasks from Vercel
    /tool fetch url=("\\$appUrl\\?action=fetch&secret=\\$secret") dst-path="asuk-tasks.txt" mode=https as-value
    :delay 1s
    :local content [/file get "asuk-tasks.txt" contents]
    /file remove "asuk-tasks.txt"
    
    # Check if there are tasks (look for "code" in response)
    :if ([:find \\$content "\\"code\\""] != nil) do={
      # Parse tasks - find each task block
      :local pos 0
      :while ([:find \\$content "\\"id\\":\\"" \\$pos] != nil) do={
        :local idStart ([:find \\$content "\\"id\\":\\"" \\$pos] + 5)
        :local idEnd [:find \\$content "\\"" \\$idStart]
        :local taskId [:pick \\$content \\$idStart \\$idEnd]
        
        :local codeStart ([:find \\$content "\\"code\\":\\"" \\$pos] + 7)
        :local codeEnd [:find \\$content "\\"" \\$codeStart]
        :local code [:pick \\$content \\$codeStart \\$codeEnd]
        
        :local passStart ([:find \\$content "\\"password\\":\\"" \\$pos] + 11)
        :local passEnd [:find \\$content "\\"" \\$passStart]
        :local pass [:pick \\$content \\$passStart \\$passEnd]
        
        :local profStart ([:find \\$content "\\"profile\\":\\"" \\$pos] + 10)
        :local profEnd [:find \\$content "\\"" \\$profStart]
        :local profile [:pick \\$content \\$profStart \\$profEnd]
        
        :local uptimeStart ([:find \\$content "\\"limit_uptime\\":\\"" \\$pos] + 16)
        :local uptimeEnd [:find \\$content "\\"" \\$uptimeStart]
        :local uptime [:pick \\$content \\$uptimeStart \\$uptimeEnd]
        
        :local commentStart ([:find \\$content "\\"comment\\":\\"" \\$pos] + 10)
        :local commentEnd [:find \\$content "\\"" \\$commentStart]
        :local comment [:pick \\$content \\$commentStart \\$commentEnd]
        
        :local sharedStart ([:find \\$content "\\"shared_users\\":\\"" \\$pos] + 15)
        :local sharedEnd [:find \\$content "\\"" \\$sharedStart]
        :local shared [:pick \\$content \\$sharedStart \\$sharedEnd]
        
        # Create the hotspot user on this router
        :do {
          /ip hotspot user add name=\\$code password=\\$pass profile=\\$profile limit-uptime=\\$uptime comment=\\$comment shared-users=\\$shared
          :log info ("Asuk Tech: Created voucher " . \\$code)
          
          # Report success back to Vercel
          :local postData ("{\\"secret\\":\\"\\$secret\\",\\"task_id\\":\\"\\$taskId\\",\\"status\\":\\"completed\\",\\"result\\":{\\"name\\":\\"\\$code\\"}}")
          /tool fetch url=\\$appUrl mode=https http-method=post http-header-field="Content-Type: application/json" http-data=\\$postData dst-path="asuk-result.txt" as-value
          /file remove "asuk-result.txt"
        } on-error={
          :log warning ("Asuk Tech: Failed to create voucher " . \\$code)
          :local postData ("{\\"secret\\":\\"\\$secret\\",\\"task_id\\":\\"\\$taskId\\",\\"status\\":\\"failed\\",\\"error_message\\":\\"Router creation failed\\"}")
          :do {
            /tool fetch url=\\$appUrl mode=https http-method=post http-header-field="Content-Type: application/json" http-data=\\$postData dst-path="asuk-result.txt" as-value
            /file remove "asuk-result.txt"
          } on-error={}
        }
        
        :set pos (\\$idEnd + 1)
      }
    }
  } on-error={
    :log warning "Asuk Tech: Polling failed - check internet connection"
  }
}

# Step 2: Create the scheduler to run every ${interval} seconds
/system scheduler remove [find name="asuk-poll-schedule"]
/system scheduler add name="asuk-poll-schedule" interval=${interval}s on-event="/system script run asuk-poll-agent" policy=read,write,test,api

:log info "Asuk Tech Polling Agent installed! Checking for vouchers every ${interval} seconds."
:put "✅ Asuk Tech Polling Agent installed successfully!"
:put "The router will now check for new voucher requests every ${interval} seconds."`;
}
