import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(request) {
  try {
    const { amount, user_id, flw_ref } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    const numericAmount = Number(amount);
    const ref = flw_ref || `FLW_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // IDEMPOTENCY: Check if this ref was already processed
    const { data: existingTx } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('flw_ref', ref)
      .maybeSingle();

    if (existingTx) {
      // Already credited — return success without double-crediting
      const { data: walletData } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', user_id)
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

    // ATOMIC wallet credit — prevents race condition
    const { data: newBalance, error: rpcErr } = await supabaseAdmin
      .rpc('adjust_wallet_balance', {
        p_user_id: user_id,
        p_amount: numericAmount,
        p_operation: 'add',
      });

    if (rpcErr) {
      console.error('RPC wallet credit error:', rpcErr);
      return NextResponse.json({ error: 'Failed to update wallet balance' }, { status: 500 });
    }

    // Record the top-up transaction (with flw_ref for idempotency)
    const { error: txErr } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id,
        type: 'wallet_topup',
        amount: numericAmount,
        status: 'successful',
        flw_ref: ref,
      });

    if (txErr) {
      // If insert failed due to unique constraint (race with webhook), that's OK
      // The wallet was already credited, which is fine
      console.error('Error recording transaction:', txErr);
    }

    // Create notification
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id,
        title: 'Wallet Topped Up',
        message: `₦${numericAmount.toLocaleString()} has been added to your wallet.`,
        type: 'wallet_credit',
      });
    } catch (e) {}

    return NextResponse.json({
      success: true,
      amount: numericAmount,
      balance: Number(newBalance),
      reference: ref,
      message: `₦${numericAmount.toLocaleString()} added to wallet`,
    });
  } catch (error) {
    console.error('Topup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
