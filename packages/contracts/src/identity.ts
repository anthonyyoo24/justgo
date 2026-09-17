import { z } from 'zod';

// 32 cryptographically random bytes, represented as lowercase hex. Never a user password.
export const secretSchema = z.string().regex(/^[a-f0-9]{64}$/);
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
export const transferInspectSchema = z
  .object({ code: transferCodeSchema })
  .strict();
export const transferApproveSchema = transferInspectSchema
  .extend({ verification: z.string().regex(/^\d{6}$/) })
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
export const transferResponseSchema = z
  .object({
    id: z.uuid(),
    verification: z.string(),
    expiresAt: z.iso.datetime(),
    status: z.enum(['waiting', 'approved', 'redeemed', 'cancelled']),
  })
  .strict();
export const okSchema = z.object({ ok: z.literal(true) }).strict();
export const identityErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'CREDENTIAL_REJECTED',
  'CONFLICT',
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
export type SessionProposal = z.infer<typeof sessionProposalSchema>;
export type BootstrapRequest = z.infer<typeof bootstrapSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type TransferStart = z.infer<typeof transferStartSchema>;
export type TransferResponse = z.infer<typeof transferResponseSchema>;
export type CredentialCreate = z.infer<typeof credentialCreateSchema>;
export type IdentityErrorCode = z.infer<typeof identityErrorCodeSchema>;
