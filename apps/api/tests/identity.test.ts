import { describe, expect, it } from 'vitest';
import { bootstrapSchema, transferStartSchema } from '@justgo/contracts';
import { rateAddress } from '../src/identity/address.js';
import { readConfig } from '../src/config.js';

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
