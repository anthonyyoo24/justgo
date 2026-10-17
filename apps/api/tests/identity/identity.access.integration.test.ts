import { service, app, account } from './fixtures/identity.js';

import { expect, it } from 'vitest';

import { buildApp } from '../../src/build-app.js';

it('requires a real active session and fails closed without billing', async () => {
  const missing = await app.inject({ url: '/v1/access' });
  expect(missing.statusCode).toBe(401);
  const owner = await account();
  const response = await app.inject({
    url: '/v1/access',
    headers: { authorization: `Bearer ${owner.input.sessionToken}` },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ status: 'unavailable' });
  expect(response.headers['cache-control']).toBe('no-store');
  await service.revokeDevice(owner.input.sessionToken, owner.input.deviceId);
  const revoked = await app.inject({
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
  try {
    for (const [owner, status] of [
      [a, 'verified'],
      [b, 'unpaid'],
    ] as const) {
      const response = await isolated.inject({
        url: '/v1/access',
        headers: { authorization: `Bearer ${owner.input.sessionToken}` },
      });
      expect(response.json().status).toBe(status);
    }
  } finally {
    await isolated.close();
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
  try {
    const result = await isolated.inject({
      url: '/v1/access?premium=true',
      headers: { authorization: `Bearer ${owner.input.sessionToken}` },
    });
    expect(result.json().status).toBe('unpaid');
  } finally {
    await isolated.close();
  }
});
