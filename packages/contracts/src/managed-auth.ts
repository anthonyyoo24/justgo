import { z } from 'zod';
import { secretSchema, sessionResponseSchema } from './identity.ts';

export const managedSessionRequestSchema = z
  .object({ deviceId: z.uuid(), legacySessionToken: secretSchema.optional() })
  .strict();
const managedSessionFields = sessionResponseSchema.extend({
  authUserId: z.uuid(),
  dataEpoch: z.number().int().nonnegative(),
});
/**
 * What the API sends. An account's session leaves guest out, because
 * TestFlight builds 8 to 10 parse it with a strict schema that has no guest.
 */
export const managedSessionWireSchema = managedSessionFields
  .extend({ guest: z.literal(true).optional() })
  .strict();
export const managedSessionResponseSchema = managedSessionFields
  .extend({
    // An anonymous Auth user's account. A session with no field, from the API
    // or saved before guests existed, is an account.
    guest: z.boolean().default(false),
  })
  .strict();
export const managedLogoutRequestSchema = z
  .object({ scope: z.enum(['session', 'all']) })
  .strict();
export type ManagedSessionRequest = z.infer<typeof managedSessionRequestSchema>;
export type ManagedSessionResponse = z.infer<
  typeof managedSessionResponseSchema
>;
export type ManagedLogoutRequest = z.infer<typeof managedLogoutRequestSchema>;
