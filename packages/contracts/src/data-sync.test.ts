import { describe, it, expect } from 'vitest';
import {
  completionRestoreRequestSchema,
  journalSyncRequestSchema,
  managedSessionRequestSchema,
  dataDeletionRequestSchema,
  identityErrorSchema,
  restoredCompletionSchema,
  isValidHistoricalContext,
  sameHistoricalContext,
} from './index.ts';
const id = '00000000-0000-4000-8000-000000000001';
const completion = {
  id,
  challengeId: 'challenge',
  venue: 'streets',
  levelId: 'level-1',
  instruction: 'Historical instruction',
  startedAt: '2026-09-18T23:55:00.000Z',
  startTimeZone: 'America/Toronto',
  displayTimeZone: 'America/Toronto',
  activityDate: '2026-09-18',
};
const version = {
  versionId: id,
  attemptId: id,
  parents: [],
  feelingScaleVersion: 1,
  reflection: { feeling: null, text: 'Saved writing', revision: 1 },
};
describe('managed account and data boundaries', () => {
  it('validates frozen modern dates and timestamp precision while preserving legacy attribution', () => {
    expect(restoredCompletionSchema.safeParse(completion).success).toBe(true);
    for (const changed of [
      { activityDate: '2026-09-19' },
      { displayTimeZone: 'UTC' },
      { startedAt: '2026-09-18T23:55:00.1234567Z' },
    ])
      expect(
        restoredCompletionSchema.safeParse({ ...completion, ...changed })
          .success,
      ).toBe(false);
    expect(
      restoredCompletionSchema.safeParse({
        ...completion,
        startTimeZone: null,
        displayTimeZone: 'UTC',
        activityDate: '2026-09-19',
      }).success,
    ).toBe(true);
    expect(
      isValidHistoricalContext({
        ...completion,
        startTimeZone: 'Invalid/Zone',
        displayTimeZone: 'Invalid/Zone',
      }),
    ).toBe(false);
    expect(
      isValidHistoricalContext({
        ...completion,
        startedAt: '0001-01-01T00:00:00Z',
        startTimeZone: 'UTC',
        displayTimeZone: 'UTC',
        activityDate: '0001-01-01',
      }),
    ).toBe(true);
  });
  it('compares historical instants without losing Postgres microseconds or frozen attribution', () => {
    const parsed = restoredCompletionSchema.parse(completion);
    expect(
      sameHistoricalContext(parsed, {
        ...parsed,
        startedAt: '2026-09-18T23:55:00Z',
      }),
    ).toBe(true);
    expect(
      sameHistoricalContext(parsed, {
        ...parsed,
        startedAt: '2026-09-18T23:55:00.000000Z',
      }),
    ).toBe(true);
    expect(
      sameHistoricalContext(
        { ...parsed, startedAt: '2026-09-18T23:55:00.1234Z' },
        { ...parsed, startedAt: '2026-09-18T23:55:00.123400Z' },
      ),
    ).toBe(true);
    expect(
      sameHistoricalContext(
        { ...parsed, startedAt: '2026-09-18T23:55:00.123401Z' },
        { ...parsed, startedAt: '2026-09-18T23:55:00.123402Z' },
      ),
    ).toBe(false);
    expect(
      sameHistoricalContext(parsed, {
        ...parsed,
        instruction: 'Another historical wording',
      }),
    ).toBe(true);
    for (const changed of [
      { activityDate: '2026-09-19' },
      { startTimeZone: null },
      { displayTimeZone: 'UTC' },
    ])
      expect(sameHistoricalContext(parsed, { ...parsed, ...changed })).toBe(
        false,
      );
  });
  it('bounds completion imports and rejects private fields, credentials and claimed owners', () => {
    expect(
      completionRestoreRequestSchema.safeParse({
        expectedEpoch: 0,
        attempts: [completion],
      }).success,
    ).toBe(true);
    for (const attempts of [
      [],
      Array.from({ length: 51 }, () => completion),
      [{ ...completion, instruction: 'x'.repeat(10001) }],
      [{ ...completion, reflection: version.reflection }],
      [{ ...completion, userId: id }],
      [{ ...completion, startedAt: '0000-01-01T00:00:00.000Z' }],
    ])
      expect(
        completionRestoreRequestSchema.safeParse({ expectedEpoch: 0, attempts })
          .success,
      ).toBe(false);
    expect(
      completionRestoreRequestSchema.safeParse({ attempts: [completion] })
        .success,
    ).toBe(false);
    expect(
      journalSyncRequestSchema.safeParse({
        expectedEpoch: 0,
        versions: [
          {
            ...version,
            context: {
              ...completion,
              id: '00000000-0000-4000-8000-000000000002',
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      completionRestoreRequestSchema.safeParse({
        expectedEpoch: 0,
        attempts: [completion],
        sessionToken: 'secret',
      }).success,
    ).toBe(false);
  });
  it('retains immutable version identity and rejects invalid parent/content/scale shapes', () => {
    expect(
      journalSyncRequestSchema.safeParse({
        expectedEpoch: 0,
        versions: [version],
      }).success,
    ).toBe(true);
    expect(
      journalSyncRequestSchema.safeParse({
        expectedEpoch: 0,
        versions: [{ ...version, context: completion }],
      }).success,
    ).toBe(true);
    for (const changed of [
      { parents: [id] },
      {
        parents: [
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000002',
        ],
      },
      { parents: Array.from({ length: 51 }, () => id) },
      { reflection: { feeling: null, text: ' ', revision: 1 } },
      { feelingScaleVersion: 2 },
      { ownerId: id },
    ])
      expect(
        journalSyncRequestSchema.safeParse({
          expectedEpoch: 0,
          versions: [{ ...version, ...changed }],
        }).success,
      ).toBe(false);
    expect(
      journalSyncRequestSchema.safeParse({
        expectedEpoch: -1,
        versions: [version],
      }).success,
    ).toBe(false);
  });
  it('requires verified bearer linking rather than request identities or email', () => {
    expect(
      managedSessionRequestSchema.safeParse({
        deviceId: id,
        legacySessionToken: 'a'.repeat(64),
      }).success,
    ).toBe(true);
    for (const extra of [
      { userId: id },
      { authUserId: id },
      { email: 'owner@example.com' },
      { legacySessionToken: 'unverified' },
    ])
      expect(
        managedSessionRequestSchema.safeParse({ deviceId: id, ...extra })
          .success,
      ).toBe(false);
    expect(
      dataDeletionRequestSchema.safeParse({ expectedEpoch: 0 }).success,
    ).toBe(true);
    expect(
      dataDeletionRequestSchema.safeParse({ expectedEpoch: 0, userId: id })
        .success,
    ).toBe(false);
    for (const code of ['DATA_EPOCH_CHANGED', 'DATA_DELETED'])
      expect(
        identityErrorSchema.safeParse({ code, requestId: 'safe' }).success,
      ).toBe(true);
  });
});
