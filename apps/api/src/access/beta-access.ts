import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { EntitlementReader } from './service.js';
import type { UploadEligibilityReader } from '../attempts/service.js';

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

/** Server operator configuration only; never accepted from a mobile request. */
export function readBetaGrants(value: string) {
  try {
    return betaGrantsSchema.parse(JSON.parse(value));
  } catch {
    // Do not expose environment contents or account identifiers in validation errors.
    throw new Error('Invalid beta access configuration');
  }
}

export function createBetaAccess(
  grants: readonly BetaGrant[],
  now: () => number = Date.now,
): {
  entitlementReader: EntitlementReader;
  uploadEligibilityReader: UploadEligibilityReader;
} {
  const approved = new Map(
    betaGrantsSchema.parse(grants).map((g) => [g.userId, g]),
  );
  const end = (g: BetaGrant) =>
    Math.min(
      Date.parse(g.expiresAt),
      g.revokedAt ? Date.parse(g.revokedAt) : Infinity,
    );
  const covers = (g: BetaGrant | undefined, time: number) =>
    !!g && time >= Date.parse(g.startsAt) && time < end(g);
  const owner = async (tx: Parameters<EntitlementReader>[0]) =>
    (
      await tx.execute<{ user_id: string | null }>(
        sql`select justgo.current_user_id() as user_id`,
      )
    ).rows[0]?.user_id;
  return {
    entitlementReader: async (tx) => {
      const userId = await owner(tx);
      const grant = userId ? approved.get(userId) : undefined;
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
      return covers(approved.get(userId), Date.parse(context.startedAt))
        ? 'eligible'
        : 'ineligible';
    },
  };
}
