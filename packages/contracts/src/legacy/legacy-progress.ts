// Temporary protocol compatibility; removed in Phase 07.5.
import { z } from 'zod';
import {
  feelingSchema,
  FEELING_SCALE_VERSION,
} from '../activity/reflections.ts';
import { timeZoneSchema, venueSchema } from '../activity/challenges.ts';
import {
  calendarDateSchema,
  calendarMonthSchema,
} from '../activity/progress.ts';
export const legacyProgressQuerySchema = z
  .object({ month: calendarMonthSchema, timeZone: timeZoneSchema })
  .strict();
export const legacyProgressResponseSchema = z
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
export type LegacyProgressResponse = z.infer<
  typeof legacyProgressResponseSchema
>;

export const legacyProgressDayQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
export const legacyProgressEntrySchema = z
  .object({
    attemptId: z.uuid(),
    completedAt: z.iso.datetime().nullable(),
    activityAt: z.iso.datetime().optional(),
    timeZone: timeZoneSchema,
    cardId: z.string().min(1).nullable(),
    venue: venueSchema,
    challengeId: z.string().min(1),
    revisionId: z.string().min(1).nullable(),
    levelId: z.literal('level-1'),
    instruction: z.string().min(1),
    feelingVersion: z.literal(FEELING_SCALE_VERSION),
    reflectionStatus: z.enum(['none', 'draft', 'submitted', 'skipped']),
    feeling: feelingSchema.nullable(),
    reflectionText: z.string().nullable(),
  })
  .strict();
export type LegacyProgressEntry = z.infer<typeof legacyProgressEntrySchema>;
export const legacyProgressDayResponseSchema = z
  .object({
    date: calendarDateSchema,
    totalReps: z.number().int().nonnegative(),
    entries: z.array(legacyProgressEntrySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type LegacyProgressDayResponse = z.infer<
  typeof legacyProgressDayResponseSchema
>;
