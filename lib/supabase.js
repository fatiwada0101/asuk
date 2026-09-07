import { createClient } from '@supabase/supabase-js';

let _supabase = null;

/**
 * Lazily initialised Supabase client (anon key — client-side safe).
 * Deferred so builds don't crash when env vars are absent.
 */
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return placeholder client during build / missing env to prevent build crashes
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }

  if (!_supabase) {
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/** Backward-compatible named export — lazy Proxy */
export const supabase = new Proxy({}, {
  get(_target, prop) {
    return getSupabase()[prop];
  },
});
