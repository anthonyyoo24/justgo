import { z } from 'zod';
import { secretSchema, sessionResponseSchema } from './identity.ts';

export const managedSessionRequestSchema = z
  .object({ deviceId: z.uuid(), legacySessionToken: secretSchema.optional() })
  .strict();
export const managedSessionResponseSchema = sessionResponseSchema
  .extend({ authUserId: z.uuid(), dataEpoch: z.number().int().nonnegative() })
  .strict();
export const managedLogoutRequestSchema = z
  .object({ scope: z.enum(['session', 'all']) })
  .strict();
export type ManagedSessionRequest = z.infer<typeof managedSessionRequestSchema>;
export type ManagedSessionResponse = z.infer<
  typeof managedSessionResponseSchema
>;
export type ManagedLogoutRequest = z.infer<typeof managedLogoutRequestSchema>;
