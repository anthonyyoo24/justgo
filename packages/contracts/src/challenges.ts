import { z } from 'zod';
export const venueSchema = z.enum([
  'streets',
  'park',
  'gym',
  'cafe',
  'bookstore',
  'bars',
]);
export type Venue = z.infer<typeof venueSchema>;
export const venues: { id: Venue; label: string }[] = [
  { id: 'streets', label: 'Streets' },
  { id: 'park', label: 'Park' },
  { id: 'gym', label: 'Gym' },
  { id: 'cafe', label: 'Cafe' },
  { id: 'bookstore', label: 'Bookstore' },
  { id: 'bars', label: 'Bars & Clubs' },
];
export const challengeCardSchema = z
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
export type ChallengeCard = z.infer<typeof challengeCardSchema>;
export const queueSchema = z
  .object({
    venue: venueSchema,
    version: z.number().int().nonnegative(),
    cards: z.array(challengeCardSchema),
  })
  .strict();
export type ChallengeQueue = z.infer<typeof queueSchema>;
const selection = {
  venue: venueSchema,
  cardId: z.string().min(1).max(80),
  revisionId: z.string().min(1).max(80),
  queueVersion: z.number().int().nonnegative(),
};
export const skipChallengeSchema = z
  .object({ actionId: z.uuid(), ...selection })
  .strict();
export const startAttemptSchema = z
  .object({ attemptId: z.uuid(), ...selection })
  .strict();
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((zone) => {
    // Modern Intl also accepts numeric offsets; history requires a named IANA zone.
    if (!/^[A-Za-z]/.test(zone)) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'An IANA time zone is required');
export const finishAttemptSchema = z
  .object({
    attemptId: z.uuid(),
    outcome: z.enum(['completed', 'given_up']),
    timeZone: timeZoneSchema,
  })
  .strict();
export const attemptSchema = z
  .object({
    id: z.uuid(),
    card: challengeCardSchema,
    status: z.enum(['active', 'completed', 'given_up']),
    startedAt: z.iso.datetime(),
    deadlineAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    completionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    timeZone: z.string().nullable(),
    elapsedSeconds: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type Attempt = z.infer<typeof attemptSchema>;
export const challengeStateSchema = z
  .object({
    selectedVenue: venueSchema,
    active: attemptSchema.nullable(),
    latestOutcome: attemptSchema.nullable(),
    serverNow: z.iso.datetime(),
  })
  .strict();
export type ChallengeState = z.infer<typeof challengeStateSchema>;
export const attemptResultSchema = z
  .object({ attempt: attemptSchema, serverNow: z.iso.datetime() })
  .strict();
export const selectVenueSchema = z.object({ venue: venueSchema }).strict();
