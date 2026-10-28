import { describe, expect, it } from 'vitest';
import {
  createAttemptSchema,
  completionAttemptSchema,
  completionAttemptResultSchema,
  patchAttemptSchema,
  attemptSchema,
  reflectionConflictSchema,
} from './attempts.ts';
import { catalogSchema } from './challenges.ts';
import { reflectionSchema, normalizeReflectionText } from './reflections.ts';
import {
  progressDayQuerySchema,
  completionProgressDayResponseSchema,
  progressSummaryQuerySchema,
  progressCalendarQuerySchema,
} from './progress.ts';
import { completionExportPageSchema } from '../data-export.ts';
import { openApiDocument } from '../openapi.ts';
const id = '00000000-0000-4000-8000-000000000001';
const create = {
  id,
  challengeId: 'fixture',
  venue: 'streets',
  startedAt: '2026-10-03T14:00:00.000Z',
  startTimeZone: 'America/Toronto',
};
const attempt = {
  ...create,
  levelId: 'level-1',
  instruction: 'Say hello.',
  displayTimeZone: create.startTimeZone,
  activityDate: '2026-10-03',
  reflection: null,
};
describe('completed attempt resource contracts', () => {
  it('accepts captured starts and rejects immutable lifecycle/ownership inputs', () => {
    expect(createAttemptSchema.parse(create)).toEqual(create);
    for (const extra of [
      { userId: id },
      { reflection: { text: 'private' } },
      { feeling: 'about_the_same' },
      { reflectionLength: 7 },
      { status: 'completed' },
      { deadlineAt: create.startedAt },
      { endedAt: create.startedAt },
      { revisionId: 'old' },
      { queueVersion: 1 },
      { startedAt: '0000-01-01T00:00:00.000Z' },
      { startTimeZone: '+05:30' },
      { startTimeZone: 'Invalid/Zone' },
    ])
      expect(
        createAttemptSchema.safeParse({ ...create, ...extra }).success,
      ).toBe(false);
    expect(attemptSchema.parse(attempt)).toEqual(attempt);
    expect(
      attemptSchema.safeParse({ ...attempt, startTimeZone: null }).success,
    ).toBe(true);
  });
  it('keeps reflection values strict, nonempty and bounded without inventing feelings', () => {
    for (const reflection of [
      { feeling: 'a_little_better', text: null, revision: 1 },
      { feeling: null, text: 'hello', revision: 2 },
      { feeling: 'about_the_same', text: 'hello', revision: 4 },
    ])
      expect(reflectionSchema.safeParse(reflection).success).toBe(true);
    expect(
      reflectionSchema.safeParse({ feeling: null, text: '  ', revision: 1 })
        .success,
    ).toBe(false);
    expect(
      reflectionSchema.safeParse({ feeling: null, text: null, revision: 1 })
        .success,
    ).toBe(false);
    expect(normalizeReflectionText(undefined)).toBeNull();
    expect(normalizeReflectionText(' x ')).toBe(' x ');
    for (const reflection of [
      { feeling: 'a_lot_better' },
      { text: 'hello' },
      { feeling: null, text: null },
    ])
      expect(
        patchAttemptSchema.safeParse({
          submissionId: id,
          expectedReflectionRevision: 0,
          reflection,
        }).success,
      ).toBe(true);
    for (const reflection of [
      {},
      { feeling: 'neutral' },
      { text: 'a'.repeat(10001) },
      { text: 'hi', inputMethod: 'dictated' },
    ])
      expect(
        patchAttemptSchema.safeParse({
          submissionId: id,
          expectedReflectionRevision: 0,
          reflection,
        }).success,
      ).toBe(false);
    expect(
      reflectionConflictSchema.safeParse({
        code: 'REFLECTION_CONFLICT',
        requestId: 'fixture',
        currentAttempt: attempt,
      }).success,
    ).toBe(true);
  });
  it('separates summary, calendar and day inputs and excludes content revisions from catalog', () => {
    expect(
      progressSummaryQuerySchema.safeParse({
        timeZone: 'UTC',
        month: '2026-10',
      }).success,
    ).toBe(false);
    expect(progressCalendarQuerySchema.parse({ month: '2026-10' })).toEqual({
      month: '2026-10',
    });
    expect(progressDayQuerySchema.parse({ date: '2026-10-03' })).toEqual({
      date: '2026-10-03',
      limit: 20,
    });
    for (const value of [
      { date: '2026-02-30' },
      { date: '2026-10-03', limit: 51 },
      { date: '2026-10-03', limit: 0 },
    ])
      expect(progressDayQuerySchema.safeParse(value).success).toBe(false);
    const card = {
      id: 'ST-01',
      challengeId: 'fixture',
      venue: 'streets',
      levelId: 'level-1',
      position: 1,
      text: 'Hello',
      subtext: null,
      durationSeconds: 300,
    };
    expect(catalogSchema.parse({ cards: [card] }).cards).toHaveLength(1);
    expect(
      catalogSchema.safeParse({ cards: [{ ...card, revisionId: 'old' }] })
        .success,
    ).toBe(false);
  });
  it('rejects private fields from every ordinary wire response', () => {
    const completion = {
      ...create,
      levelId: 'level-1',
      instruction: 'Say hello.',
      displayTimeZone: create.startTimeZone,
      activityDate: '2026-10-03',
    };
    expect(completionAttemptSchema.parse(completion)).toEqual(completion);
    expect(
      completionAttemptResultSchema.parse({ attempt: completion }).attempt,
    ).toEqual(completion);
    const day = {
      date: '2026-10-03',
      totalReps: 1,
      entries: [completion],
      nextCursor: null,
    };
    expect(completionProgressDayResponseSchema.parse(day)).toEqual(day);
    const exported = {
      account: { id, createdAt: create.startedAt },
      devices: [],
      attempts: [completion],
      nextCursor: null,
    };
    expect(completionExportPageSchema.parse(exported)).toEqual(exported);
    for (const reflection of [
      null,
      { feeling: 'about_the_same', text: 'private', revision: 1 },
    ]) {
      const privateAttempt = { ...completion, reflection };
      expect(completionAttemptSchema.safeParse(privateAttempt).success).toBe(
        false,
      );
      expect(
        completionAttemptResultSchema.safeParse({ attempt: privateAttempt })
          .success,
      ).toBe(false);
      expect(
        completionProgressDayResponseSchema.safeParse({
          ...day,
          entries: [privateAttempt],
        }).success,
      ).toBe(false);
      expect(
        completionExportPageSchema.safeParse({
          ...exported,
          attempts: [privateAttempt],
        }).success,
      ).toBe(false);
    }
  });
  it('publishes only canonical resources and their completion/retirement statuses', () => {
    expect(openApiDocument.paths['/v1/attempts'].post.responses).toHaveProperty(
      '201',
    );
    expect(
      openApiDocument.paths['/v1/attempts/{id}'].patch.responses,
    ).toHaveProperty('410');
    expect(openApiDocument.paths).not.toHaveProperty('/v1/challenges/state');
    expect(openApiDocument.paths).not.toHaveProperty('/v1/progress');
    expect(openApiDocument.paths).not.toHaveProperty('/v1/journal/legacy');
    expect(openApiDocument.paths['/v1/challenges']).toHaveProperty('get');
  });
});
