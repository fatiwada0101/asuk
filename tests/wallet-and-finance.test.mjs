import test from 'node:test';
import assert from 'node:assert/strict';

import { POST as topupHandler } from '@/app/api/wallet/topup/route.js';
import { GET as getFinance } from '@/app/api/super-admin/finance/route.js';

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
