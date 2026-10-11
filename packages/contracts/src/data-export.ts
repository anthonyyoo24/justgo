import { z } from 'zod';
import { attemptSchema } from './activity/attempts.ts';

// Fixed-size pages keep private journal responses within the API response budget.
export const exportPageQuerySchema = z
  .object({ cursor: z.uuid().optional() })
  .strict();
export const exportPageSchema = z
  .object({
    account: z.object({ id: z.uuid(), createdAt: z.iso.datetime() }).strict(),
    devices: z.array(
      z
        .object({
          id: z.uuid(),
          createdAt: z.iso.datetime(),
          revokedAt: z.iso.datetime().nullable(),
        })
        .strict(),
    ),
    attempts: z.array(attemptSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export type ExportPage = z.infer<typeof exportPageSchema>;
