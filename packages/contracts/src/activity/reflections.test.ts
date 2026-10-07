import { describe, expect, it } from 'vitest';
import {
  feelingChoices,
  feelingSchema,
  legacyReflectionStateSchema,
  legacyReflectionWriteSchema,
  legacyReflectionSkipSchema,
} from '../index.js';

const actionId = '00000000-0000-4000-8000-000000000001';
const write = { actionId, expectedRevision: 0, feeling: null, text: null };
describe('reflection boundaries', () => {
  it('keeps all five feelings valid and distinct from missing', () => {
    expect(feelingChoices.map(({ code }) => feelingSchema.parse(code))).toEqual(
      [
        'a_lot_worse',
        'a_little_worse',
        'about_the_same',
        'a_little_better',
        'a_lot_better',
      ],
    );
    expect(feelingSchema.safeParse(null).success).toBe(false);
    expect(feelingSchema.safeParse('neutral').success).toBe(false);
  });
  it('permits optional draft input while bounding text and revision/action identities', () => {
    expect(legacyReflectionWriteSchema.parse(write)).toEqual(write);
    expect(
      legacyReflectionWriteSchema.parse({ ...write, text: 'a'.repeat(10000) })
        .text,
    ).toHaveLength(10000);
    for (const invalid of [
      { ...write, text: 'a'.repeat(10001) },
      { ...write, expectedRevision: -1 },
      { ...write, expectedRevision: 0.5 },
      { ...write, actionId: 'invalid' },
      { ...write, userId: actionId },
    ]) {
      expect(legacyReflectionWriteSchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });
  it('skipping cannot smuggle reflection content or owner fields', () => {
    expect(
      legacyReflectionSkipSchema.parse({ actionId, expectedRevision: 2 }),
    ).toEqual({ actionId, expectedRevision: 2 });
    expect(legacyReflectionSkipSchema.safeParse(write).success).toBe(false);
  });
  it('retains versioned submitted/draft/skipped distinctions without inventing a neutral feeling', () => {
    const state = {
      attemptId: actionId,
      revision: 1,
      status: 'submitted',
      feelingVersion: 1,
      feeling: null,
      text: 'Disposable fixture',
      inputMethod: 'typed',
      updatedAt: '2026-10-03T12:00:00.000Z',
    };
    expect(legacyReflectionStateSchema.parse(state).feeling).toBeNull();
    for (const status of ['none', 'draft', 'submitted', 'skipped'])
      expect(
        legacyReflectionStateSchema.safeParse({ ...state, status }).success,
      ).toBe(true);
    expect(
      legacyReflectionStateSchema.safeParse({ ...state, feelingVersion: 2 })
        .success,
    ).toBe(false);
    expect(
      legacyReflectionStateSchema.safeParse({
        ...state,
        inputMethod: 'dictated',
      }).success,
    ).toBe(false);
  });
});
