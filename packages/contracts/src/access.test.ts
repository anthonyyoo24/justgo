import { describe, expect, it } from 'vitest';
import { accessResponseSchema, hasVerifiedAccess } from './access.js';
import { openApiDocument } from './openapi.js';
const now = Date.now();
const time = (delta: number) => new Date(now + delta).toISOString();
describe('verified access', () => {
  it('fails closed for unavailable, unpaid, expired, stale and future-dated verification', () => {
    expect(hasVerifiedAccess(undefined, now)).toBe(false);
    for (const status of ['unpaid', 'unavailable'] as const)
      expect(hasVerifiedAccess({ status, checkedAt: time(0) }, now)).toBe(
        false,
      );
    for (const [checkedAt, expiresAt] of [
      [0, 0],
      [-60_000, 60_000],
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
    expect(
      openApiDocument.paths['/v1/identity/bootstrap'].post.security,
    ).toEqual([]);
    const inspection =
      openApiDocument.paths['/v1/identity/transfers/inspect'].post.responses[
        '200'
      ].content['application/json'].schema;
    expect(inspection.properties).not.toHaveProperty('verification');
    expect(inspection.additionalProperties).toBe(false);
  });
});
