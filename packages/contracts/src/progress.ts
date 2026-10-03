import { z } from 'zod';
import { feelingSchema, FEELING_SCALE_VERSION } from './reflections.ts';
import { timeZoneSchema, venueSchema } from './challenges.ts';

// PostgreSQL dates have no year zero, even though ISO 8601 permits it.
export const calendarDateSchema = z.iso
  .date()
  .refine((date) => !date.startsWith('0000-'));
export const calendarMonthSchema = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);

export const progressQuerySchema = z
  .object({ month: calendarMonthSchema, timeZone: timeZoneSchema })
  .strict();
export const progressResponseSchema = z
  .object({
    month: calendarMonthSchema,
    today: calendarDateSchema,
    currentStreak: z.number().int().nonnegative(),
    bestStreak: z.number().int().nonnegative(),
    totalReps: z.number().int().nonnegative(),
    monthlyReps: z.number().int().nonnegative(),
    activeDays: z.number().int().nonnegative(),
    days: z.array(
      z
        .object({ date: calendarDateSchema, reps: z.number().int().positive() })
        .strict(),
    ),
  })
  .strict();
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

export const progressDayQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
export const progressEntrySchema = z
  .object({
    attemptId: z.uuid(),
    completedAt: z.iso.datetime(),
    timeZone: timeZoneSchema,
    cardId: z.string().min(1),
    venue: venueSchema,
    challengeId: z.string().min(1),
    revisionId: z.string().min(1),
    levelId: z.literal('level-1'),
    instruction: z.string().min(1),
    feelingVersion: z.literal(FEELING_SCALE_VERSION),
    reflectionStatus: z.enum(['none', 'draft', 'submitted', 'skipped']),
    feeling: feelingSchema.nullable(),
    reflectionText: z.string().nullable(),
  })
  .strict();
export type ProgressEntry = z.infer<typeof progressEntrySchema>;
export const progressDayResponseSchema = z
  .object({
    date: calendarDateSchema,
    totalReps: z.number().int().nonnegative(),
    entries: z.array(progressEntrySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type ProgressDayResponse = z.infer<typeof progressDayResponseSchema>;
