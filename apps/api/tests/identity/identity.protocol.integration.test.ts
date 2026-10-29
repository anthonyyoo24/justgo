import { apiRequest } from '../request.js';
import {
  admin,
  rateKey,
  service,
  app,
  users,
  retryAfterSeconds,
  secret,
  proposal,
  request,
  account,
  start,
  post,
} from './fixtures/identity.js';
import { createHmac, randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { type BootstrapRequest, type TransferStart } from '@justgo/contracts';

it('rejects malformed or mixed session proofs and all retired identity action routes', async () => {
  for (const body of [
    request(),
    { kind: 'unknown', ...request() },
    { kind: 'recovery', ...proposal() },
    { kind: 'renewal', ...request() },
    { kind: 'transfer', code: 'ABCDEF0123456789' },
    { kind: 'transfer', code: 'ABCDEF0123456789', claimSecret: 'weak' },
  ]) {
    const result = await post('/sessions', body);
    expect(result.statusCode).toBe(400);
    expect(result.json().code).toBe('INVALID_REQUEST');
  }
  for (const path of [
    'bootstrap',
    'recover',
    'renew',
    'transfers/start',
    'transfers/inspect',
    'transfers/approve',
    'transfers/redeem',
    'transfers/cancel',
    `devices/${randomUUID()}/revoke`,
    `credentials/${randomUUID()}/revoke`,
  ]) {
    expect(
      (
        await apiRequest(app, {
          method: 'POST',
          url: `/v1/identity/${path}`,
          payload: request(),
        })
      ).statusCode,
    ).toBe(404);
  }
  for (const path of ['me', 'devices', 'credentials']) {
    expect((await apiRequest(app, `/v1/identity/${path}`)).statusCode).toBe(
      404,
    );
  }
});

it('creates and replays ordinary accounts without legal receipts and exposes no agreement routes', async () => {
  const input = request();
  const created = await post('/sessions', { kind: 'bootstrap', ...input });
  expect(created.statusCode).toBe(200);
  const session = created.json<{ userId: string }>();
  users.add(session.userId);
  expect(
    (await post('/sessions', { kind: 'bootstrap', ...input })).json(),
  ).toEqual(session);
  expect(created.body).not.toMatch(/acceptance|termsVersion|acceptedAt/);
  expect(
    (
      await admin.query(
        "select to_regclass('justgo.account_acceptances') as table_name",
      )
    ).rows[0].table_name,
  ).toBeNull();
  const rejected = await post('/sessions', {
    kind: 'bootstrap',
    ...input,
    acceptance: { termsVersion: 'legacy' },
  });
  expect(rejected.statusCode).toBe(400);
  expect(rejected.json().code).toBe('INVALID_REQUEST');
  for (const method of ['GET', 'PUT'] as const) {
    const response = await apiRequest(app, {
      method,
      url: '/v1/account/acceptance',
      headers: { authorization: `Bearer ${input.sessionToken}` },
      ...(method === 'PUT' ? { payload: { termsVersion: 'legacy' } } : {}),
    });
    expect(response.statusCode).toBe(404);
  }
  expect(await service.me(input.sessionToken)).toEqual(session);
});

it('rate limits full receiver cancellation proofs before mutating the transfer', async () => {
  const t = await start(),
    ip = `receiver-${randomUUID()}`;
  const cancel = (payload: TransferStart) =>
    apiRequest(app, {
      method: 'DELETE',
      url: `/v1/transfers/${t.input.id}`,
      payload,
      remoteAddress: ip,
    });
  for (let attempt = 0; attempt < 3; attempt++)
    expect(
      (await cancel({ ...t.input, claimSecret: secret() })).statusCode,
    ).toBe(401);
  expect((await cancel(t.input)).statusCode).toBe(429);
  expect((await service.startTransfer(t.input)).status).toBe('waiting');
});

it('recovers separate device sessions and rotates one without invalidating the other', async () => {
  const a = await account(),
    second = { ...proposal(), credential: a.input.credential };
  expect((await service.bootstrap(second, false)).userId).toBe(
    a.session.userId,
  );
  const next = proposal();
  const renewed = await service.renew(a.input.sessionToken, next);
  expect(await service.renew(a.input.sessionToken, next)).toEqual(renewed);
  await expect(service.me(a.input.sessionToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  expect((await service.me(second.sessionToken)).userId).toBe(a.session.userId);
  await expect(
    service.renew(a.input.sessionToken, proposal()),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
});

it('atomically rate limits across instances and does not trust spoofed forwarding headers', async () => {
  const ip = `test-${randomUUID()}`,
    input: BootstrapRequest = request();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      post('/sessions', { kind: 'recovery', ...input }, undefined, ip),
    ),
  );
  expect(results.filter((r) => r.statusCode === 429)).toHaveLength(2);
  retryAfterSeconds(
    results.find((r) => r.statusCode === 429)!.headers['retry-after'],
  );
  const again = await apiRequest(app, {
    method: 'POST',
    url: '/v1/sessions',
    remoteAddress: ip,
    headers: { 'x-forwarded-for': '1.2.3.4' },
    payload: { kind: 'recovery', ...input },
  });
  expect(again.statusCode).toBe(429);
  expect(again.body).not.toContain(input.credential);
});

it('returns the remaining bucket seconds, then resets the expired window atomically', async () => {
  const ip = `remaining-window-${randomUUID()}`;
  const key = createHmac('sha256', rateKey)
    .update(`recovery:${ip}`)
    .digest('hex');
  const input = { kind: 'recovery', ...request() };
  try {
    for (let attempt = 0; attempt < 3; attempt++)
      expect((await post('/sessions', input, undefined, ip)).statusCode).toBe(
        401,
      );
    await admin.query(
      "update justgo.identity_rate_buckets set window_start=now()-interval '9 minutes 30 seconds' where key=$1",
      [key],
    );
    const limited = await post('/sessions', input, undefined, ip);
    expect(limited.statusCode).toBe(429);
    const remaining = retryAfterSeconds(limited.headers['retry-after']);
    expect(remaining).toBeLessThanOrEqual(30);
    expect(limited.body).not.toContain(input.credential);
    await admin.query(
      "update justgo.identity_rate_buckets set window_start=now()-interval '11 minutes' where key=$1",
      [key],
    );
    const reset = await post('/sessions', input, undefined, ip);
    expect(reset.statusCode).toBe(401);
    expect(reset.headers['retry-after']).toBeUndefined();
    expect(
      (
        await admin.query(
          'select count from justgo.identity_rate_buckets where key=$1',
          [key],
        )
      ).rows[0].count,
    ).toBe(1);
  } finally {
    await admin.query('delete from justgo.identity_rate_buckets where key=$1', [
      key,
    ]);
  }
});

it('supports browser CORS and returns no-store responses without returning bearer material', async () => {
  const input = request();
  const result = await post('/sessions', { kind: 'bootstrap', ...input });
  expect(result.statusCode).toBe(200);
  users.add(result.json<{ userId: string }>().userId);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(result.body).not.toContain(input.credential);
  expect(result.body).not.toContain(input.sessionToken);
  const preflight = await apiRequest(app, {
    method: 'OPTIONS',
    url: '/v1/sessions',
    headers: {
      origin: 'http://localhost:8081',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  expect(preflight.statusCode).toBe(204);
  expect(preflight.headers['access-control-allow-methods']).toContain('POST');
});
