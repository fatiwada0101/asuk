import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Flutterwave Webhook Handler
 * POST /api/webhook/flutterwave
 *
 * Handles: charge.completed events
 * Verifies: verif-hash header against stored webhook secret
 * Actions: Credits wallet atomically based on tx_ref prefix
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const hash = request.headers.get('verif-hash');

    // 1. Fetch webhook secret from app_settings
    let webhookSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET || '';
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
      console.warn('Could not read webhook secret:', e.message);
    }

    // 2. Verify hash if secret is configured
    if (webhookSecret && hash !== webhookSecret) {
      console.warn('Webhook hash mismatch — rejecting');
      return NextResponse.json({ status: 'error', message: 'Invalid hash' }, { status: 401 });
    }

    // 3. Extract transaction data
    const eventData = body.data || body;
    const txRef = eventData.tx_ref || '';
    const status = eventData.status || '';
    const amount = Number(eventData.amount || 0);
    const customerEmail = eventData.customer?.email || '';

    // Only process successful charges
    if (status !== 'successful') {
      return NextResponse.json({ status: 'ignored', reason: 'not successful' });
    }

    // Idempotency is now handled atomically via upsert in the wallet credit section below.

    // 5. Process wallet top-up
    if (txRef.startsWith('FLW_TOPUP_') || txRef.startsWith('FLW_')) {
      // Find user by email
      let userId = null;
      if (customerEmail) {
        const { data: userData } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', customerEmail)
          .maybeSingle();

        if (userData) userId = userData.id;
      }

      if (userId) {
        // ATOMIC idempotency: attempt to insert the transaction record first.
        // If flw_ref already exists (unique constraint), the upsert silently skips
        // and returns no data — meaning we've already processed this webhook.
        const { data: insertedTx, error: txInsertErr } = await supabaseAdmin
          .from('transactions')
          .upsert({
            user_id: userId,
            type: 'wallet_topup',
            amount,
            status: 'successful',
            flw_ref: txRef,
          }, { onConflict: 'flw_ref', ignoreDuplicates: true })
          .select('id')
          .maybeSingle();

        if (txInsertErr) {
          console.error('Webhook transaction upsert error:', txInsertErr);
          return NextResponse.json({ status: 'error', message: 'Failed to record transaction' }, { status: 500 });
        }

        // Only credit wallet if this is a NEW transaction (not a duplicate delivery)
        if (insertedTx?.id) {
          const { error: rpcErr } = await supabaseAdmin
            .rpc('adjust_wallet_balance', {
              p_user_id: userId,
              p_amount: amount,
              p_operation: 'add',
            });

          if (rpcErr) {
            console.error('Webhook RPC error:', rpcErr);
            return NextResponse.json({ status: 'error', message: 'Failed to credit wallet' }, { status: 500 });
          }

          // Create notification
          await supabaseAdmin.from('notifications').insert({
            user_id: userId,
            title: 'Wallet Credited',
            message: `₦${amount.toLocaleString()} has been added to your wallet via Flutterwave.`,
            type: 'wallet_credit',
          }).catch(() => {});
        } else {
          console.log(`Webhook duplicate detected for flw_ref ${txRef} — skipping credit`);
        }
      }

      return NextResponse.json({ status: 'success', action: 'wallet_credit', amount });
    }

    return NextResponse.json({ status: 'success', message: 'Processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

// GET endpoint to verify the webhook URL is active
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'Flutterwave Webhook',
    endpoint: '/api/webhook/flutterwave',
    methods: ['POST'],
  });
}
