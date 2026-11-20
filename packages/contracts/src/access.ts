import { z } from 'zod';

// Only a server access provider may produce verified access. No client premium flag.
const freeSource = z.literal('free_beta').optional();
const verified = {
  status: z.literal('verified'),
  checkedAt: z.iso.datetime(),
  // For a paid source, the subscription expiry Apple verified.
  expiresAt: z.iso.datetime(),
};
// Apple allows letters, digits, underscores and periods in a product ID.
const appleProductId = z
  .string()
  .max(255)
  .regex(/^[A-Za-z0-9._]+$/);
// Free answers match the first branch, so they parse as fast as before paid sources.
export const accessResponseSchema = z.union([
  z.discriminatedUnion('status', [
    z
      .object({
        status: z.literal('unavailable'),
        checkedAt: z.iso.datetime(),
        source: freeSource,
      })
      .strict(),
    z
      .object({
        status: z.literal('unpaid'),
        checkedAt: z.iso.datetime(),
        source: freeSource,
      })
      .strict(),
    z.object({ ...verified, source: freeSource }).strict(),
  ]),
  z
    .object({
      ...verified,
      source: z.enum(['subscription', 'guest_subscription']),
      productId: appleProductId,
    })
    .strict(),
]);
export type AccessResponse = z.infer<typeof accessResponseSchema>;

/** Verification stays valid until its expiry, however long ago the server checked it. */
export function hasVerifiedAccess(
  access: AccessResponse | undefined,
  now = Date.now(),
): boolean {
  return (
    access?.status === 'verified' &&
    Date.parse(access.checkedAt) <= now &&
    Date.parse(access.expiresAt) > now
  );
}
