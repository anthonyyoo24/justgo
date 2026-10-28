import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { EntitlementReader } from './service.js';
import type { UploadEligibilityReader } from '../attempts/service.js';
import type { GuestAccessReader } from './guest.js';

const grantSchema = z
  .object({
    userId: z.uuid(),
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (grant) =>
      Date.parse(grant.startsAt) < Date.parse(grant.expiresAt) &&
      (!grant.revokedAt ||
        Date.parse(grant.revokedAt) >= Date.parse(grant.startsAt)),
  );
export const betaGrantsSchema = z
  .array(grantSchema)
  .max(100)
  .refine(
    (grants) => new Set(grants.map((g) => g.userId)).size === grants.length,
  );
type BetaGrant = z.infer<typeof grantSchema>;
const betaAccessWindowSchema = z
  .object({
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (window) => Date.parse(window.startsAt) < Date.parse(window.expiresAt),
  );
type BetaAccessWindow = z.infer<typeof betaAccessWindowSchema>;
type AccessInterval = Pick<BetaGrant, 'startsAt' | 'expiresAt' | 'revokedAt'>;

/** Server operator configuration only; never accepted from a mobile request. */
export function readBetaGrants(value: string) {
  try {
    return betaGrantsSchema.parse(JSON.parse(value));
  } catch {
    // Do not expose environment contents or account identifiers in validation errors.
    throw new Error('Invalid beta access configuration');
  }
}

/** Optional, bounded admission for authenticated accounts in a staging test build. */
export function readBetaAccessWindow(value: string) {
  try {
    return betaAccessWindowSchema.nullable().parse(JSON.parse(value));
  } catch {
    throw new Error('Invalid beta access window configuration');
  }
}

export function createBetaAccess(
  grants: readonly BetaGrant[],
  now: () => number = Date.now,
  accessWindow: BetaAccessWindow | null = null,
): {
  entitlementReader: EntitlementReader;
  uploadEligibilityReader: UploadEligibilityReader;
  guestAccessReader: GuestAccessReader;
} {
  const approved = new Map(
    betaGrantsSchema.parse(grants).map((g) => [g.userId, g]),
  );
  const window = betaAccessWindowSchema.nullable().parse(accessWindow);
  // Explicit account restrictions take precedence over general test admission.
  // Keep individual intervals intact for expiry/revocation and earlier uploads.
  const interval = (userId: string | null | undefined) =>
    userId ? (approved.get(userId) ?? window) : undefined;
  const end = (g: AccessInterval) =>
    Math.min(
      Date.parse(g.expiresAt),
      g.revokedAt ? Date.parse(g.revokedAt) : Infinity,
    );
  const covers = (g: AccessInterval | null | undefined, time: number) =>
    !!g && time >= Date.parse(g.startsAt) && time < end(g);
  const owner = async (tx: Parameters<EntitlementReader>[0]) =>
    (
      await tx.execute<{ user_id: string | null }>(
        sql`select justgo.current_user_id() as user_id`,
      )
    ).rows[0]?.user_id;
  return {
    guestAccessReader: async () => {
      const time = now(),
        checkedAt = new Date(time).toISOString();
      return window && covers(window, time)
        ? {
            status: 'verified',
            source: 'free_beta',
            checkedAt,
            expiresAt: window.expiresAt,
          }
        : { status: 'unpaid', source: 'free_beta', checkedAt };
    },
    entitlementReader: async (tx) => {
      const userId = await owner(tx);
      const grant = interval(userId);
      const time = now();
      const checkedAt = new Date(time).toISOString();
      return covers(grant, time)
        ? {
            status: 'verified',
            source: 'free_beta',
            checkedAt,
            expiresAt: new Date(end(grant!)).toISOString(),
          }
        : { status: 'unpaid', source: 'free_beta', checkedAt };
    },
    uploadEligibilityReader: async (tx, context) => {
      const userId = await owner(tx);
      // Defense in depth: the caller's context must agree with the verified session.
      if (!userId || userId !== context.userId) return 'ineligible';
      // Keep ended/revoked intervals in operator configuration so earlier offline
      // completions remain uploadable. Never remove a grant to revoke current access.
      const startedAt = Date.parse(context.startedAt);
      return startedAt <= now() && covers(interval(userId), startedAt)
        ? 'eligible'
        : 'ineligible';
    },
  };
}
