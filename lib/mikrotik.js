import { supabaseAdmin } from '@/lib/supabase-server';

// Allow local router self-signed HTTPS certificates
if (typeof process !== 'undefined' && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
      const cfg = data.value;
      const ip = cfg.ip.trim();
      const port = cfg.port || (cfg.use_ssl === false ? '80' : '443');
      const protocol = cfg.use_ssl === false || port === '80' || port === 80 ? 'http' : 'https';

      // Check if MikroTik is genuinely configured:
      // Default placeholder 192.168.88.1 with empty password is not configured
      const isDefaultIp = ip === '192.168.88.1';
      const hasPassword = Boolean(cfg.pass && cfg.pass.trim().length > 0);
      const isConfigured = Boolean(
        cfg.configured === true ||
        (ip && !isDefaultIp) ||
        (isDefaultIp && hasPassword)
      );

      return {
        ip,
        user: cfg.user ? cfg.user.trim() : 'admin',
        pass: cfg.pass || '',
        port: String(port),
        protocol,
        isConfigured,
      };
    }
  } catch (err) {
    console.warn('Could not read MikroTik config from DB, using env:', err.message);
  }

  // Fallback to environment variables
  if (process.env.MIKROTIK_IP && process.env.MIKROTIK_IP.trim()) {
    const ip = process.env.MIKROTIK_IP.trim();
    const port = process.env.MIKROTIK_PORT || '443';
    const user = (process.env.MIKROTIK_USER || 'admin').trim();
    const pass = process.env.MIKROTIK_PASS || '';
    const protocol = process.env.MIKROTIK_PROTOCOL || (port === '80' ? 'http' : 'https');
    const isConfigured = Boolean(ip !== '192.168.88.1' || (pass && pass.trim().length > 0));
    return { ip, user, pass, port: String(port), protocol, isConfigured };
  }

  return {
    ip: '192.168.88.1',
    user: 'admin',
    pass: '',
    port: '443',
    protocol: 'https',
    isConfigured: false,
  };
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
  const url = `${config.protocol}://${config.ip}:${config.port}${cleanEndpoint}`;
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
 * Test connection to MikroTik router
 * Queries /rest/system/resource
 */
export async function testConnection() {
  const { url, headers, config } = await buildMikroTikRequest('/rest/system/resource');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      throw new Error(`Authentication failed: Invalid username or password for ${config.user}@${config.ip}`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Router returned status ${res.status}: ${text || res.statusText}`);
    }

    const data = await res.json();
    return {
      success: true,
      router: {
        model: data['board-name'] || data.platform || 'MikroTik Router',
        version: data.version || 'RouterOS v7+',
        uptime: data.uptime || 'unknown',
        cpuLoad: data['cpu-load'] !== undefined ? `${data['cpu-load']}%` : 'unknown',
        freeMemory: data['free-memory'] ? `${Math.round(data['free-memory'] / 1024 / 1024)} MB` : 'unknown',
        ip: config.ip,
        port: config.port,
        protocol: config.protocol,
      },
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Connection timeout: Router at ${config.ip}:${config.port} did not respond within 6 seconds. Ensure REST API is enabled in IP -> Services -> www-ssl or www.`);
    }
    throw new Error(`Cannot connect to MikroTik (${config.ip}:${config.port}): ${err.message}`);
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

