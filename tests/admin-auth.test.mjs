import test from 'node:test';
import assert from 'node:assert/strict';

// Test admin auth helper
import { validateAdminAuth, invalidateAdminCredsCache, unauthorizedResponse } from '@/lib/admin-auth.js';

// Test admin route handlers
import { GET as getAdminStats } from '@/app/api/admin/stats/route.js';
import { GET as getActiveSessions } from '@/app/api/mikrotik/active-sessions/route.js';
import { GET as getHotspotUsers, DELETE as deleteHotspotUser, PATCH as patchHotspotUser } from '@/app/api/mikrotik/hotspot-users/route.js';
import { GET as getHotspotProfiles, PUT as putHotspotProfile, PATCH as patchHotspotProfile, DELETE as deleteHotspotProfile } from '@/app/api/mikrotik/hotspot-profiles/route.js';
import { GET as getSystemHealth } from '@/app/api/mikrotik/system-health/route.js';
import { GET as getTestConnection } from '@/app/api/mikrotik/test-connection/route.js';

test('validateAdminAuth - rejects requests without Authorization header', async () => {
  const req = new Request('http://localhost:3000/api/admin/stats');
  const isValid = await validateAdminAuth(req);
  assert.equal(isValid, false, 'Should be false when header is missing');
});

test('validateAdminAuth - rejects requests with non-Basic header', async () => {
  const req = new Request('http://localhost:3000/api/admin/stats', {
    headers: { Authorization: 'Bearer some-random-token' },
  });
  const isValid = await validateAdminAuth(req);
  assert.equal(isValid, false, 'Should reject Bearer token for admin Basic auth');
});

test('validateAdminAuth - rejects invalid credentials', async () => {
  const badCreds = Buffer.from('wronguser:wrongpass').toString('base64');
  const req = new Request('http://localhost:3000/api/admin/stats', {
    headers: { Authorization: `Basic ${badCreds}` },
  });
  const isValid = await validateAdminAuth(req);
  assert.equal(isValid, false, 'Should reject incorrect credentials');
});

test('unauthorizedResponse - returns 401 JSON response', async () => {
  const res = unauthorizedResponse();
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error, 'Unauthorized');
});

test('Admin Route Handlers - reject unauthenticated GET /api/admin/stats with 401', async () => {
  const req = new Request('http://localhost:3000/api/admin/stats');
  const res = await getAdminStats(req);
  assert.equal(res.status, 401, 'Must reject unauthenticated admin stats');
});

test('Admin Route Handlers - reject unauthenticated GET /api/mikrotik/active-sessions with 401', async () => {
  const req = new Request('http://localhost:3000/api/mikrotik/active-sessions');
  const res = await getActiveSessions(req);
  assert.equal(res.status, 401, 'Must reject unauthenticated active sessions');
});

test('Admin Route Handlers - reject unauthenticated /api/mikrotik/hotspot-users with 401', async () => {
  const getReq = new Request('http://localhost:3000/api/mikrotik/hotspot-users');
  const getRes = await getHotspotUsers(getReq);
  assert.equal(getRes.status, 401);

  const delReq = new Request('http://localhost:3000/api/mikrotik/hotspot-users', {
    method: 'DELETE',
    body: JSON.stringify({ user_id: '123' }),
  });
  const delRes = await deleteHotspotUser(delReq);
  assert.equal(delRes.status, 401);

  const patchReq = new Request('http://localhost:3000/api/mikrotik/hotspot-users', {
    method: 'PATCH',
    body: JSON.stringify({ user_id: '123', profile: 'default' }),
  });
  const patchRes = await patchHotspotUser(patchReq);
  assert.equal(patchRes.status, 401);
});

test('Admin Route Handlers - reject unauthenticated /api/mikrotik/hotspot-profiles with 401', async () => {
  const getReq = new Request('http://localhost:3000/api/mikrotik/hotspot-profiles');
  const getRes = await getHotspotProfiles(getReq);
  assert.equal(getRes.status, 401);

  const putReq = new Request('http://localhost:3000/api/mikrotik/hotspot-profiles', {
    method: 'PUT',
    body: JSON.stringify({ name: 'test' }),
  });
  const putRes = await putHotspotProfile(putReq);
  assert.equal(putRes.status, 401);

  const patchReq = new Request('http://localhost:3000/api/mikrotik/hotspot-profiles', {
    method: 'PATCH',
    body: JSON.stringify({ profile_id: '123' }),
  });
  const patchRes = await patchHotspotProfile(patchReq);
  assert.equal(patchRes.status, 401);

  const delReq = new Request('http://localhost:3000/api/mikrotik/hotspot-profiles', {
    method: 'DELETE',
    body: JSON.stringify({ profile_id: '123' }),
  });
  const delRes = await deleteHotspotProfile(delReq);
  assert.equal(delRes.status, 401);
});

test('Admin Route Handlers - reject unauthenticated GET /api/mikrotik/system-health with 401', async () => {
  const req = new Request('http://localhost:3000/api/mikrotik/system-health');
  const res = await getSystemHealth(req);
  assert.equal(res.status, 401);
});

test('Admin Route Handlers - reject unauthenticated GET /api/mikrotik/test-connection with 401', async () => {
  const req = new Request('http://localhost:3000/api/mikrotik/test-connection');
  const res = await getTestConnection(req);
  assert.equal(res.status, 401);
});
