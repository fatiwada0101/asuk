import test from 'node:test';
import assert from 'node:assert/strict';

import { validateUserAuth, userUnauthorizedResponse } from '@/lib/user-auth.js';
import { POST as purchaseHandler } from '@/app/api/purchase/route.js';

test('validateUserAuth - returns null when Authorization header is missing', async () => {
  const req = new Request('http://localhost:3000/api/purchase', { method: 'POST' });
  const user = await validateUserAuth(req);
  assert.equal(user, null);
});

test('validateUserAuth - returns null when Authorization header is not Bearer', async () => {
  const req = new Request('http://localhost:3000/api/purchase', {
    method: 'POST',
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  const user = await validateUserAuth(req);
  assert.equal(user, null);
});

test('userUnauthorizedResponse - returns 401 JSON with proper message', async () => {
  const res = userUnauthorizedResponse('Custom unauthorized message');
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, 'Custom unauthorized message');
});

test('POST /api/purchase - rejects unauthenticated purchase request with 401', async () => {
  const req = new Request('http://localhost:3000/api/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price: 500 }),
  });
  const res = await purchaseHandler(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.match(data.error, /Authentication required|Unauthorized/i);
});

test('POST /api/purchase - rejects unauthorized wallet deduction when user_id is provided without valid bearer token', async () => {
  const req = new Request('http://localhost:3000/api/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: 'plan-1-day',
      plan_name: '1 Day Pass',
      price: 500,
      user_id: 'user-attacker-1234',
    }),
  });
  const res = await purchaseHandler(req);
  assert.equal(res.status, 401, 'Must reject wallet payment without valid user auth session');
  const data = await res.json();
  assert.match(data.error, /Authentication required|Unauthorized/i);
});

test('POST /api/purchase - rejects fake bearer token with 401', async () => {
  const req = new Request('http://localhost:3000/api/purchase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer invalid.fake.token.here',
    },
    body: JSON.stringify({
      plan_id: 'plan-1-day',
      plan_name: '1 Day Pass',
      price: 500,
      user_id: 'user-attacker-1234',
    }),
  });
  const res = await purchaseHandler(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.match(data.error, /Authentication required|Unauthorized/i);
});
