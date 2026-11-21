import { describe, expect, it } from 'vitest';
import { accessResponseSchema, hasVerifiedAccess } from './access.js';
import { openApiDocument } from './openapi.js';
const now = Date.now();
const time = (delta: number) => new Date(now + delta).toISOString();
describe('verified access', () => {
  it('fails closed for unavailable, unpaid, expired and future-dated verification', () => {
    expect(hasVerifiedAccess(undefined, now)).toBe(false);
    for (const status of ['unpaid', 'unavailable'] as const)
      expect(hasVerifiedAccess({ status, checkedAt: time(0) }, now)).toBe(
        false,
      );
    for (const [checkedAt, expiresAt] of [
      [0, 0],
      [1, 60_000],
    ])
      expect(
        hasVerifiedAccess(
          {
            status: 'verified',
            checkedAt: time(checkedAt!),
            expiresAt: time(expiresAt!),
          },
          now,
        ),
      ).toBe(false);
    expect(
      hasVerifiedAccess(
        { status: 'verified', checkedAt: time(-1), expiresAt: time(60_000) },
        now,
      ),
    ).toBe(true);
  });
  it('keeps verification valid until its expiry, however long ago it was checked', () => {
    expect(
      hasVerifiedAccess(
        { status: 'verified', checkedAt: time(-60_000), expiresAt: time(1) },
        now,
      ),
    ).toBe(true);
  });
  it.each(['subscription', 'guest_subscription'] as const)(
    'accepts a %s with its product ID until the verified Apple expiry',
    (source) => {
      const access = accessResponseSchema.parse({
        status: 'verified',
        source,
        productId: 'com.anthonyyoo.justgo.pro.annual',
        checkedAt: time(0),
        expiresAt: time(86_400_000),
      });
      expect(hasVerifiedAccess(access, now + 3_600_000)).toBe(true);
      expect(hasVerifiedAccess(access, now + 86_400_000)).toBe(false);
    },
  );
  it('refuses a paid source without its product ID or expiry, and unknown sources', () => {
    const paid = {
      status: 'verified',
      source: 'subscription',
      productId: 'com.anthonyyoo.justgo.pro.monthly',
      checkedAt: time(0),
      expiresAt: time(60_000),
    };
    expect(accessResponseSchema.safeParse(paid).success).toBe(true);
    for (const invalid of [
      { ...paid, productId: undefined },
      { ...paid, expiresAt: undefined },
      { ...paid, productId: '' },
      { ...paid, productId: 'com.example/annual' },
      { ...paid, source: 'free_beta' },
      { ...paid, source: 'superwall' },
      { status: 'unpaid', source: 'subscription', checkedAt: time(0) },
    ])
      expect(accessResponseSchema.safeParse(invalid).success).toBe(false);
  });
  it("carries Apple's trial and auto-renew state on a paid source only", () => {
    const paid = {
      status: 'verified',
      source: 'subscription',
      productId: 'com.anthonyyoo.justgo.pro.annual',
      checkedAt: time(0),
      expiresAt: time(60_000),
    } as const;
    for (const state of [
      { trial: true, autoRenew: true },
      { trial: false, autoRenew: false },
      { trial: true },
    ])
      expect(accessResponseSchema.parse({ ...paid, ...state })).toEqual({
        ...paid,
        ...state,
      });
    for (const invalid of [
      { ...paid, trial: 'yes' },
      { ...paid, autoRenew: 1 },
      { ...paid, autoRenew: null },
      {
        status: 'verified',
        source: 'free_beta',
        checkedAt: time(0),
        expiresAt: time(60_000),
        trial: false,
      },
      { status: 'unpaid', checkedAt: time(0), autoRenew: false },
    ])
      expect(accessResponseSchema.safeParse(invalid).success).toBe(false);
  });
  it('rejects client premium flags and incomplete verified responses', () => {
    expect(
      accessResponseSchema.safeParse({ status: 'verified', checkedAt: time(0) })
        .success,
    ).toBe(false);
    expect(
      accessResponseSchema.safeParse({
        status: 'unpaid',
        checkedAt: time(0),
        premium: true,
      }).success,
    ).toBe(false);
  });
  it('publishes matching strict contracts and bearer boundaries in OpenAPI', () => {
    expect(openApiDocument.paths['/v1/access'].get.security).toEqual([
      { deviceSession: [] },
    ]);
    expect(openApiDocument.paths['/v1/sessions'].post.security).toEqual([
      {},
      { deviceSession: [] },
    ]);
    const inspection =
      openApiDocument.paths['/v1/transfer-inspections'].post.responses['200']
        .content['application/json'].schema;
    expect(inspection.properties).not.toHaveProperty('verification');
    expect(inspection.additionalProperties).toBe(false);
  });
  it('accepts server-described free access without weakening verification or strict fields', () => {
    const data = accessResponseSchema.parse({
      status: 'verified',
      source: 'free_beta',
      checkedAt: time(0),
      expiresAt: time(60_000),
    });
    expect(hasVerifiedAccess(data, now)).toBe(true);
    expect(
      hasVerifiedAccess(
        { status: 'unpaid', source: 'free_beta', checkedAt: time(0) },
        now,
      ),
    ).toBe(false);
    expect(
      accessResponseSchema.safeParse({ ...data, source: 'client_override' })
        .success,
    ).toBe(false);
  });
});
