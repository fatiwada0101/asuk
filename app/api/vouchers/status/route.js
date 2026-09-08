import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getActiveSessions, getHotspotUsers, isMikroTikConfigured } from '@/lib/mikrotik';

// Helper: parse MikroTik uptime or duration strings like "1h30m20s", "1d2h", "45m", "30s" into total seconds
function parseDurationToSeconds(str) {
  if (!str) return 0;
  if (typeof str === 'number') return str;

  let totalSeconds = 0;
  const days = str.match(/(\d+)d/);
  const hours = str.match(/(\d+)h/);
  const mins = str.match(/(\d+)m/);
  const secs = str.match(/(\d+)s/);

  if (days) totalSeconds += parseInt(days[1], 10) * 86400;
  if (hours) totalSeconds += parseInt(hours[1], 10) * 3600;
  if (mins) totalSeconds += parseInt(mins[1], 10) * 60;
  if (secs) totalSeconds += parseInt(secs[1], 10);

  // Fallback for simple integer seconds
  if (totalSeconds === 0 && !isNaN(str)) {
    totalSeconds = parseInt(str, 10);
  }

  return totalSeconds;
}

// Helper: format seconds to "HH:MM:SS" or "Xd Xh Xm"
function formatSeconds(secs) {
  if (secs <= 0) return '00:00:00';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  if (d > 0) {
    return `${d}d ${h}h ${m}m`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Helper: format bytes to MB / GB
function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code')?.trim();

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Missing voucher code parameter' }, { status: 400 });
    }

    // 1. Cross-reference Supabase vouchers table
    const { data: dbVoucher } = await supabaseAdmin
      .from('vouchers')
      .select('*')
      .eq('voucher_code', code)
      .maybeSingle();

    // 2. Query MikroTik router if configured
    let routerSession = null;
    let routerUser = null;
    let routerOnline = false;

    const configured = await isMikroTikConfigured();
    if (configured) {
      try {
        // Query active hotspot sessions
        const sessions = await getActiveSessions();
        routerOnline = true;
        routerSession = sessions.find((s) => s.user === code);

        // If not in active sessions, query hotspot users to find historical uptime & limit
        if (!routerSession) {
          try {
            const users = await getHotspotUsers();
            routerUser = users.find((u) => u.name === code);
          } catch (e) {
            // Hotspot user lookup non-fatal
          }
        }
      } catch (err) {
        console.warn('MikroTik API error during voucher status lookup:', err.message);
      }
    }

    // 3. VALIDATION: If voucher not found anywhere, return explicit invalid response
    if (!dbVoucher && !routerSession && !routerUser) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid voucher code. Please check your code and try again.',
        code,
      }, { status: 404 });
    }

    // 4. Compute telemetry
    const isConnected = !!routerSession;
    let uptimeSeconds = 0;
    let limitUptimeSeconds = 86400; // default 24h
    let secondsRemaining = null;
    let bytesIn = 0;
    let bytesOut = 0;
    let ipAddress = null;
    let macAddress = null;
    let planName = dbVoucher?.profile_name || 'Wi-Fi Hotspot Pass';

    if (routerSession) {
      uptimeSeconds = parseDurationToSeconds(routerSession.uptime);
      bytesIn = Number(routerSession['bytes-in']) || 0;
      bytesOut = Number(routerSession['bytes-out']) || 0;
      ipAddress = routerSession.address || null;
      macAddress = routerSession['mac-address'] || null;

      if (routerSession['session-time-left']) {
        secondsRemaining = parseDurationToSeconds(routerSession['session-time-left']);
      }
    } else if (routerUser) {
      uptimeSeconds = parseDurationToSeconds(routerUser.uptime);
      bytesIn = Number(routerUser['bytes-in']) || 0;
      bytesOut = Number(routerUser['bytes-out']) || 0;

      if (routerUser['limit-uptime']) {
        limitUptimeSeconds = parseDurationToSeconds(routerUser['limit-uptime']);
        secondsRemaining = Math.max(0, limitUptimeSeconds - uptimeSeconds);
      }
    }

    // Calculate duration for this voucher
    let totalDurationSec = 86400; // default 24h
    const durationMatch = (dbVoucher?.duration || dbVoucher?.profile_name || '').toLowerCase();
    if (durationMatch.includes('1 hour') || durationMatch.includes('1h')) totalDurationSec = 3600;
    else if (durationMatch.includes('3 hour') || durationMatch.includes('3h')) totalDurationSec = 10800;
    else if (durationMatch.includes('6 hour') || durationMatch.includes('6h')) totalDurationSec = 21600;
    else if (durationMatch.includes('12 hour') || durationMatch.includes('12h')) totalDurationSec = 43200;
    else if (durationMatch.includes('7 day') || durationMatch.includes('7d') || durationMatch.includes('week')) totalDurationSec = 604800;
    else if (durationMatch.includes('30 day') || durationMatch.includes('30d') || durationMatch.includes('month')) totalDurationSec = 2592000;

    if (!limitUptimeSeconds) limitUptimeSeconds = totalDurationSec;

    // Fallback calculation if router does not specify remaining time
    if (secondsRemaining === null) {
      if (dbVoucher && !dbVoucher.is_used && uptimeSeconds === 0) {
        // Unused voucher — 100% of duration remains and has not expired!
        secondsRemaining = totalDurationSec;
        uptimeSeconds = 0;
      } else if (dbVoucher?.expires_at) {
        const expiresAt = new Date(dbVoucher.expires_at).getTime();
        secondsRemaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      } else if (dbVoucher?.is_used && dbVoucher?.created_at) {
        const createdAt = new Date(dbVoucher.created_at).getTime();
        const elapsedSec = Math.floor((Date.now() - createdAt) / 1000);
        secondsRemaining = Math.max(0, totalDurationSec - elapsedSec);
        if (uptimeSeconds === 0) uptimeSeconds = Math.min(elapsedSec, totalDurationSec);
      } else {
        secondsRemaining = totalDurationSec;
      }
    }

    const totalSeconds = limitUptimeSeconds || 86400;
    const percentRemaining = Math.max(0, Math.min(100, Math.round((secondsRemaining / totalSeconds) * 100)));
    const isExpired = (dbVoucher?.status === 'expired') || (secondsRemaining <= 0 && dbVoucher?.is_used);
    const isExpiringSoon = !isExpired && (secondsRemaining < 1800 || percentRemaining <= 25); // < 30m or < 25%

    // 5. VALIDATION: If voucher is expired, return explicit expired response
    if (isExpired && !isConnected) {
      // Mark status as expired in DB
      if (dbVoucher && dbVoucher.status !== 'expired') {
        supabaseAdmin
          .from('vouchers')
          .update({ status: 'expired' })
          .eq('voucher_code', code)
          .then(() => {})
          .catch(() => {});
      }

      return NextResponse.json({
        valid: false,
        error: 'This voucher has expired. Please purchase a new plan.',
        code,
        plan_name: planName,
        is_expired: true,
        seconds_remaining: 0,
        formatted_time_left: '00:00:00',
      }, { status: 410 });
    }

    return NextResponse.json({
      valid: true,
      success: true,
      code,
      plan_name: planName,
      price: dbVoucher?.price || null,
      is_connected: isConnected,
      is_expired: isExpired,
      is_expiring_soon: isExpiringSoon,
      seconds_remaining: secondsRemaining,
      formatted_time_left: formatSeconds(secondsRemaining),
      uptime_seconds: uptimeSeconds,
      formatted_uptime: formatSeconds(uptimeSeconds),
      limit_uptime_seconds: limitUptimeSeconds,
      percent_remaining: percentRemaining,
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      total_bytes: bytesIn + bytesOut,
      download_formatted: formatBytes(bytesIn),
      upload_formatted: formatBytes(bytesOut),
      total_data_formatted: formatBytes(bytesIn + bytesOut),
      ip_address: ipAddress,
      mac_address: macAddress,
      router_online: routerOnline,
      created_at: dbVoucher?.created_at || null,
    });
  } catch (err) {
    console.error('Error fetching voucher session status:', err);
    return NextResponse.json({ valid: false, error: 'Failed to retrieve voucher status: ' + err.message }, { status: 500 });
  }
}
