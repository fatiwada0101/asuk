import { supabaseAdmin } from '@/lib/supabase-server.js';

/**
 * Validates user session from the Authorization header (Bearer token).
 * Uses Supabase Admin auth.getUser(token) to cryptographically verify the JWT.
 * 
 * @param {Request} request 
 * @returns {Promise<Object|null>} The authenticated user object or null if invalid/missing
 */
export async function validateUserAuth(request) {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split(' ')[1]?.trim();
    if (!token) return null;

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return null;
    }

    return user;
  } catch (err) {
    console.error('Error validating user token:', err.message);
    return null;
  }
}

/**
 * Returns a 401 response for unauthenticated user requests
 */
export function userUnauthorizedResponse(message = 'Authentication required') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
