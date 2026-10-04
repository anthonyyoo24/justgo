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
    id: z.string().min(1).max(80),
    challengeId: z.string().min(1).max(80),
    levelId: z.literal('level-1'),
    venue: venueSchema,
    position: z.number().int().nonnegative(),
    text: z.string().min(1),
    subtext: z.string().nullable(),
    durationSeconds: z.number().int().positive(),
  })
  .strict();
export type ChallengeCard = z.infer<typeof challengeCardSchema>;
export const catalogSchema = z
  .object({ cards: z.array(challengeCardSchema) })
  .strict();
export type Catalog = z.infer<typeof catalogSchema>;
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((zone) => {
    if (!/^[A-Za-z]/.test(zone)) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'An IANA time zone is required');
