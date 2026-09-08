import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { isMikroTikConfigured, getHotspotUsers } from '@/lib/mikrotik';

/**
 * GET /api/vouchers/validate?code=XXXX
 *
 * Lightweight voucher validation for the captive portal login page.
 * Checks whether a voucher code exists and is still active.
 * Does NOT return full telemetry — use /api/vouchers/status for that.
 *
 * Returns:
 *   200: { valid: true, plan_name, ... }
 *   400: { valid: false, error: 'Missing code' }
 *   404: { valid: false, error: 'Not found' }
 *   410: { valid: false, error: 'Expired' }
 *   500: { valid: false, error: 'Server error' }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code')?.trim();

    if (!code) {
      return NextResponse.json({
        valid: false,
        error: 'Please enter a voucher code.',
      }, { status: 400 });
    }

    // 1. Check Supabase vouchers table
    const { data: dbVoucher } = await supabaseAdmin
      .from('vouchers')
      .select('voucher_code, profile_name, price, is_used, created_at')
      .eq('voucher_code', code)
      .maybeSingle();

    // 2. If found in DB, check if expired based on plan duration
    if (dbVoucher) {
      // Estimate total plan duration from profile name
      let totalDurationSec = 86400; // default 24h
      const durationMatch = (dbVoucher.profile_name || '').toLowerCase();
      if (durationMatch.includes('1 hour') || durationMatch.includes('1h')) totalDurationSec = 3600;
      else if (durationMatch.includes('3 hour') || durationMatch.includes('3h')) totalDurationSec = 10800;
      else if (durationMatch.includes('7 day') || durationMatch.includes('7d') || durationMatch.includes('week')) totalDurationSec = 604800;
      else if (durationMatch.includes('30 day') || durationMatch.includes('30d') || durationMatch.includes('month')) totalDurationSec = 2592000;

      // Check wall-clock expiry as a rough estimate
      // The actual session timer on MikroTik is the source of truth, but this
      // prevents obviously expired codes from being submitted to the router
      if (dbVoucher.created_at) {
        const createdAt = new Date(dbVoucher.created_at).getTime();
        const elapsedSec = Math.floor((Date.now() - createdAt) / 1000);

        // Add a 10% grace period to account for paused-time mode
        if (elapsedSec > totalDurationSec * 1.1) {
          return NextResponse.json({
            valid: false,
            error: 'This voucher has expired. Please purchase a new plan.',
            code,
            plan_name: dbVoucher.profile_name,
            is_expired: true,
          }, { status: 410 });
        }
      }

      // Voucher exists and is not expired
      return NextResponse.json({
        valid: true,
        code: dbVoucher.voucher_code,
        plan_name: dbVoucher.profile_name,
      });
    }

    // 3. Not in Supabase — check MikroTik hotspot users (pre-generated vouchers)
    const configured = await isMikroTikConfigured();
    if (configured) {
      try {
        const users = await getHotspotUsers();
        const routerUser = users.find((u) => u.name === code);

        if (routerUser) {
          // Check if the user has remaining uptime
          if (routerUser['limit-uptime'] && routerUser.uptime) {
            const limitSec = parseDurationToSeconds(routerUser['limit-uptime']);
            const usedSec = parseDurationToSeconds(routerUser.uptime);
            if (limitSec > 0 && usedSec >= limitSec) {
              return NextResponse.json({
                valid: false,
                error: 'This voucher has expired. Please purchase a new plan.',
                code,
                is_expired: true,
              }, { status: 410 });
            }
          }

          return NextResponse.json({
            valid: true,
            code,
            plan_name: routerUser.profile || 'Wi-Fi Hotspot Pass',
            source: 'router',
          });
        }
      } catch (err) {
        console.warn('MikroTik user lookup during validation failed (non-fatal):', err.message);
        // Fall through to "not found" — don't let router errors block validation
      }
    }

    // 4. Not found anywhere
    return NextResponse.json({
      valid: false,
      error: 'This voucher code was not found. Please double-check your code or purchase a new plan.',
      code,
    }, { status: 404 });
  } catch (err) {
    console.error('Voucher validation error:', err);
    return NextResponse.json({
      valid: false,
      error: 'Could not validate voucher code. Please try again.',
    }, { status: 500 });
  }
}

// Helper: parse MikroTik uptime/duration strings like "1h30m20s", "1d2h", "45m" into seconds
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

  if (totalSeconds === 0 && !isNaN(str)) {
    totalSeconds = parseInt(str, 10);
  }

  return totalSeconds;
}
