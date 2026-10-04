// Temporary protocol compatibility; removed in Phase 07.5.
import { z } from 'zod';
import { feelingSchema, FEELING_SCALE_VERSION } from './reflections.ts';
export const legacyReflectionStateSchema = z
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
export type LegacyReflectionState = z.infer<typeof legacyReflectionStateSchema>;
export const legacyReflectionResponseSchema = legacyReflectionStateSchema;
export type LegacyReflectionResponse = LegacyReflectionState;
export const legacyReflectionWriteSchema = z
  .object({
    actionId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    feeling: feelingSchema.nullable(),
    text: z.string().max(10000).nullable(),
  })
  .strict();
export const legacyReflectionSkipSchema = legacyReflectionWriteSchema.pick({
  actionId: true,
  expectedRevision: true,
});
export type LegacyReflectionWrite = z.infer<typeof legacyReflectionWriteSchema>;
export const legacyReflectionMutationSchema = legacyReflectionWriteSchema;
export type LegacyReflectionSkip = z.infer<typeof legacyReflectionSkipSchema>;
