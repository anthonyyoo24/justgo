import { apiRequest } from '../request.js';
import { service, app, account } from './fixtures/identity.js';

import { accessResponseSchema } from '@justgo/contracts';
import { expect, it } from 'vitest';

import { buildApp } from '../../src/build-app.js';

it('requires a real active session and fails closed without billing', async () => {
  const missing = await apiRequest(app, { url: '/v1/access' });
  expect(missing.statusCode).toBe(401);
  const owner = await account();
  const response = await apiRequest(app, {
    url: '/v1/access',
    headers: { authorization: `Bearer ${owner.input.sessionToken}` },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ status: 'unavailable' });
  expect(response.headers['cache-control']).toBe('no-store');
  await service.revokeDevice(owner.input.sessionToken, owner.input.deviceId);
  const revoked = await apiRequest(app, {
    url: '/v1/access',
    headers: { authorization: `Bearer ${owner.input.sessionToken}` },
  });
  expect(revoked.statusCode).toBe(401);
});

it('executes the entitlement reader inside the verified owner transaction and isolates two accounts', async () => {
  const a = await account(),
    b = await account();
  const { sql } = await import('drizzle-orm');
  const isolated = buildApp({
    logger: false,
    checkDatabase: async () => {},
    identity: service,
    entitlementReader: async (tx) => {
      const result = await tx.execute(sql`select id from justgo.users`);
      expect(result.rows).toHaveLength(1);
      const userId = (result.rows[0] as { id: string }).id;
      return userId === a.session.userId
        ? {
            status: 'verified',
            checkedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }
        : { status: 'unpaid', checkedAt: new Date().toISOString() };
    },
  });

  for (const [owner, status] of [
    [a, 'verified'],
    [b, 'unpaid'],
  ] as const) {
    const response = await apiRequest(isolated, {
      url: '/v1/access',
      headers: { authorization: `Bearer ${owner.input.sessionToken}` },
    });
    expect(response.json().status).toBe(status);
  }
});

it('rejects stale paid access and does not accept request premium flags as authorization', async () => {
  const owner = await account();
  const isolated = buildApp({
    logger: false,
    checkDatabase: async () => {},
    identity: service,
    entitlementReader: async () => ({
      status: 'verified',
      checkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1).toISOString(),
    }),
  });

  const result = await apiRequest(isolated, {
    url: '/v1/access?premium=true',
    headers: { authorization: `Bearer ${owner.input.sessionToken}` },
  });
  expect(result.json().status).toBe('unpaid');
});

it('keeps paid access open until its Apple expiry and drops the paid source once it lapses', async () => {
  const owner = await account();
  const headers = { authorization: `Bearer ${owner.input.sessionToken}` };
  let expiresIn = 86_400_000;
  const paid = (source: 'subscription' | 'guest_subscription') => ({
    status: 'verified' as const,
    source,
    productId: 'com.anthonyyoo.justgo.pro.annual',
    checkedAt: new Date(Date.now() - 3_600_000).toISOString(),
    expiresAt: new Date(Date.now() + expiresIn).toISOString(),
  });
  const api = buildApp({
    logger: false,
    checkDatabase: async () => {},
    identity: service,
    entitlementReader: async () => paid('subscription'),
    guestAccessReader: async () => paid('guest_subscription'),
  });
  const gated = [
    '/v1/challenges',
    '/v1/progress/summary?timeZone=UTC',
    '/v1/guest/challenges',
  ];
  expect(
    (await apiRequest(api, { url: '/v1/access', headers })).json(),
  ).toMatchObject({
    status: 'verified',
    source: 'subscription',
    productId: 'com.anthonyyoo.justgo.pro.annual',
  });
  for (const url of gated)
    expect((await apiRequest(api, { url, headers })).statusCode).toBe(200);

  expiresIn = -1;
  const lapsed = (await apiRequest(api, { url: '/v1/access', headers })).json();
  expect(lapsed).toEqual({ status: 'unpaid', checkedAt: expect.any(String) });
  expect(accessResponseSchema.safeParse(lapsed).success).toBe(true);
  for (const url of gated)
    expect((await apiRequest(api, { url, headers })).statusCode).toBe(403);
});
