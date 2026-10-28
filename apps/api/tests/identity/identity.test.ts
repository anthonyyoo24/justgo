import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  bootstrapSchema,
  syncPageQuerySchema,
  transferStartSchema,
} from '@justgo/contracts';
import { rateAddress } from '../../src/identity/address.js';
import { readConfig } from '../../src/config.js';
import { IdentityService } from '../../src/identity/service.js';

describe('identity input and deployment configuration', () => {
  it('never trusts client forwarding headers outside the Vercel runtime', () => {
    expect(
      rateAddress('127.0.0.1', { 'x-vercel-forwarded-for': '1.2.3.4' }, false),
    ).toBe('127.0.0.1');
    expect(
      rateAddress('127.0.0.1', { 'x-vercel-forwarded-for': '1.2.3.4' }, true),
    ).toBe('1.2.3.4');
    expect(
      rateAddress(
        '127.0.0.1',
        { 'x-vercel-forwarded-for': '1.2.3.4,5.6.7.8' },
        true,
      ),
    ).toBe('127.0.0.1');
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
