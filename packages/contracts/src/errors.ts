import { z } from 'zod';

export const identityErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'REQUEST_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'CREDENTIAL_REJECTED',
  'CONFLICT',
  'DATA_EPOCH_CHANGED',
  'DATA_DELETED',
  'REFLECTION_CONFLICT',
  'PRIVATE_JOURNAL_LOCAL',
  'ATTEMPT_INELIGIBLE',
  'ACCESS_REQUIRED',
  // A guest account may not save history until it signs in with Apple or Google.
  'SIGN_IN_REQUIRED',
  'NOT_FOUND',
  'TRANSFER_EXPIRED',
  'TRANSFER_PENDING',
  'RATE_LIMITED',
  'UNAVAILABLE',
]);
export const identityErrorSchema = z
  .object({
    code: identityErrorCodeSchema,
    requestId: z.string(),
  })
  .strict();
export type IdentityErrorCode = z.infer<typeof identityErrorCodeSchema>;
