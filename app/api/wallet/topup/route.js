import { NextResponse } from 'next/server.js';
import { supabaseAdmin, broadcastWalletUpdate } from '@/lib/supabase-server.js';
import { validateUserAuth, userUnauthorizedResponse } from '@/lib/user-auth.js';

export async function POST(request) {
  try {
    const { amount, user_id, flw_ref, transaction_id } = await request.json();

    // 1. User Authentication Guard
    const authUser = await validateUserAuth(request);
    if (!authUser) {
      return userUnauthorizedResponse('Authentication required to top up wallet');
    }

    if (user_id && authUser.id !== user_id) {
      return NextResponse.json({ error: 'Unauthorized: Cannot top up another user wallet' }, { status: 403 });
    }
    const effectiveUserId = authUser.id;

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Invalid deposit amount' }, { status: 400 });
    }

    const numericAmount = Number(amount);
    const ref = flw_ref || `FLW_TOPUP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // 2. IDEMPOTENCY: Check if this ref was already processed
    const { data: existingTx } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('flw_ref', ref)
      .maybeSingle();

    if (existingTx) {
      const { data: walletData } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', effectiveUserId)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        amount: numericAmount,
        balance: Number(walletData?.balance || 0),
        reference: ref,
        message: 'Already processed',
        duplicate: true,
      });
    }

    // 3. Verify Payment Gateway (Flutterwave)
    let secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    try {
      const { data: flwSetting } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'flutterwave')
        .maybeSingle();

      if (flwSetting?.value?.secret_key) {
        secretKey = flwSetting.value.secret_key.trim();
      }
    } catch (e) {
      console.warn('Could not read flutterwave setting from DB:', e.message);
    }

    if (!secretKey) {
      return NextResponse.json({
        error: 'Payment verification service is not configured on the server. Please contact support.',
      }, { status: 503 });
    }

    if (!transaction_id) {
      return NextResponse.json({
        error: 'Missing Flutterwave transaction_id for payment verification.',
      }, { status: 400 });
    }

    try {
      const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!flwRes.ok) {
        return NextResponse.json({ error: 'Failed to verify transaction with payment gateway' }, { status: 400 });
      }

      const flwData = await flwRes.json();
      if (flwData.status !== 'success' || flwData.data?.status !== 'successful') {
        return NextResponse.json({ error: 'Payment was not successful or was declined by bank' }, { status: 400 });
      }

      const verifiedAmount = Number(flwData.data?.amount || 0);
      if (verifiedAmount < numericAmount) {
        return NextResponse.json({ error: `Verified deposit amount (₦${verifiedAmount}) does not match requested amount (₦${numericAmount})` }, { status: 400 });
      }

      if (flwData.data?.currency && flwData.data.currency !== 'NGN') {
        return NextResponse.json({ error: 'Invalid transaction currency' }, { status: 400 });
      }
    } catch (flwErr) {
      console.error('Flutterwave topup verify error:', flwErr);
      return NextResponse.json({ error: 'Unable to verify payment with gateway: ' + flwErr.message }, { status: 502 });
    }

    // 4. ATOMIC idempotency: Insert transaction first
    const { data: insertedTx, error: txInsertErr } = await supabaseAdmin
      .from('transactions')
      .upsert({
        user_id: effectiveUserId,
        type: 'wallet_topup',
        amount: numericAmount,
        status: 'successful',
        flw_ref: ref,
        payment_method: 'card',
      }, { onConflict: 'flw_ref', ignoreDuplicates: true })
      .select('id, user_id, amount, flw_ref, status, created_at')
      .maybeSingle();

    if (txInsertErr) {
      console.error('Error inserting transaction:', txInsertErr);
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
    }

    let finalBalance = 0;

    // Only credit wallet if newly inserted (not already credited by concurrent webhook)
    if (insertedTx?.id) {
      const { data: newBalance, error: rpcErr } = await supabaseAdmin
        .rpc('adjust_wallet_balance', {
          p_user_id: effectiveUserId,
          p_amount: numericAmount,
          p_operation: 'add',
        });

      if (rpcErr) {
        console.error('RPC wallet credit error:', rpcErr);
        return NextResponse.json({ error: 'Failed to update wallet balance' }, { status: 500 });
      }

      finalBalance = Number(newBalance);

      // Create notification
      try {
        await supabaseAdmin.from('notifications').insert({
          user_id: effectiveUserId,
          title: 'Wallet Topped Up',
          message: `₦${numericAmount.toLocaleString()} has been added to your wallet.`,
          type: 'wallet_credit',
        });
      } catch (e) {}

      // Realtime Broadcast
      await broadcastWalletUpdate(effectiveUserId, finalBalance, {
        amount: numericAmount,
        flw_ref: ref,
        transaction: insertedTx,
      });
    } else {
      const { data: wData } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', effectiveUserId)
        .maybeSingle();
      finalBalance = Number(wData?.balance || 0);
    }

    return NextResponse.json({
      success: true,
      amount: numericAmount,
      balance: finalBalance,
      reference: ref,
      message: `₦${numericAmount.toLocaleString()} added to wallet`,
    });
  } catch (error) {
    console.error('Topup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
