// Temporary protocol compatibility; removed in Phase 07.5.
import { z } from 'zod';
import { venueSchema, timeZoneSchema } from './challenges.ts';
export const legacyChallengeCardSchema = z
  .object({
    id: z.string().min(1),
    challengeId: z.string().min(1),
    revisionId: z.string().min(1),
    levelId: z.literal('level-1'),
    venue: venueSchema,
    text: z.string().min(1),
    durationSeconds: z.number().int().positive(),
  })
  .strict();
export type LegacyChallengeCard = z.infer<typeof legacyChallengeCardSchema>;
export const legacyQueueSchema = z
  .object({
    venue: venueSchema,
    version: z.number().int().nonnegative(),
    cards: z.array(legacyChallengeCardSchema),
  })
  .strict();
export type LegacyChallengeQueue = z.infer<typeof legacyQueueSchema>;
const selection = {
  venue: venueSchema,
  cardId: z.string().min(1).max(80),
  revisionId: z.string().min(1).max(80),
  queueVersion: z.number().int().nonnegative(),
};
export const legacySkipChallengeSchema = z
  .object({ actionId: z.uuid(), ...selection })
  .strict();
export const legacyStartAttemptSchema = z
  .object({ attemptId: z.uuid(), ...selection })
  .strict();
export const legacyFinishAttemptSchema = z
  .object({
    attemptId: z.uuid(),
    outcome: z.enum(['completed', 'given_up']),
    timeZone: timeZoneSchema,
  })
  .strict();
export const legacyAttemptSchema = z
  .object({
    id: z.uuid(),
    card: legacyChallengeCardSchema,
    status: z.enum(['active', 'completed', 'given_up']),
    startedAt: z.iso.datetime(),
    deadlineAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    completionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    timeZone: z.string().nullable(),
  })
  .strict();
export type LegacyAttempt = z.infer<typeof legacyAttemptSchema>;
export const legacyChallengeStateSchema = z
  .object({
    selectedVenue: venueSchema,
    active: legacyAttemptSchema.nullable(),
    latestOutcome: legacyAttemptSchema.nullable(),
    serverNow: z.iso.datetime(),
  })
  .strict();
export type LegacyChallengeState = z.infer<typeof legacyChallengeStateSchema>;
export const legacyAttemptResultSchema = z
  .object({ attempt: legacyAttemptSchema, serverNow: z.iso.datetime() })
  .strict();
export const legacySelectVenueSchema = z
  .object({ venue: venueSchema })
  .strict();
