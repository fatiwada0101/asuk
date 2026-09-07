import { supabaseAdmin } from '@/lib/supabase-server.js';

// Cache credentials for 60 seconds to avoid hitting DB on every API call
let cachedCreds = null;
let cacheExpiry = 0;

export function invalidateAdminCredsCache() {
  cachedCreds = null;
  cacheExpiry = 0;
}

async function getAdminCreds() {
  const now = Date.now();
  if (cachedCreds && now < cacheExpiry) return cachedCreds;

  try {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'super_admin')
      .maybeSingle();

    if (data?.value) {
      cachedCreds = data.value;
      cacheExpiry = now + 60_000; // cache for 60s
      return cachedCreds;
    }
  } catch (err) {
    console.error('Failed to fetch admin credentials from DB:', err.message);
  }

  return null;
}

/**
 * Validates super-admin Basic Auth against credentials stored in Supabase.
 * Returns true if the request has valid admin credentials.
 */
export async function validateAdminAuth(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [user, ...passParts] = decoded.split(':');
    const pass = passParts.join(':');

    const creds = await getAdminCreds();
    if (!creds) return false;

    return user === creds.username && pass === creds.password;
  } catch {
    return false;
  }
}

/**
 * Returns a 401 JSON response for unauthorized requests.
 */
export function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
