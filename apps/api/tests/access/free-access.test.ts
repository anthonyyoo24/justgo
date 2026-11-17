import { describe, expect, it } from 'vitest';
import { accessResponseSchema, hasVerifiedAccess } from '@justgo/contracts';
import {
  createFreeAccess,
  freeAccessRenewalMs,
} from '../../src/access/free-access.js';
import { readConfig } from '../../src/config.js';
import { createDatabase } from '../../src/db/client.js';
import { buildRuntimeApp } from '../../src/runtime-app.js';
import { apiRequest } from '../request.js';

const userId = '00000000-0000-4000-8000-000000000001';
const now = Date.parse('2027-03-01T12:00:00.000Z');
const sessionOwner = (id: string | null) =>
  ({
    execute: async () => ({ rows: [{ user_id: id }] }),
  }) as never;

describe('free access', () => {
  it('admits guests and accounts with a rolling renewal and no fixed end date', async () => {
    const access = createFreeAccess(() => now);
    const expected = {
      status: 'verified',
      source: 'free_beta',
      checkedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + freeAccessRenewalMs).toISOString(),
    };
    const guest = accessResponseSchema.parse(await access.guestAccessReader());
    const account = accessResponseSchema.parse(
      await access.entitlementReader(sessionOwner(userId)),
    );
    expect(guest).toEqual(expected);
    expect(account).toEqual(expected);
    expect(hasVerifiedAccess(guest, now)).toBe(true);
    // Any later date is still open, unlike the retired December 31 beta window.
    const later = Date.parse('2030-01-01T00:00:00.000Z');
    expect(
      hasVerifiedAccess(
        await createFreeAccess(() => later).guestAccessReader(),
        later,
      ),
    ).toBe(true);
  });

  it('accepts uploads only for the verified owner and never from the future', async () => {
    const { uploadEligibilityReader } = createFreeAccess(() => now);
    const startedAt = '2026-01-01T00:00:00.000Z';
    expect(
      await uploadEligibilityReader(sessionOwner(userId), {
        userId,
        startedAt,
      }),
    ).toBe('eligible');
    expect(
      await uploadEligibilityReader(sessionOwner(null), { userId, startedAt }),
    ).toBe('ineligible');
    expect(
      await uploadEligibilityReader(
        sessionOwner('00000000-0000-4000-8000-000000000002'),
        { userId, startedAt },
      ),
    ).toBe('ineligible');
    expect(
      await uploadEligibilityReader(sessionOwner(userId), {
        userId,
        startedAt: new Date(now + 1).toISOString(),
      }),
    ).toBe('ineligible');
  });

  it.each(['production', 'staging'])(
    'serves free guest access from the %s runtime with no access settings',
    async (environment) => {
      const config = readConfig({
        APP_ENVIRONMENT: environment,
        DATABASE_URL: 'postgresql://justgo@127.0.0.1:1/justgo',
        DATABASE_SSL: 'disable',
      });
      const database = createDatabase(config);
      try {
        const response = await apiRequest(
          buildRuntimeApp(config, database),
          '/v1/guest/access',
        );
        expect(response.statusCode).toBe(200);
        const access = accessResponseSchema.parse(response.json());
        expect(hasVerifiedAccess(access)).toBe(true);
      } finally {
        await database.pool.end();
      }
    },
  );
});
