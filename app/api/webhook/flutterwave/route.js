import { NextResponse } from 'next/server.js';
import { supabaseAdmin, broadcastWalletUpdate } from '@/lib/supabase-server.js';

/**
 * Flutterwave Webhook Handler
 * POST /api/webhook/flutterwave
 *
 * Handles: charge.completed events
 * Verifies: verif-hash header against stored webhook secret
 * Actions: Credits wallet atomically and broadcasts real-time balance updates
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const hash = request.headers.get('verif-hash');

    // 1. Fetch webhook secret from app_settings
    let webhookSecret = (process.env.FLUTTERWAVE_WEBHOOK_SECRET || '').trim();
    try {
      const { data: flwSetting } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'flutterwave')
        .maybeSingle();

      if (flwSetting?.value?.webhook_secret) {
        webhookSecret = flwSetting.value.webhook_secret.trim();
      }
    } catch (e) {
      console.warn('Could not read webhook secret from settings:', e.message);
    }

    // 2. Verify hash if secret is configured
    if (webhookSecret && hash !== webhookSecret) {
      console.warn('Webhook hash mismatch — rejecting unauthorized delivery');
      return NextResponse.json({ status: 'error', message: 'Invalid hash' }, { status: 401 });
    }

    // 3. Extract transaction data
    const eventData = body.data || body;
    const txRef = (eventData.tx_ref || '').trim();
    const status = (eventData.status || '').toLowerCase();
    const amount = Number(eventData.amount || 0);
    const currency = (eventData.currency || 'NGN').toUpperCase();
    const customerEmail = (eventData.customer?.email || eventData.customer_email || '').trim().toLowerCase();

    const metaUserId = eventData.meta?.user_id || eventData.meta?.userId || eventData['meta.user_id'];
    const metaType = eventData.meta?.type || eventData['meta.type'];

    // Only process successful charges
    if (status !== 'successful' && status !== 'completed') {
      return NextResponse.json({ status: 'ignored', reason: 'not successful' });
    }

    if (currency && currency !== 'NGN') {
      return NextResponse.json({ status: 'ignored', reason: 'unsupported currency' });
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ status: 'ignored', reason: 'invalid amount' });
    }

    // 4. Strictly identify wallet top-up vs voucher purchase
    const isWalletTopup = txRef.startsWith('FLW_TOPUP_') || metaType === 'wallet_topup';

    if (!isWalletTopup) {
      // Direct voucher card purchases or other non-topup transactions
      return NextResponse.json({
        status: 'acknowledged',
        message: 'Non-wallet topup event received',
        tx_ref: txRef,
      });
    }

    // 5. Resolve user ID:
    // Strategy A: Direct meta user_id (attached during FlutterwaveCheckout)
    let userId = null;
    if (metaUserId) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', metaUserId)
        .maybeSingle();

      if (profile?.id) {
        userId = profile.id;
      }
    }

    // Strategy B: Match customer email against auth.users
    if (!userId && customerEmail) {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
        const matched = authData?.users?.find(
          (u) => (u.email || '').trim().toLowerCase() === customerEmail
        );
        if (matched?.id) {
          userId = matched.id;
        }
      } catch (authErr) {
        console.warn('Webhook user lookup by email error:', authErr.message);
      }
    }

    if (!userId) {
      console.warn(`Webhook: Unable to map customer "${customerEmail}" or meta "${metaUserId}" to an existing user.`);
      return NextResponse.json({
        status: 'ignored',
        reason: 'user not found',
        tx_ref: txRef,
      });
    }

    // 6. ATOMIC IDEMPOTENCY:
    // Insert into transactions with unique constraint on flw_ref.
    // If flw_ref already exists, upsert with ignoreDuplicates returns no row,
    // guaranteeing no duplicate wallet credit occurs.
    const { data: insertedTx, error: txInsertErr } = await supabaseAdmin
      .from('transactions')
      .upsert({
        user_id: userId,
        type: 'wallet_topup',
        amount,
        status: 'successful',
        flw_ref: txRef,
        payment_method: 'card',
      }, { onConflict: 'flw_ref', ignoreDuplicates: true })
      .select('id, user_id, amount, flw_ref, status, created_at')
      .maybeSingle();

    if (txInsertErr) {
      console.error('Webhook transaction upsert error:', txInsertErr);
      return NextResponse.json({ status: 'error', message: 'Failed to record transaction' }, { status: 500 });
    }

    let finalBalance = null;

    if (insertedTx?.id) {
      // First-time processing: adjust wallet balance
      const { data: newBalance, error: rpcErr } = await supabaseAdmin
        .rpc('adjust_wallet_balance', {
          p_user_id: userId,
          p_amount: amount,
          p_operation: 'add',
        });

      if (rpcErr) {
        console.error('Webhook RPC adjust_wallet_balance error:', rpcErr);
        return NextResponse.json({ status: 'error', message: 'Failed to credit wallet' }, { status: 500 });
      }

      finalBalance = Number(newBalance);

      // In-app notification
      try {
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: userId,
            title: 'Wallet Credited',
            message: `₦${amount.toLocaleString()} has been added to your wallet via Flutterwave.`,
            type: 'wallet_credit',
          });
      } catch (notifErr) {
        console.warn('Webhook notification insert error:', notifErr?.message || notifErr);
      }

      // Instant Real-time Broadcast to all user's active client tabs
      await broadcastWalletUpdate(userId, finalBalance, {
        amount,
        flw_ref: txRef,
        transaction: insertedTx,
      });

      console.log(`Webhook: Successfully credited ₦${amount} to user ${userId}. New balance: ₦${finalBalance}`);
    } else {
      console.log(`Webhook: flw_ref ${txRef} already processed (idempotency hit)`);
      const { data: currentWallet } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();
      finalBalance = Number(currentWallet?.balance || 0);
    }

    return NextResponse.json({
      status: 'success',
      action: insertedTx?.id ? 'wallet_credit' : 'already_processed',
      amount,
      balance: finalBalance,
      user_id: userId,
      tx_ref: txRef,
    });
  } catch (error) {
    console.error('Webhook unhandled error:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

// GET endpoint to verify webhook health and reachability
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'Flutterwave Webhook',
    endpoint: '/api/webhook/flutterwave',
    methods: ['POST', 'GET'],
  });
}
