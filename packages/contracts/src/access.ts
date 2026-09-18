import { z } from 'zod';

// Only a server billing provider may produce verified access. No client premium flag.
export const accessResponseSchema = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('unavailable'), checkedAt: z.iso.datetime() })
    .strict(),
  z
    .object({ status: z.literal('unpaid'), checkedAt: z.iso.datetime() })
    .strict(),
  z
    .object({
      status: z.literal('verified'),
      checkedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
    })
    .strict(),
]);
export type AccessResponse = z.infer<typeof accessResponseSchema>;

export function hasVerifiedAccess(
  access: AccessResponse | undefined,
  now = Date.now(),
): boolean {
  return (
    access?.status === 'verified' &&
    Date.parse(access.checkedAt) <= now &&
    now - Date.parse(access.checkedAt) < 60_000 &&
    Date.parse(access.expiresAt) > now
  );
}
