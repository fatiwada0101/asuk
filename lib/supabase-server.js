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
