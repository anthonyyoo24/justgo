import { describe, expect, it } from 'vitest';
import {
  FEELING_SCALE_VERSION,
  feelingChoices,
  feelingSchema,
  normalizeReflectionText,
  reflectionSchema,
} from '../index.js';
describe('submitted inline reflection boundaries', () => {
  it('keeps five feelings valid and distinct from missing', () => {
    expect(FEELING_SCALE_VERSION).toBe(1);
    expect(feelingChoices.map(({ code }) => feelingSchema.parse(code))).toEqual(
      [
        'a_lot_worse',
        'a_little_worse',
        'about_the_same',
        'a_little_better',
        'a_lot_better',
      ],
    );
    for (const feeling of [null, 'neutral'])
      expect(feelingSchema.safeParse(feeling).success).toBe(false);
  });
  it('normalizes blank input while preserving every nonblank byte', () => {
    for (const text of [undefined, null, '', ' \t\u00a0\ufeff'])
      expect(normalizeReflectionText(text)).toBeNull();
    expect(normalizeReflectionText(' \tSaved text\n ')).toBe(
      ' \tSaved text\n ',
    );
  });
  it('requires positive revisions and explicit submitted content without old draft/status fields', () => {
    const saved = { feeling: null, text: 'a'.repeat(10000), revision: 1 };
    expect(reflectionSchema.parse(saved)).toEqual(saved);
    expect(
      reflectionSchema.safeParse({
        feeling: 'about_the_same',
        text: null,
        revision: 3,
      }).success,
    ).toBe(true);
    for (const extra of [
      { text: 'a'.repeat(10001) },
      { text: ' \t' },
      { revision: 0 },
      { revision: 0.5 },
      { status: 'draft' },
      { feeling: 'neutral' },
    ])
      expect(reflectionSchema.safeParse({ ...saved, ...extra }).success).toBe(
        false,
      );
  });
});
