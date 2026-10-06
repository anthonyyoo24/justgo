import { z } from 'zod';
import { timeZoneSchema } from './challenges.ts';
import { activityDateSchema, attemptSchema } from './attempts.ts';
export const calendarDateSchema = activityDateSchema;
export const calendarMonthSchema = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
export const progressSummaryQuerySchema = z
  .object({ timeZone: timeZoneSchema })
  .strict();
export const progressCalendarQuerySchema = z
  .object({ month: calendarMonthSchema })
  .strict();
export const progressSummarySchema = z
  .object({
    today: calendarDateSchema,
    timeZone: timeZoneSchema,
    totalReps: z.number().int().nonnegative(),
    currentStreak: z.number().int().nonnegative(),
    bestStreak: z.number().int().nonnegative(),
    streakContext: z
      .object({
        month: calendarMonthSchema,
        precedingRun: z.number().int().nonnegative(),
        bestBeforeMonth: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type ProgressSummary = z.infer<typeof progressSummarySchema>;
export const progressCalendarSchema = z
  .object({
    month: calendarMonthSchema,
    monthlyReps: z.number().int().nonnegative(),
    activeDays: z.number().int().nonnegative(),
    days: z.array(
      z
        .object({ date: calendarDateSchema, reps: z.number().int().positive() })
        .strict(),
    ),
  })
  .strict();
export type ProgressCalendar = z.infer<typeof progressCalendarSchema>;
export const progressDayQuerySchema = z
  .object({
    date: calendarDateSchema,
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
export const progressDayResponseSchema = z
  .object({
    date: calendarDateSchema,
    totalReps: z.number().int().nonnegative(),
    entries: z.array(attemptSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type ProgressDayResponse = z.infer<typeof progressDayResponseSchema>;
