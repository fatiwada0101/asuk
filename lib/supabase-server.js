import { createClient } from '@supabase/supabase-js';

let _supabaseAdmin = null;

/**
 * Lazily initialised Supabase Admin client (service-role).
 * Deferred so that the module can be imported at build time
 * without crashing when env vars are not yet available.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    // Return placeholder client during build / missing env to prevent build crashes
    return createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseAdmin;
}

/**
 * Backward-compatible named export so existing `import { supabaseAdmin }` 
 * statements keep working — uses a Proxy that lazily resolves on first use.
 */
export const supabaseAdmin = new Proxy({}, {
  get(_target, prop) {
    return getSupabaseAdmin()[prop];
  },
});

/**
 * Dispatches a real-time broadcast event over the user's dedicated Supabase Realtime channel.
 * Guarantees that any connected browser tab/device instantaneously receives the new balance
 * and transaction info without waiting for polling or manual page reload.
 */
export async function broadcastWalletUpdate(userId, newBalance, details = {}) {
  if (!userId) return;
  try {
    const admin = getSupabaseAdmin();
    const chName = `realtime-wallet-${userId}`;
    const channel = admin.channel(chName);

    await new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          try {
            admin.removeChannel(channel);
            if (admin.getChannels().length === 0 && admin.realtime?.disconnect) {
              admin.realtime.disconnect();
            }
          } catch (e) {}
          resolve();
        }
      };

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.send({
              type: 'broadcast',
              event: 'wallet_update',
              payload: {
                user_id: userId,
                balance: Number(newBalance),
                ...details,
                timestamp: new Date().toISOString(),
              },
            });
          } catch (err) {
            console.warn('Realtime broadcast send error:', err?.message || err);
          } finally {
            done();
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          done();
        }
      });

      // Safety fallback: don't block API routes longer than 2.5s if realtime network stalls
      setTimeout(done, 2500);
    });
  } catch (err) {
    console.warn('broadcastWalletUpdate exception:', err?.message || err);
  }
}

