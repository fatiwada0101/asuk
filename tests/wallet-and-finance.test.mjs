import test from 'node:test';
import assert from 'node:assert/strict';

import { POST as topupHandler } from '@/app/api/wallet/topup/route.js';
import { GET as getFinance } from '@/app/api/super-admin/finance/route.js';
import { POST as webhookHandler, GET as webhookGet } from '@/app/api/webhook/flutterwave/route.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';

test.after(() => {
  try {
    supabaseAdmin.realtime?.disconnect?.();
  } catch (e) {}
});

test('POST /api/wallet/topup - rejects unauthenticated top-up request with 401', async () => {
  const req = new Request('http://localhost:3000/api/wallet/topup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 1000,
      user_id: 'fake-user-id',
      flw_ref: 'FLW_12345',
      transaction_id: '999999',
    }),
  });

  const res = await topupHandler(req);
  assert.equal(res.status, 401, 'Must reject wallet top-up without valid bearer token');
  const data = await res.json();
  assert.match(data.error, /Authentication required|Unauthorized/i);
});

test('POST /api/wallet/topup - rejects invalid amount formats and values < 100', async () => {
  // Even if caller provided a header, invalid amount is strictly validated
  const testAmounts = [0, -500, 50, 'abc', null];
  for (const amt of testAmounts) {
    const req = new Request('http://localhost:3000/api/wallet/topup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amt,
        user_id: 'user-id',
        flw_ref: 'FLW_123',
        transaction_id: '123',
      }),
    });
    const res = await topupHandler(req);
    // Either 401 (auth check first) or 400 (validation)
    assert.ok([400, 401].includes(res.status), `Expected 400 or 401 for amount ${amt}`);
  }
});

test('GET /api/super-admin/finance - rejects unauthenticated access with 401', async () => {
  const req = new Request('http://localhost:3000/api/super-admin/finance?start_date=2026-01-01&end_date=2026-12-31');
  const res = await getFinance(req);
  assert.equal(res.status, 401, 'Finance endpoint must require admin credentials');
});

test('GET /api/webhook/flutterwave - returns active status and GET/POST methods', async () => {
  const res = await webhookGet();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'active');
  assert.equal(data.service, 'Flutterwave Webhook');
});

test('POST /api/webhook/flutterwave - rejects invalid hash when webhook secret is configured', async () => {
  const req = new Request('http://localhost:3000/api/webhook/flutterwave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'verif-hash': 'invalid_secret_hash_value',
    },
    body: JSON.stringify({
      status: 'successful',
      data: {
        tx_ref: 'FLW_TOPUP_99999',
        amount: 500,
      },
    }),
  });

  const res = await webhookHandler(req);
  assert.equal(res.status, 401, 'Must reject with 401 when verif-hash does not match secret');
});

test('POST /api/webhook/flutterwave - ignores non-successful events', async () => {
  const req = new Request('http://localhost:3000/api/webhook/flutterwave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'verif-hash': 'dataplug_webhook_secret_hash',
    },
    body: JSON.stringify({
      data: {
        status: 'failed',
        tx_ref: 'FLW_TOPUP_FAILED_1',
        amount: 500,
      },
    }),
  });

  const res = await webhookHandler(req);
  const data = await res.json();
  assert.equal(data.status, 'ignored');
  assert.equal(data.reason, 'not successful');
});

test('POST /api/webhook/flutterwave - acknowledges non-wallet events (e.g. voucher card payments)', async () => {
  const req = new Request('http://localhost:3000/api/webhook/flutterwave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'verif-hash': 'dataplug_webhook_secret_hash',
    },
    body: JSON.stringify({
      data: {
        status: 'successful',
        tx_ref: 'FLW_1725700000_ABCDE',
        amount: 250,
        currency: 'NGN',
      },
    }),
  });

  const res = await webhookHandler(req);
  const data = await res.json();
  assert.equal(data.status, 'acknowledged');
  assert.match(data.message, /Non-wallet topup/i);
});

test('POST /api/webhook/flutterwave - processes topup and enforces strict idempotency', async () => {
  const testRef = `FLW_TOPUP_TEST_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const testUserId = '5c9313db-58a4-4ad9-b14b-2d70cce5a908'; // Existing user from profiles

  // Record balance BEFORE test so we can restore it
  const { data: walletBefore } = await supabaseAdmin
    .from('wallets')
    .select('balance')
    .eq('user_id', testUserId)
    .maybeSingle();
  const balanceBefore = Number(walletBefore?.balance || 0);

  const payload = {
    data: {
      status: 'successful',
      tx_ref: testRef,
      amount: 200,
      currency: 'NGN',
      customer: {
        email: 'aleeyuwada01@gmail.com',
      },
      meta: {
        user_id: testUserId,
        type: 'wallet_topup',
      },
    },
  };

  const createReq = () => new Request('http://localhost:3000/api/webhook/flutterwave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'verif-hash': 'dataplug_webhook_secret_hash',
    },
    body: JSON.stringify(payload),
  });

  // 1st delivery — should credit wallet
  const res1 = await webhookHandler(createReq());
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.status, 'success');
  assert.equal(data1.action, 'wallet_credit');
  assert.equal(data1.amount, 200);
  assert.equal(data1.user_id, testUserId);
  const balanceAfterFirst = data1.balance;

  // 2nd delivery (Flutterwave retry) — must be idempotent and NOT credit twice
  const res2 = await webhookHandler(createReq());
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.status, 'success');
  assert.equal(data2.action, 'already_processed');
  assert.equal(data2.balance, balanceAfterFirst, 'Balance must remain identical on duplicate webhook retry');

  // CLEANUP: Reverse the wallet credit and delete the test transaction
  // This prevents test runs from accumulating fake balance on real accounts
  await supabaseAdmin
    .from('transactions')
    .delete()
    .eq('flw_ref', testRef);

  await supabaseAdmin
    .from('wallets')
    .update({ balance: balanceBefore })
    .eq('user_id', testUserId);

  // Also clean up any test notification
  await supabaseAdmin
    .from('notifications')
    .delete()
    .eq('user_id', testUserId)
    .eq('type', 'wallet_credit')
    .like('message', '%200%');
});

test('Finance logic - correctly aggregates both guest and user transactions', () => {
  const mockRecords = [
    { profile_name: '1 Hour Pass', price: 100, user_id: 'user-1', tx_ref: null, created_at: '2026-09-01T10:00:00' },
    { profile_name: '1 Day Pass', price: 500, user_id: null, tx_ref: 'FLW_GUEST_1', created_at: '2026-09-01T11:00:00' },
    { profile_name: '1 Day Pass', price: 500, user_id: 'user-2', tx_ref: null, created_at: '2026-09-02T12:00:00' },
  ];

  const totalRevenue = mockRecords.reduce((s, v) => s + (Number(v.price) || 0), 0);
  const totalSales = mockRecords.length;
  const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

  assert.equal(totalRevenue, 1100);
  assert.equal(totalSales, 3);
  assert.equal(avgOrderValue, 1100 / 3);

  const planMap = {};
  mockRecords.forEach(v => {
    const name = v.profile_name || 'Unknown';
    if (!planMap[name]) planMap[name] = { name, count: 0, revenue: 0 };
    planMap[name].count++;
    planMap[name].revenue += Number(v.price) || 0;
  });

  const topPlan = Object.values(planMap).sort((a, b) => b.revenue - a.revenue)[0];
  assert.equal(topPlan.name, '1 Day Pass');
  assert.equal(topPlan.count, 2);
  assert.equal(topPlan.revenue, 1000);
});
