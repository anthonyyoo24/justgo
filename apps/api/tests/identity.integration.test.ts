import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bootstrapSchema,
  type BootstrapRequest,
  type TransferStart,
} from '@justgo/contracts';
import { createDatabase, poolOptions } from '../src/db/client.js';
import { readConfig } from '../src/config.js';
import { IdentityService, digest } from '../src/identity/service.js';
import { buildApp } from '../src/build-app.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '3' });
for (const url of [config.DATABASE_URL, migrationUrl]) {
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith('/justgo_test')
  )
    throw new Error(
      'Identity tests require the dedicated local justgo_test database',
    );
}
const db = createDatabase(config);
const admin = new Pool(
  poolOptions(readConfig({ ...process.env, DATABASE_URL: migrationUrl! })),
);
const service = new IdentityService(db.db, {
  rateKey: 'isolated-identity-integration-tests',
  rateLimit: 3,
});
const app = buildApp({
  logger: false,
  checkDatabase: async () => {},
  origins: ['http://localhost:8081'],
  identity: service,
});
const users = new Set<string>(),
  transfers = new Set<string>();
const secret = () => randomBytes(32).toString('hex');
const proposal = () => ({
  deviceId: randomUUID(),
  sessionId: randomUUID(),
  sessionToken: secret(),
});
const request = () => ({ ...proposal(), credential: secret() });
async function account(input = request()) {
  const session = await service.bootstrap(input);
  users.add(session.userId);
  return { input, session };
}
const transfer = (): TransferStart => ({
  id: randomUUID(),
  code: randomBytes(8).toString('hex').toUpperCase(),
  claimSecret: secret(),
  ...request(),
});
async function start(input = transfer()) {
  const result = await service.startTransfer(input);
  transfers.add(input.id);
  return { input, result };
}
let address = 0;
const post = (
  path: string,
  payload: unknown,
  token?: string,
  ip = `127.1.0.${++address}`,
) =>
  app.inject({
    method: 'POST',
    url: `/v1/identity${path}`,
    payload: payload as object,
    remoteAddress: ip,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
afterAll(async () => {
  try {
    for (const id of transfers)
      await admin.query('delete from justgo.device_transfers where id=$1', [
        id,
      ]);
    for (const id of users) {
      for (const table of [
        'device_transfers',
        'device_sessions',
        'recovery_credentials',
        'devices',
      ])
        await admin.query(`delete from justgo.${table} where user_id=$1`, [id]);
      await admin.query('delete from justgo.users where id=$1', [id]);
    }
    // Rate keys contain only a test-specific HMAC namespace; don't truncate shared tables.
  } finally {
    await app.close();
    await Promise.all([db.pool.end(), admin.end()]);
  }
});

describe('identity protocol through the restricted runtime', () => {
  it('erases legacy approval values and cancels old transfers when the forward migration runs', async () => {
    const client = await admin.connect();
    const table = `migration_fixture_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('begin');
      await client.query(
        `create table justgo.${table} (verification text not null, cancelled_at timestamptz)`,
      );
      await client.query(
        `insert into justgo.${table} values ('012345', null), ('999999', now()-interval '1 day')`,
      );
      const migration = await readFile(
        new URL('../drizzle/0003_transfer_verification.sql', import.meta.url),
        'utf8',
      );
      await client.query(
        migration.replaceAll('"justgo"."device_transfers"', `justgo.${table}`),
      );
      const result = await client.query(
        `select verification, cancelled_at, verification_attempts from justgo.${table}`,
      );
      expect(result.rows).toHaveLength(2);
      for (const row of result.rows) {
        expect(row.verification).toBe('0'.repeat(64));
        expect(row.cancelled_at).toBeInstanceOf(Date);
        expect(row.verification_attempts).toBe(0);
      }
      await expect(
        client.query(
          `insert into justgo.${table} (verification) values ('123456')`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
  it('keeps verification out of inspection and prevents binding with the transfer code alone', async () => {
    const owner = await account(),
      attacker = await account(),
      t = await start();
    const inspection = await post(
      '/transfers/inspect',
      { code: t.input.code },
      attacker.input.sessionToken,
    );
    expect(inspection.statusCode).toBe(200);
    expect(inspection.json()).toEqual({
      id: t.input.id,
      expiresAt: t.result.expiresAt,
      status: 'waiting',
    });
    const missingProof = await post(
      '/transfers/approve',
      { code: t.input.code },
      attacker.input.sessionToken,
    );
    expect(missingProof.statusCode).toBe(400);
    const wrong = t.result.verification === '000000' ? '000001' : '000000';
    const rejected = await post(
      '/transfers/approve',
      { code: t.input.code, verification: wrong },
      attacker.input.sessionToken,
    );
    expect(rejected.statusCode).toBe(409);
    const pending = await admin.query(
      'select user_id, verification_attempts from justgo.device_transfers where id=$1',
      [t.input.id],
    );
    expect(pending.rows[0]).toEqual({
      user_id: null,
      verification_attempts: 1,
    });
    const approved = await post(
      '/transfers/approve',
      { code: t.input.code, verification: t.result.verification },
      owner.input.sessionToken,
    );
    expect(approved.statusCode).toBe(200);
    const redeemed = await service.redeemTransfer(
      t.input.code,
      t.input.claimSecret,
    );
    expect(redeemed.userId).toBe(owner.session.userId);
    expect(redeemed.userId).not.toBe(attacker.session.userId);
  });
  it('stores only a keyed verifier, replays the same digits and fails safely after a server key rotation', async () => {
    const t = await start({ ...transfer(), claimSecret: 'a'.repeat(64) });
    const records = await admin.query(
      'select verification from justgo.device_transfers where id=$1',
      [t.input.id],
    );
    expect(t.result.verification).toMatch(/^\d{6}$/);
    expect(records.rows[0].verification).toMatch(/^[a-f0-9]{64}$/);
    expect(records.rows[0].verification).not.toBe(t.result.verification);
    expect(records.rows[0].verification).not.toBe(
      digest(t.result.verification),
    );
    expect(await service.startTransfer(t.input)).toEqual(t.result);
    const rotated = new IdentityService(db.db, {
      rateKey: 'a-different-isolated-test-server-key',
    });
    await expect(rotated.startTransfer(t.input)).rejects.toMatchObject({
      code: 'CREDENTIAL_REJECTED',
    });
    const fresh = transfer();
    // Same claimant with a different server key: storage alone cannot derive the code.
    fresh.claimSecret = t.input.claimSecret;
    const second = await rotated.startTransfer(fresh);
    transfers.add(fresh.id);
    expect(second.verification).not.toBe(t.result.verification);
  });
  it('commits and bounds failed verification attempts across accounts and concurrent requests', async () => {
    const a = await account(),
      b = await account(),
      t = await start();
    const wrong = t.result.verification === '000000' ? '000001' : '000000';
    const results = await Promise.allSettled(
      Array.from({ length: 7 }, (_, i) =>
        service.approveTransfer(
          i % 2 ? a.input.sessionToken : b.input.sessionToken,
          t.input.code,
          wrong,
        ),
      ),
    );
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    const record = await admin.query(
      'select verification_attempts, cancelled_at, user_id from justgo.device_transfers where id=$1',
      [t.input.id],
    );
    expect(record.rows[0].verification_attempts).toBe(5);
    expect(record.rows[0].cancelled_at).toBeInstanceOf(Date);
    expect(record.rows[0].user_id).toBeNull();
    await expect(
      service.approveTransfer(
        a.input.sessionToken,
        t.input.code,
        t.result.verification,
      ),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
    await expect(
      service.redeemTransfer(t.input.code, t.input.claimSecret),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  });
  it('stores hashes only and recovers exactly one account/session after lost and concurrent bootstrap responses', async () => {
    const input = request();
    const results = await Promise.all([
      service.bootstrap(input),
      service.bootstrap(input),
      service.bootstrap(input),
    ]);
    users.add(results[0]!.userId);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    const records = await admin.query(
      'select digest from justgo.recovery_credentials where user_id=$1',
      [results[0]!.userId],
    );
    expect(records.rows).toEqual([{ digest: digest(input.credential) }]);
    const sessions = await admin.query(
      'select digest from justgo.device_sessions where user_id=$1',
      [results[0]!.userId],
    );
    expect(sessions.rows).toEqual([{ digest: digest(input.sessionToken) }]);
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
    expect((await service.me(second.sessionToken)).userId).toBe(
      a.session.userId,
    );
    await expect(
      service.renew(a.input.sessionToken, proposal()),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
  it('rejects changed-input reuse, forged ownership fields, weak tokens and invalid auth', async () => {
    const a = await account();
    await expect(
      service.bootstrap({ ...a.input, sessionToken: secret() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      (await post('/bootstrap', { ...request(), userId: a.session.userId }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post('/bootstrap', { ...request(), credential: 'password' }))
        .statusCode,
    ).toBe(400);
    expect((await app.inject('/v1/identity/me')).statusCode).toBe(401);
    expect(
      bootstrapSchema.safeParse({ ...a.input, sessionToken: 'x'.repeat(64) })
        .success,
    ).toBe(false);
  });
  it('does not bootstrap unknown recovery credentials or resurrect revoked/deleted ones', async () => {
    await expect(service.bootstrap(request(), false)).rejects.toMatchObject({
      code: 'CREDENTIAL_REJECTED',
    });
    const a = await account();
    const credential = (await service.listCredentials(a.input.sessionToken))
      .credentials[0]!;
    await service.revokeCredential(a.input.sessionToken, credential.id);
    await expect(
      service.bootstrap({ ...a.input, ...proposal() }),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
    expect((await service.me(a.input.sessionToken)).userId).toBe(
      a.session.userId,
    );
    const b = await account();
    await service.retireAccount(b.input.sessionToken);
    await expect(
      service.bootstrap({ ...b.input, ...proposal() }),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
    await expect(service.me(b.input.sessionToken)).rejects.toMatchObject({
      code: 'CREDENTIAL_REJECTED',
    });
  });
  it('enforces expiry, per-device revocation, and independent revocable recovery keys', async () => {
    const a = await account();
    const key = {
      id: randomUUID(),
      credential: secret(),
      kind: 'key' as const,
    };
    await service.addCredential(a.input.sessionToken, key);
    await service.addCredential(a.input.sessionToken, key);
    const recovered = { ...proposal(), credential: key.credential };
    await service.bootstrap(recovered, false);
    await service.revokeDevice(a.input.sessionToken, recovered.deviceId);
    await expect(service.me(recovered.sessionToken)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    await service.revokeCredential(a.input.sessionToken, key.id);
    await expect(
      service.bootstrap({ ...proposal(), credential: key.credential }, false),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
    await admin.query(
      "update justgo.device_sessions set expires_at=now()-interval '1 second' where id=$1",
      [a.session.sessionId],
    );
    await expect(service.me(a.input.sessionToken)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    const fresh = { ...proposal(), credential: a.input.credential };
    expect((await service.bootstrap(fresh, false)).userId).toBe(
      a.session.userId,
    );
  });
  it('isolates users at both API and RLS levels, including pooled transaction cleanup', async () => {
    const a = await account(),
      b = await account();
    const cred = (await service.listCredentials(b.input.sessionToken))
      .credentials[0]!;
    expect(
      (await post(`/credentials/${cred.id}/revoke`, {}, a.input.sessionToken))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          `/devices/${b.input.deviceId}/revoke`,
          {},
          a.input.sessionToken,
        )
      ).statusCode,
    ).toBe(404);
    const pairs = await Promise.all([
      service.listDevices(a.input.sessionToken),
      service.listDevices(b.input.sessionToken),
    ]);
    expect(pairs[0].devices.map((d) => d.id)).toEqual([a.input.deviceId]);
    expect(pairs[1].devices.map((d) => d.id)).toEqual([b.input.deviceId]);
    for (const table of [
      'users',
      'devices',
      'recovery_credentials',
      'device_sessions',
      'device_transfers',
      'identity_rate_buckets',
    ])
      expect(
        (await db.pool.query(`select * from justgo.${table}`)).rows,
      ).toHaveLength(0);
    expect(
      (await db.pool.query('select justgo.current_user_id() as owner')).rows[0]
        .owner,
    ).toBeNull();
    await expect(
      db.pool.query('delete from justgo.recovery_credentials'),
    ).rejects.toThrow();
  });
  it('requires existing-device approval, claimant proof and matching verification; redemption retries are one-use', async () => {
    const a = await account(),
      t = await start();
    expect(await service.startTransfer(t.input)).toEqual(t.result);
    await expect(
      service.redeemTransfer(t.input.code, t.input.claimSecret),
    ).rejects.toMatchObject({ code: 'TRANSFER_PENDING' });
    await expect(
      service.approveTransfer(a.input.sessionToken, t.input.code, 'xxxxxx'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await service.approveTransfer(
      a.input.sessionToken,
      t.input.code,
      t.result.verification,
    );
    await expect(
      service.redeemTransfer(t.input.code, secret()),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
    const results = await Promise.all([
      service.redeemTransfer(t.input.code, t.input.claimSecret),
      service.redeemTransfer(t.input.code, t.input.claimSecret),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.userId).toBe(a.session.userId);
    expect((await service.me(t.input.sessionToken)).userId).toBe(
      a.session.userId,
    );
    await expect(
      service.startTransfer({ ...t.input, sessionToken: secret() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      service.approveTransfer(
        a.input.sessionToken,
        t.input.code,
        t.result.verification,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('rejects expired/cancelled transfers and cross-account approval', async () => {
    const a = await account(),
      b = await account(),
      t = await start();
    await service.approveTransfer(
      a.input.sessionToken,
      t.input.code,
      t.result.verification,
    );
    await expect(
      service.approveTransfer(
        b.input.sessionToken,
        t.input.code,
        t.result.verification,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await service.cancelTransfer(a.input.sessionToken, t.input.code);
    await expect(
      service.redeemTransfer(t.input.code, t.input.claimSecret),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
    const expired = await start();
    await admin.query(
      "update justgo.device_transfers set expires_at=now()-interval '1 second' where id=$1",
      [expired.input.id],
    );
    await expect(
      service.inspectTransfer(a.input.sessionToken, expired.input.code),
    ).rejects.toMatchObject({ code: 'TRANSFER_EXPIRED' });
  });
  it('atomically rate limits across instances and does not trust spoofed forwarding headers', async () => {
    const ip = `test-${randomUUID()}`,
      input: BootstrapRequest = request();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('/recover', input, undefined, ip)),
    );
    expect(results.filter((r) => r.statusCode === 429)).toHaveLength(2);
    expect(
      results.find((r) => r.statusCode === 429)!.headers['retry-after'],
    ).toBe('600');
    const again = await app.inject({
      method: 'POST',
      url: '/v1/identity/recover',
      remoteAddress: ip,
      headers: { 'x-forwarded-for': '1.2.3.4' },
      payload: input,
    });
    expect(again.statusCode).toBe(429);
    expect(again.body).not.toContain(input.credential);
  });
  it('supports browser CORS and returns no-store responses without returning bearer material', async () => {
    const input = request();
    const result = await post('/bootstrap', input);
    expect(result.statusCode).toBe(200);
    users.add(result.json().userId);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).not.toContain(input.credential);
    expect(result.body).not.toContain(input.sessionToken);
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/identity/bootstrap',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-methods']).toContain('POST');
  });
});

describe('phase three account access boundary', () => {
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
});
