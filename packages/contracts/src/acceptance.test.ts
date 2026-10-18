import { describe, expect, it } from 'vitest';
import {
  CURRENT_ACCEPTANCE_VERSIONS,
  acceptanceVersionsSchema,
  currentAcceptanceVersionsSchema,
  acceptanceReceiptSchema,
  accountAcceptanceResponseSchema,
  hasCurrentAcceptance,
  isAnalyticsEligible,
  type AcceptanceReceipt,
  type AnalyticsEligibilityInput,
} from './acceptance.ts';
import { sessionCreateSchema } from './identity.ts';
import { openApiDocument } from './openapi.ts';

const userId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const receipt: AcceptanceReceipt = {
  userId,
  ...CURRENT_ACCEPTANCE_VERSIONS,
  acceptedAt: '2026-10-17T12:00:00.000Z',
};
const eligible: AnalyticsEligibilityInput = {
  identityReady: true,
  acceptanceConfirmed: true,
  currentUserId: userId,
  receipt,
  analyticsRestricted: false,
  event: { userId, occurredAt: '2026-10-17T12:00:01.000Z' },
};

describe('account acceptance contracts', () => {
  it('accepts bounded historical versions but only current versions for a new acceptance', () => {
    expect(
      currentAcceptanceVersionsSchema.parse(CURRENT_ACCEPTANCE_VERSIONS),
    ).toEqual(CURRENT_ACCEPTANCE_VERSIONS);
    for (const key of Object.keys(CURRENT_ACCEPTANCE_VERSIONS)) {
      expect(
        acceptanceVersionsSchema.safeParse({
          ...CURRENT_ACCEPTANCE_VERSIONS,
          [key]: 'earlier-v1',
        }).success,
      ).toBe(true);
      for (const value of ['', 'x'.repeat(81), 'not a version', null])
        expect(
          acceptanceVersionsSchema.safeParse({
            ...CURRENT_ACCEPTANCE_VERSIONS,
            [key]: value,
          }).success,
        ).toBe(false);
      expect(
        currentAcceptanceVersionsSchema.safeParse({
          ...CURRENT_ACCEPTANCE_VERSIONS,
          [key]: 'earlier-v1',
        }).success,
      ).toBe(false);
    }
    expect(
      currentAcceptanceVersionsSchema.safeParse({
        ...CURRENT_ACCEPTANCE_VERSIONS,
        userId,
      }).success,
    ).toBe(false);
    expect(
      acceptanceVersionsSchema.safeParse({
        ...CURRENT_ACCEPTANCE_VERSIONS,
        acceptedAt: receipt.acceptedAt,
      }).success,
    ).toBe(false);
  });
  it('requires a complete server receipt and keeps its owner equal to the response account', () => {
    expect(acceptanceReceiptSchema.parse(receipt)).toEqual(receipt);
    const accepted = { userId, receipt, analyticsRestricted: false };
    expect(accountAcceptanceResponseSchema.parse(accepted)).toEqual(accepted);
    expect(
      accountAcceptanceResponseSchema.parse({ ...accepted, receipt: null }),
    ).toEqual({ ...accepted, receipt: null });
    expect(
      accountAcceptanceResponseSchema.safeParse({
        ...accepted,
        userId: otherId,
      }).success,
    ).toBe(false);
    for (const invalid of [
      { ...receipt, userId: 'bad-owner' },
      { ...receipt, acceptedAt: 'yesterday' },
      { ...receipt, sessionToken: 'secret' },
    ])
      expect(acceptanceReceiptSchema.safeParse(invalid).success).toBe(false);
    expect(
      accountAcceptanceResponseSchema.safeParse({ userId, receipt }).success,
    ).toBe(false);
    expect(
      accountAcceptanceResponseSchema.safeParse({
        ...accepted,
        analyticsRestricted: null,
      }).success,
    ).toBe(false);
  });
  it('adds acceptance only to bootstrap without changing legacy recovery/session proofs', () => {
    const proof = {
      deviceId: userId,
      sessionId: otherId,
      sessionToken: 'a'.repeat(64),
      credential: 'b'.repeat(64),
    };
    expect(
      sessionCreateSchema.safeParse({ ...proof, kind: 'bootstrap' }).success,
    ).toBe(true);
    expect(
      sessionCreateSchema.safeParse({
        ...proof,
        kind: 'bootstrap',
        acceptance: CURRENT_ACCEPTANCE_VERSIONS,
      }).success,
    ).toBe(true);
    expect(
      sessionCreateSchema.safeParse({
        ...proof,
        kind: 'recovery',
        acceptance: CURRENT_ACCEPTANCE_VERSIONS,
      }).success,
    ).toBe(false);
    expect(
      sessionCreateSchema.safeParse({
        ...proof,
        kind: 'bootstrap',
        acceptance: receipt,
      }).success,
    ).toBe(false);
    expect(
      openApiDocument.paths['/v1/account/acceptance'].get.security,
    ).toEqual([{ deviceSession: [] }]);
    expect(
      openApiDocument.paths['/v1/account/acceptance'].put.requestBody?.content[
        'application/json'
      ].schema,
    ).toHaveProperty('additionalProperties', false);
  });
});

describe('shared analytics delivery eligibility', () => {
  it('reuses current versions only for the receipt owner', () => {
    expect(hasCurrentAcceptance(receipt, userId)).toBe(true);
    expect(hasCurrentAcceptance(receipt, null)).toBe(false);
    expect(hasCurrentAcceptance(null, userId)).toBe(false);
    expect(hasCurrentAcceptance(receipt, otherId)).toBe(false);
    for (const key of Object.keys(CURRENT_ACCEPTANCE_VERSIONS))
      expect(hasCurrentAcceptance({ ...receipt, [key]: 'older' }, userId)).toBe(
        false,
      );
    expect(
      hasCurrentAcceptance({ ...receipt, acceptedAt: 'bad-time' }, userId),
    ).toBe(false);
  });
  it('requires confirmed hydration, account ownership and no privacy restriction at delivery', () => {
    expect(isAnalyticsEligible(eligible)).toBe(true);
    for (const input of [
      { identityReady: false },
      { acceptanceConfirmed: false },
      { currentUserId: null },
      { receipt: null },
      { analyticsRestricted: true },
      { analyticsRestricted: null },
      { currentUserId: otherId },
      { receipt: { ...receipt, userId: otherId } },
      { receipt: { ...receipt, termsVersion: 'older' } },
      { event: { ...eligible.event, userId: otherId } },
    ])
      expect(isAnalyticsEligible({ ...eligible, ...input })).toBe(false);
  });
  it('does not replay pre-acceptance activity and rejects invalid receipt/event times', () => {
    expect(
      isAnalyticsEligible({
        ...eligible,
        event: { userId, occurredAt: receipt.acceptedAt },
      }),
    ).toBe(true);
    for (const occurredAt of ['2026-10-17T11:59:59.999Z', 'invalid'])
      expect(
        isAnalyticsEligible({ ...eligible, event: { userId, occurredAt } }),
      ).toBe(false);
    expect(
      isAnalyticsEligible({
        ...eligible,
        receipt: { ...receipt, acceptedAt: 'invalid' },
      }),
    ).toBe(false);
  });
});
