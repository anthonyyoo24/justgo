import { z } from 'zod';
import { attemptSchema, completionAttemptSchema } from './activity/attempts.ts';

// Fixed-size pages bound account export responses.
export const exportPageQuerySchema = z
  .object({ cursor: z.uuid().optional() })
  .strict();
export const exportPageSchema = z
  .object({
    account: z
      .object({
        id: z.uuid(),
        createdAt: z.iso.datetime(),
        analyticsRestricted: z.boolean().optional(),
      })
      .strict(),
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

export const completionExportPageSchema = exportPageSchema.extend({
  attempts: z.array(completionAttemptSchema).max(50),
});
export type CompletionExportPage = z.infer<typeof completionExportPageSchema>;
