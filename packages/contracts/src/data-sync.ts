import { z } from 'zod';
import {
  completionAttemptSchema,
  type CompletionAttempt,
} from './activity/attempts.ts';
import {
  FEELING_SCALE_VERSION,
  reflectionSchema,
} from './activity/reflections.ts';

export const dataEpochSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const timestampFraction = (instant: string) =>
  (instant.match(/\.(\d+)Z$/)?.[1] ?? '').padEnd(6, '0');
/** Historical wording may vary; completion identity and frozen date attribution cannot. */
export function sameHistoricalContext(
  left: CompletionAttempt,
  right: CompletionAttempt,
): boolean {
  return (
    Date.parse(left.startedAt) === Date.parse(right.startedAt) &&
    timestampFraction(left.startedAt) === timestampFraction(right.startedAt) &&
    [
      'id',
      'challengeId',
      'venue',
      'levelId',
      'activityDate',
      'startTimeZone',
      'displayTimeZone',
    ].every(
      (key) =>
        left[key as keyof CompletionAttempt] ===
        right[key as keyof CompletionAttempt],
    )
  );
}
/** Legacy null start zones retain recorded completion dates rather than recomputing them. */
export function isValidHistoricalContext(
  context: Pick<
    CompletionAttempt,
    'startedAt' | 'startTimeZone' | 'displayTimeZone' | 'activityDate'
  >,
): boolean {
  if (/\.\d{7,}Z$/.test(context.startedAt)) return false;
  if (context.startTimeZone === null) return true;
  if (context.startTimeZone !== context.displayTimeZone) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: context.startTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(context.startedAt));
    const fields = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    ) as Record<'year' | 'month' | 'day', string>;
    const date = `${fields.year.padStart(4, '0')}-${fields.month}-${fields.day}`;
    return date === context.activityDate;
  } catch {
    return false;
  }
}
export const restoredCompletionSchema = completionAttemptSchema
  .extend({
    instruction: z.string().min(1).max(10000),
    startedAt: z.iso.datetime().refine((date) => !date.startsWith('0000-')),
  })
  .strict()
  .refine(
    isValidHistoricalContext,
    'Historical completion context is inconsistent',
  );
export const syncPageQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .strict();
export const completionRestoreRequestSchema = z
  .object({
    expectedEpoch: dataEpochSchema,
    // Only a user-confirmed import may intentionally restore a previously deleted ID.
    restoreDeleted: z.boolean().optional(),
    attempts: z.array(restoredCompletionSchema).min(1).max(50),
  })
  .strict();
export const completionRestoreResponseSchema = z
  .object({
    dataEpoch: dataEpochSchema,
    attempts: z.array(completionAttemptSchema).min(1).max(50),
    added: z.number().int().nonnegative().max(50),
    identical: z.number().int().nonnegative().max(50),
  })
  .strict();
export const completionRestorePageSchema = z
  .object({
    dataEpoch: dataEpochSchema,
    attempts: z.array(completionAttemptSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const journalSyncVersionSchema = z
  .object({
    versionId: z.uuid(),
    attemptId: z.uuid(),
    parents: z
      .array(z.uuid())
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length),
    feelingScaleVersion: z.literal(FEELING_SCALE_VERSION),
    reflection: reflectionSchema,
    context: restoredCompletionSchema.optional(),
  })
  .strict()
  .refine((version) => !version.parents.includes(version.versionId))
  .refine(
    (version) => !version.context || version.context.id === version.attemptId,
  );
export const journalSyncRequestSchema = z
  .object({
    expectedEpoch: dataEpochSchema,
    restoreDeleted: z.boolean().optional(),
    versions: z.array(journalSyncVersionSchema).min(1).max(50),
  })
  .strict();
export const journalSyncResponseSchema = z
  .object({
    dataEpoch: dataEpochSchema,
    versions: z.array(journalSyncVersionSchema).min(1).max(50),
    saved: z.number().int().nonnegative().max(50),
    identical: z.number().int().nonnegative().max(50),
  })
  .strict();
export const journalSyncPageSchema = z
  .object({
    dataEpoch: dataEpochSchema,
    versions: z.array(journalSyncVersionSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const dataDeletionRequestSchema = z
  .object({ expectedEpoch: dataEpochSchema })
  .strict();
export const dataDeletionResponseSchema = z
  .object({
    dataEpoch: dataEpochSchema,
    deletedAt: z.iso.datetime(),
  })
  .strict();
export type CompletionRestoreRequest = z.infer<
  typeof completionRestoreRequestSchema
>;
export type CompletionRestoreResponse = z.infer<
  typeof completionRestoreResponseSchema
>;
export type CompletionRestorePage = z.infer<typeof completionRestorePageSchema>;
export type JournalSyncVersion = z.infer<typeof journalSyncVersionSchema>;
export type JournalSyncRequest = z.infer<typeof journalSyncRequestSchema>;
export type JournalSyncResponse = z.infer<typeof journalSyncResponseSchema>;
export type JournalSyncPage = z.infer<typeof journalSyncPageSchema>;
export type DataDeletionRequest = z.infer<typeof dataDeletionRequestSchema>;
export type DataDeletionResponse = z.infer<typeof dataDeletionResponseSchema>;
