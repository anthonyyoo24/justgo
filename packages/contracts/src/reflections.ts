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
export const reflectionStateSchema = z
  .object({
    attemptId: z.uuid(),
    revision: z.number().int().nonnegative(),
    status: z.enum(['none', 'draft', 'submitted', 'skipped']),
    feelingVersion: z.literal(FEELING_SCALE_VERSION),
    feeling: feelingSchema.nullable(),
    text: z.string().nullable(),
    inputMethod: z.literal('typed').nullable(),
    updatedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ReflectionState = z.infer<typeof reflectionStateSchema>;
export const reflectionResponseSchema = reflectionStateSchema;
export type ReflectionResponse = ReflectionState;
export const reflectionWriteSchema = z
  .object({
    actionId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    feeling: feelingSchema.nullable(),
    text: z.string().max(10000).nullable(),
  })
  .strict();
export const reflectionSkipSchema = reflectionWriteSchema.pick({
  actionId: true,
  expectedRevision: true,
});
export type ReflectionWrite = z.infer<typeof reflectionWriteSchema>;
export const reflectionMutationSchema = reflectionWriteSchema;
export type ReflectionSkip = z.infer<typeof reflectionSkipSchema>;
