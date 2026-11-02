import { z } from 'zod';
import {
  activityDateSchema,
  isValidHistoricalContext,
  FEELING_SCALE_VERSION,
  normalizeReflectionText,
  reflectionSchema,
  timeZoneSchema,
  venueSchema,
} from '@justgo/contracts';

// This data-only shape is shared by the private store and manual backups. It
// deliberately contains no account proof, upload operation or server receipt.
export const localJournalEntrySchema = z
  .object({
    accountId: z.uuid(),
    id: z.uuid(),
    challengeId: z.string().min(1).max(80),
    venue: venueSchema,
    levelId: z.literal('level-1'),
    instruction: z.string().min(1).max(10000),
    startedAt: z.iso.datetime().refine((date) => !date.startsWith('0000-')),
    startTimeZone: timeZoneSchema.nullable(),
    displayTimeZone: timeZoneSchema,
    activityDate: activityDateSchema,
    feelingScaleVersion: z.literal(FEELING_SCALE_VERSION),
    reflection: reflectionSchema.transform((reflection) => ({
      ...reflection,
      text: normalizeReflectionText(reflection.text),
    })),
  })
  .strict()
  .refine(
    isValidHistoricalContext,
    'Journal date does not match its historical display context',
  );

export type LocalJournalEntry = z.infer<typeof localJournalEntrySchema>;
export type JournalMergeResult = {
  added: number;
  identical: number;
  conflictIds: string[];
};

// Fixed identifiers only: never retain raw storage errors, paths or entry data.
export type LocalStorageDiagnostic =
  | 'NATIVE_SQLITE_MODULE'
  | 'SQLITE_NOT_REGISTERED'
  | 'SQLITE_ASSET_NOT_REGISTERED'
  | 'SQLITE_BUNDLE_LOAD'
  | 'SQLITE_OPEN'
  | 'SQLITE_CONFIGURE'
  | 'SQLITE_NEWER_SCHEMA'
  | 'SQLITE_SCHEMA'
  | 'SQLITE_TRANSACTION'
  | 'LOCAL_ENTRY_INVALID'
  | 'LOCAL_OWNER_MISMATCH'
  | 'LOCAL_STORAGE_UNAVAILABLE'
  | 'METADATA_READ'
  | 'COMPLETION_READ'
  | 'COMPLETION_FORMAT'
  | 'PRIVATE_PREPARATION';

export class LocalJournalError extends Error {
  constructor(
    readonly code:
      | 'INVALID_ENTRY'
      | 'WRONG_ACCOUNT'
      | 'CONFLICT'
      | 'STOPPED'
      | 'UNAVAILABLE',
    readonly diagnostic?: LocalStorageDiagnostic,
  ) {
    // Never attach an entry, raw database error or validation issue to errors.
    super(code);
    this.name = 'LocalJournalError';
  }
}

export function parseOwnedEntry(
  value: unknown,
  accountId: string,
): LocalJournalEntry {
  const result = localJournalEntrySchema.safeParse(value);
  if (!result.success)
    throw new LocalJournalError('INVALID_ENTRY', 'LOCAL_ENTRY_INVALID');
  if (result.data.accountId !== accountId)
    throw new LocalJournalError('WRONG_ACCOUNT', 'LOCAL_OWNER_MISMATCH');
  return result.data;
}

export function journalEntryIdentity(entry: LocalJournalEntry): string {
  // Schema order is canonical across SQLite, imported JSON and network contexts.
  return JSON.stringify(localJournalEntrySchema.parse(entry));
}
