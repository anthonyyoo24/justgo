import { z } from 'zod';
import { timeZoneSchema, venueSchema } from './challenges.ts';
import { feelingSchema, reflectionSchema } from './reflections.ts';
export const activityDateSchema = z.iso
  .date()
  .refine((date) => !date.startsWith('0000-'));
export const attemptSchema = z
  .object({
    id: z.uuid(),
    challengeId: z.string().min(1).max(80),
    venue: venueSchema,
    levelId: z.literal('level-1'),
    instruction: z.string().min(1),
    startedAt: z.iso.datetime(),
    startTimeZone: timeZoneSchema.nullable(),
    displayTimeZone: timeZoneSchema,
    activityDate: activityDateSchema,
    reflection: reflectionSchema.nullable(),
  })
  .strict();
export type Attempt = z.infer<typeof attemptSchema>;
export const createAttemptSchema = z
  .object({
    id: z.uuid(),
    challengeId: z.string().min(1).max(80),
    venue: venueSchema,
    startedAt: z.iso.datetime().refine((date) => !date.startsWith('0000-')),
    startTimeZone: timeZoneSchema,
  })
  .strict();
export type CreateAttempt = z.infer<typeof createAttemptSchema>;
export const attemptResultSchema = z
  .object({ attempt: attemptSchema })
  .strict();
export const patchAttemptSchema = z
  .object({
    submissionId: z.uuid(),
    expectedReflectionRevision: z.number().int().nonnegative(),
    reflection: z
      .object({
        feeling: feelingSchema.nullable().optional(),
        text: z.string().max(10000).nullable().optional(),
      })
      .strict()
      .refine(
        (value) => value.feeling !== undefined || value.text !== undefined,
      ),
  })
  .strict();
export type PatchAttempt = z.infer<typeof patchAttemptSchema>;
export const patchAttemptResponseSchema = z
  .object({
    attempt: attemptSchema,
    acknowledgement: z
      .object({
        submissionId: z.uuid(),
        appliedRevision: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
export type PatchAttemptResponse = z.infer<typeof patchAttemptResponseSchema>;
export const reflectionConflictSchema = z
  .object({
    code: z.literal('REFLECTION_CONFLICT'),
    requestId: z.string(),
    currentAttempt: attemptSchema,
  })
  .strict();
