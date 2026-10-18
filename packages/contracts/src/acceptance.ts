import { z } from 'zod';

// Draft legal versions remain visibly distinct from Phase 13's reviewed publication.
export const CURRENT_ACCEPTANCE_VERSIONS = {
  termsVersion: '2026-10-17-draft',
  privacyVersion: '2026-10-17-draft',
  analyticsScopeVersion: '2026-10-17-v1',
} as const;

const versionSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9._-]+$/);
export const acceptanceVersionsSchema = z
  .object({
    termsVersion: versionSchema,
    privacyVersion: versionSchema,
    analyticsScopeVersion: versionSchema,
  })
  .strict();
export const currentAcceptanceVersionsSchema = z
  .object({
    termsVersion: z.literal(CURRENT_ACCEPTANCE_VERSIONS.termsVersion),
    privacyVersion: z.literal(CURRENT_ACCEPTANCE_VERSIONS.privacyVersion),
    analyticsScopeVersion: z.literal(
      CURRENT_ACCEPTANCE_VERSIONS.analyticsScopeVersion,
    ),
  })
  .strict();
export const acceptanceReceiptSchema = acceptanceVersionsSchema
  .extend({ userId: z.uuid(), acceptedAt: z.iso.datetime() })
  .strict();
export const accountAcceptanceResponseSchema = z
  .object({
    userId: z.uuid(),
    receipt: acceptanceReceiptSchema.nullable(),
    analyticsRestricted: z.boolean(),
  })
  .strict()
  .refine((value) => !value.receipt || value.receipt.userId === value.userId, {
    message: 'Acceptance receipt must belong to its account',
  });

export type AcceptanceVersions = z.infer<typeof acceptanceVersionsSchema>;
export type AcceptanceReceipt = z.infer<typeof acceptanceReceiptSchema>;
export type AccountAcceptanceResponse = z.infer<
  typeof accountAcceptanceResponseSchema
>;
export type AnalyticsEventIdentity = { userId: string; occurredAt: string };
export type AnalyticsEligibilityInput = {
  identityReady: boolean;
  acceptanceConfirmed: boolean;
  currentUserId: string | null;
  receipt: AcceptanceReceipt | null;
  analyticsRestricted: boolean | null;
  event: AnalyticsEventIdentity;
};

export function hasCurrentAcceptance(
  receipt: AcceptanceReceipt | null,
  userId: string | null,
): boolean {
  return Boolean(
    userId &&
    receipt &&
    receipt.userId === userId &&
    receipt.termsVersion === CURRENT_ACCEPTANCE_VERSIONS.termsVersion &&
    receipt.privacyVersion === CURRENT_ACCEPTANCE_VERSIONS.privacyVersion &&
    receipt.analyticsScopeVersion ===
      CURRENT_ACCEPTANCE_VERSIONS.analyticsScopeVersion &&
    Number.isFinite(Date.parse(receipt.acceptedAt)),
  );
}

/** Shared by future adapters at delivery time; it never enables an exporter. */
export function isAnalyticsEligible(input: AnalyticsEligibilityInput): boolean {
  const { receipt, event } = input;
  if (
    !input.identityReady ||
    !input.acceptanceConfirmed ||
    !input.currentUserId ||
    input.analyticsRestricted !== false ||
    !receipt ||
    event.userId !== input.currentUserId ||
    !hasCurrentAcceptance(receipt, input.currentUserId)
  )
    return false;
  const acceptedAt = Date.parse(receipt.acceptedAt);
  const occurredAt = Date.parse(event.occurredAt);
  return Number.isFinite(occurredAt) && occurredAt >= acceptedAt;
}
