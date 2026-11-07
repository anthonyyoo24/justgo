import { describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  bootstrapSchema,
  secretSchema,
  syncPageQuerySchema,
  transferCodeSchema,
  transferStartSchema,
} from '@justgo/contracts';
import { buildApp } from '../../src/build-app.js';
import { readConfig } from '../../src/config.js';
import { IdentityService, digest } from '../../src/identity/service.js';
import { apiRequest } from '../request.js';

describe('identity input and deployment configuration', () => {
  it.each([
    { url: '/v1/auth/session', method: 'GET', limit: 120 },
    { url: '/v1/sessions/current', method: 'GET', limit: 120 },
    {
      url: '/v1/sessions',
      method: 'POST',
      payload: { kind: 'recovery' },
      limit: 30,
    },
  ])(
    'keys the $method $url rate bucket by the entry client address and ignores x-vercel-forwarded-for',
    async ({ limit, ...request }) => {
      const dialect = new PgDialect();
      const buckets = new Map<unknown, number>();
      const db = drizzle.mock();
      type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
      const execute = vi.fn(async (statement: SQL) => {
        const { sql, params } = dialect.sqlToQuery(statement);
        if (!sql.includes('insert into justgo.identity_rate_buckets'))
          return { rows: [] };
        const count = (buckets.get(params[0]) ?? 0) + 1;
        buckets.set(params[0], count);
        return { rows: [{ count, retry_after_seconds: 600 }] };
      });
      vi.spyOn(db, 'transaction').mockImplementation((work) =>
        work({ execute } as unknown as Tx),
      );
      let address = '198.51.100.7';
      const app = buildApp({
        logger: false,
        checkDatabase: async () => {},
        identity: new IdentityService(db, {
          rateKey: 'client-address-fixture',
        }),
        clientAddress: () => address,
      });
      const send = (forged: number) =>
        apiRequest(app, {
          ...request,
          headers: { 'x-vercel-forwarded-for': `203.0.113.${forged}` },
        });
      for (let count = 1; count <= limit; count++)
        expect((await send(count)).statusCode).not.toBe(429);
      const limited = await send(limit + 1);
      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBe('600');
      address = '198.51.100.8';
      expect((await send(limit + 2)).statusCode).not.toBe(429);
    },
  );
  it('keeps stored digests as lowercase-hex SHA-256 so legacy proofs and revoked-proof tombstones still match', () => {
    expect(digest('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(digest(secretSchema.parse('0123456789abcdef'.repeat(4)))).toBe(
      'a8ae6e6ee929abea3afcfc5258c8ccd6f85273e0d4626d26c7279f3250f77c8e',
    );
    expect(digest(transferCodeSchema.parse('0123456789ABCDEF'))).toBe(
      '2125b2c332b1113aae9bfc5e9f7e3b4c91d828cb942c2df1eeb02502eccae9e9',
    );
  });
  it('requires an independent deployment secret and bounded identity settings', () => {
    expect(() =>
      readConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://runtime@db.example/app',
      }),
    ).toThrow('IDENTITY_RATE_LIMIT_KEY');
    expect(() => readConfig({ IDENTITY_SESSION_HOURS: '0' })).toThrow();
    expect(() => readConfig({ IDENTITY_TRANSFER_MINUTES: '999' })).toThrow();
  });
  it('bounds independent write and export budgets without granting an unlimited mode', () => {
    expect(readConfig({})).toMatchObject({
      ACTIVITY_WRITE_RATE_LIMIT: 600,
      ACCOUNT_EXPORT_RATE_LIMIT: 3000,
    });
    expect(
      readConfig({
        ACTIVITY_WRITE_RATE_LIMIT: '100',
        ACCOUNT_EXPORT_RATE_LIMIT: '200',
      }),
    ).toMatchObject({
      ACTIVITY_WRITE_RATE_LIMIT: 100,
      ACCOUNT_EXPORT_RATE_LIMIT: 200,
    });
    for (const field of [
      'ACTIVITY_WRITE_RATE_LIMIT',
      'ACCOUNT_EXPORT_RATE_LIMIT',
    ])
      for (const value of ['0', '10001', '1.5', 'not-a-number'])
        expect(() => readConfig({ [field]: value })).toThrow(
          'Invalid API environment',
        );
  });
  it('returns a safe service error if the durable rate counter does not return a row', async () => {
    const db = drizzle.mock();
    type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
    vi.spyOn(db, 'transaction').mockImplementation((work) =>
      work({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      } as unknown as Tx),
    );
    const identity = new IdentityService(db, {
      rateKey: 'counter-unit-fixture',
    });
    await expect(
      identity.rateLimit('fixture-address', 'fixture'),
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: 503,
    });
  });
  it.each(['configured', 'fallback'] as const)(
    'allows two maximum-history scans within the %s export budget while keeping both lanes bounded',
    async (mode) => {
      const config = readConfig({});
      // The client accepts 50,000 completion/version records in total. Either
      // feed can need an extra partial/empty page; import scans before and after.
      const pages =
        2 * (Math.ceil(50_000 / syncPageQuerySchema.parse({}).limit) + 1);
      const execute = vi.fn().mockResolvedValue({
        rows: [{ count: pages, retry_after_seconds: 600 }],
      });
      const db = drizzle.mock();
      type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
      const tx = { execute } as unknown as Tx;
      const identity = new IdentityService(db, {
        rateKey: 'large-history-budget-fixture',
        ...(mode === 'configured'
          ? {
              activityWriteRateLimit: config.ACTIVITY_WRITE_RATE_LIMIT,
              accountExportRateLimit: config.ACCOUNT_EXPORT_RATE_LIMIT,
            }
          : {}),
      });
      await expect(
        identity.rateLimitAccount(tx, 'fixture-owner', 'export'),
      ).resolves.toBeUndefined();
      execute.mockResolvedValue({
        rows: [
          {
            count: config.ACCOUNT_EXPORT_RATE_LIMIT + 1,
            retry_after_seconds: 600,
          },
        ],
      });
      await expect(
        identity.rateLimitAccount(tx, 'fixture-owner', 'export'),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
      execute.mockResolvedValue({
        rows: [
          {
            count: config.ACTIVITY_WRITE_RATE_LIMIT + 1,
            retry_after_seconds: 600,
          },
        ],
      });
      await expect(
        identity.rateLimitAccount(tx, 'fixture-owner', 'write'),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    },
  );
  it('rejects bearer tokens and arbitrary extra ownership fields outside the shared contract', () => {
    expect(
      bootstrapSchema.safeParse({
        credential: 'a'.repeat(64),
        userId: 'invented',
      }).success,
    ).toBe(false);
    expect(transferStartSchema.safeParse({ code: '123456' }).success).toBe(
      false,
    );
  });
});
