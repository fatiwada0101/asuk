import { supabaseAdmin } from './supabase-server.js';

/**
 * Generate a collision-resistant pure-numeric voucher code with retry.
 * Checks Supabase vouchers table to ensure uniqueness.
 * 
 * @param {number} maxRetries - Number of attempts before falling back to timestamp-based code
 * @returns {Promise<string>} Unique voucher code like "38472"
 */
export async function generateUniqueCode(maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Generate a 5-digit random number (10000–99999)
    const code = String(Math.floor(10000 + Math.random() * 90000));
    // Check if code already exists in Supabase
    const { data: existing } = await supabaseAdmin
      .from('vouchers')
      .select('id')
      .eq('voucher_code', code)
      .maybeSingle();

    if (!existing) return code;
  }
  // Fallback: timestamp-based numeric code (extremely unlikely to collide)
  return String(Date.now()).slice(-8);
}

/**
 * Generate a unique transaction reference for wallet purchases.
 * 
 * @returns {string} Transaction reference like "WALLET_1788869964567_A1B2"
 */
export function generateWalletTxRef() {
  return `WALLET_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}
