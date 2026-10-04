import { z } from 'zod';

// 32 cryptographically random bytes, represented as lowercase hex. Never a user password.
export const secretSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const transferVerificationSchema = z.string().regex(/^\d{6}$/);
export const transferCodeSchema = z.string().regex(/^[A-F0-9]{16}$/);
export const sessionProposalSchema = z
  .object({
    deviceId: z.uuid(),
    sessionId: z.uuid(),
    sessionToken: secretSchema,
  })
  .strict();
export const bootstrapSchema = sessionProposalSchema
  .extend({ credential: secretSchema })
  .strict();
export const renewSchema = z
  .object({ sessionId: z.uuid(), sessionToken: secretSchema })
  .strict();
export const credentialCreateSchema = z
  .object({
    id: z.uuid(),
    credential: secretSchema,
    kind: z.enum(['sync', 'key']),
  })
  .strict();
export const idSchema = z.object({ id: z.uuid() }).strict();
export const transferStartSchema = bootstrapSchema
  .extend({
    id: z.uuid(),
    code: transferCodeSchema,
    claimSecret: secretSchema,
  })
  .strict();
export const transferProofSchema = z
  .object({ code: transferCodeSchema, claimSecret: secretSchema })
  .strict();
// One session resource, with the proof required by each creation mechanism.
// These wire kinds are independent of the device's persisted pending-intent kinds.
export const sessionCreateSchema = z.discriminatedUnion('kind', [
  bootstrapSchema.extend({ kind: z.literal('bootstrap') }).strict(),
  bootstrapSchema.extend({ kind: z.literal('recovery') }).strict(),
  renewSchema.extend({ kind: z.literal('renewal') }).strict(),
  transferProofSchema.extend({ kind: z.literal('transfer') }).strict(),
]);
export const transferInspectSchema = z
  .object({ code: transferCodeSchema })
  .strict();
export const transferApproveSchema = transferInspectSchema
  .extend({ verification: transferVerificationSchema })
  .strict();
export const sessionResponseSchema = z
  .object({
    userId: z.uuid(),
    deviceId: z.uuid(),
    sessionId: z.uuid(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const credentialsResponseSchema = z
  .object({
    credentials: z.array(
      z
        .object({
          id: z.uuid(),
          kind: z.enum(['sync', 'key']),
          createdAt: z.iso.datetime(),
          revokedAt: z.iso.datetime().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export const devicesResponseSchema = z
  .object({
    devices: z.array(
      z
        .object({
          id: z.uuid(),
          createdAt: z.iso.datetime(),
          revokedAt: z.iso.datetime().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export const transferInspectionResponseSchema = z
  .object({
    id: z.uuid(),
    expiresAt: z.iso.datetime(),
    status: z.enum(['waiting', 'approved', 'redeemed', 'cancelled']),
  })
  .strict();
export const transferResponseSchema = transferInspectionResponseSchema
  .extend({ verification: transferVerificationSchema })
  .strict();
export const okSchema = z.object({ ok: z.literal(true) }).strict();
export const identityErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'REQUEST_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'CREDENTIAL_REJECTED',
  'CONFLICT',
  'REFLECTION_CONFLICT',
  'ATTEMPT_INELIGIBLE',
  'ACCESS_REQUIRED',
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
export type SessionCreate = z.infer<typeof sessionCreateSchema>;
export type SessionProposal = z.infer<typeof sessionProposalSchema>;
export type BootstrapRequest = z.infer<typeof bootstrapSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type TransferStart = z.infer<typeof transferStartSchema>;
export type TransferInspectionResponse = z.infer<
  typeof transferInspectionResponseSchema
>;
export type TransferResponse = z.infer<typeof transferResponseSchema>;
export type CredentialCreate = z.infer<typeof credentialCreateSchema>;
export type IdentityErrorCode = z.infer<typeof identityErrorCodeSchema>;
