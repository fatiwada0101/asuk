import { supabaseAdmin } from './supabase-server.js';

/**
 * Generate a collision-resistant 6-char voucher code with retry.
 * Checks Supabase vouchers table to ensure uniqueness.
 * 
 * @param {number} maxRetries - Number of attempts before falling back to timestamp-based code
 * @returns {Promise<string>} Unique voucher code like "WIFI-7K8M2P"
 */
export async function generateUniqueCode(maxRetries = 3) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let code = 'WIFI-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Check if code already exists in Supabase
    const { data: existing } = await supabaseAdmin
      .from('vouchers')
      .select('id')
      .eq('voucher_code', code)
      .maybeSingle();

    if (!existing) return code;
  }
  // Fallback: timestamp-based code (extremely unlikely to collide)
  return 'WIFI-' + Date.now().toString(36).toUpperCase().slice(-6);
}

/**
 * Generate a unique transaction reference for wallet purchases.
 * 
 * @returns {string} Transaction reference like "WALLET_1788869964567_A1B2"
 */
export function generateWalletTxRef() {
  return `WALLET_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}
