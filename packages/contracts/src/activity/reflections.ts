import { z } from 'zod';

// Persist this version with every response; codes must retain their meaning in history.
export const FEELING_SCALE_VERSION = 1 as const;
export const feelingSchema = z.enum([
  'a_lot_worse',
  'a_little_worse',
  'about_the_same',
  'a_little_better',
  'a_lot_better',
]);
export type Feeling = z.infer<typeof feelingSchema>;
export type FeelingCode = Feeling;
export const feelingChoices: { code: Feeling; label: string }[] = [
  { code: 'a_lot_worse', label: 'A lot worse' },
  { code: 'a_little_worse', label: 'A little bit worse' },
  { code: 'about_the_same', label: 'Pretty much the same' },
  { code: 'a_little_better', label: 'A little bit better' },
  { code: 'a_lot_better', label: 'A lot better' },
];
// Blank input has the same meaning in phone and API validation/digesting.
export const normalizeReflectionText = (value: string | null | undefined) =>
  value?.trim() ? value : null;
export const reflectionSchema = z
  .object({
    feeling: feelingSchema.nullable(),
    text: z.string().max(10000).nullable(),
    revision: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) =>
      value.feeling !== null || normalizeReflectionText(value.text) !== null,
  );
export type Reflection = z.infer<typeof reflectionSchema>;
