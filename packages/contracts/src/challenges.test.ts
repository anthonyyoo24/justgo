import { describe, expect, it } from 'vitest';
import {
  startAttemptSchema,
  finishAttemptSchema,
  venueSchema,
} from './challenges.js';
const id = '00000000-0000-4000-8000-000000000001';
describe('challenge contracts', () => {
  it('requires stable input identity and rejects caller-supplied ownership/deadlines', () => {
    const request = {
      attemptId: id,
      venue: 'streets',
      cardId: 'ST-01',
      revisionId: 'st-01-v1',
      queueVersion: 0,
    };
    expect(startAttemptSchema.safeParse(request).success).toBe(true);
    for (const extra of [
      { userId: id },
      { deadlineAt: '2026-09-24T12:00:00Z' },
      { queueVersion: -1 },
    ])
      expect(
        startAttemptSchema.safeParse({ ...request, ...extra }).success,
      ).toBe(false);
  });
  it('accepts only the six approved venues and a valid explicit completion time zone', () => {
    expect(venueSchema.options).toHaveLength(6);
    expect(venueSchema.safeParse('all').success).toBe(false);
    const done = {
      attemptId: id,
      outcome: 'completed',
      timeZone: 'America/Toronto',
    };
    expect(finishAttemptSchema.safeParse(done).success).toBe(true);
    expect(
      finishAttemptSchema.safeParse({ ...done, timeZone: 'invalid/timezone' })
        .success,
    ).toBe(false);
    expect(
      finishAttemptSchema.safeParse({ ...done, outcome: 'expired' }).success,
    ).toBe(false);
  });
});

it('rejects numeric UTC offsets, preserving named time-zone date semantics', () => {
  expect(
    finishAttemptSchema.safeParse({
      attemptId: '00000000-0000-4000-8000-000000000001',
      outcome: 'completed',
      timeZone: '+05:30',
    }).success,
  ).toBe(false);
});
