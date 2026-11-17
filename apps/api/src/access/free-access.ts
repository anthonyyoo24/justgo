import { sql } from 'drizzle-orm';
import type { AccessResponse } from '@justgo/contracts';
import type { EntitlementReader } from './service.js';
import type { UploadEligibilityReader } from '../attempts/service.js';
import type { GuestAccessReader } from './guest.js';

/**
 * How long one answer lets a phone start challenges offline. Each check renews
 * it, so free access has no fixed end date.
 */
export const freeAccessRenewalMs = 30 * 24 * 60 * 60_000;

/**
 * JustGO launches free (Anthony, 2026-11-17): every guest and account may start
 * challenges, with no beta window. `free_beta` stays the wire source because the
 * contract and installed builds accept only that value for server-granted access.
 */
export function createFreeAccess(now: () => number = Date.now): {
  entitlementReader: EntitlementReader;
  uploadEligibilityReader: UploadEligibilityReader;
  guestAccessReader: GuestAccessReader;
} {
  const verified = (): AccessResponse => {
    const time = now();
    return {
      status: 'verified',
      source: 'free_beta',
      checkedAt: new Date(time).toISOString(),
      expiresAt: new Date(time + freeAccessRenewalMs).toISOString(),
    };
  };
  return {
    guestAccessReader: async () => verified(),
    entitlementReader: async () => verified(),
    uploadEligibilityReader: async (tx, context) => {
      const userId = (
        await tx.execute<{ user_id: string | null }>(
          sql`select justgo.current_user_id() as user_id`,
        )
      ).rows[0]?.user_id;
      // Defense in depth: the caller's context must agree with the verified session.
      if (!userId || userId !== context.userId) return 'ineligible';
      return Date.parse(context.startedAt) <= now() ? 'eligible' : 'ineligible';
    },
  };
}
