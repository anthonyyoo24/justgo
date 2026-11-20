import { describe, expect, it, vi } from 'vitest';
import type { AccessResponse } from '@justgo/contracts';
import { createPaidAccess } from '../../src/access/paid-access.js';
import { GuestService } from '../../src/access/guest.js';
import { AccessService } from '../../src/access/service.js';
import type { IdentityService } from '../../src/identity/service.js';

const userId = '00000000-0000-4000-8000-000000000001';
const lapsed: AccessResponse = {
  status: 'verified',
  source: 'subscription',
  productId: 'justgo.annual',
  checkedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-02-01T00:00:00.000Z',
};

describe('paid access', () => {
  it('answers a guest unpaid without reading anything', async () => {
    expect(await createPaidAccess().guestAccessReader()).toEqual({
      status: 'unpaid',
      checkedAt: expect.any(String),
    });
  });

  it('refuses a future start before it reads a subscription', async () => {
    const execute = vi.fn();
    expect(
      await createPaidAccess().uploadEligibilityReader({ execute } as never, {
        userId,
        startedAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe('ineligible');
    expect(execute).not.toHaveBeenCalled();
  });

  it('reads a lapsed verified answer as unpaid on the guest and account routes', async () => {
    const identity = {
      withSession: (_token: string, work: (tx: never) => unknown) =>
        work({} as never),
    } as unknown as IdentityService;
    for (const access of [
      await new GuestService(identity, async () => lapsed).access(),
      await new AccessService(identity, async () => lapsed).get('token'),
    ]) {
      expect(access.status).toBe('unpaid');
      expect(Date.parse(access.checkedAt)).toBeLessThanOrEqual(Date.now());
    }
    const free = await new GuestService(identity, async () => ({
      status: 'verified',
      source: 'free_beta',
      checkedAt: lapsed.checkedAt,
      expiresAt: lapsed.expiresAt,
    })).access();
    expect(free).toMatchObject({ status: 'unpaid', source: 'free_beta' });
  });
});
