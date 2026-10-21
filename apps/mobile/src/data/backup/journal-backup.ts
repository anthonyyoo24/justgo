import { strToU8, zipSync } from 'fflate';
import { z } from 'zod';
import { sameHistoricalContext } from '@justgo/contracts';
import {
  localJournalEntrySchema,
  type LocalJournalEntry,
} from '../journal/model';
import { readStoredJournalZip } from './stored-zip';

export const JOURNAL_BACKUP_MAX_BYTES = 32 * 1024 * 1024;
export const JOURNAL_BACKUP_MAX_ENTRIES = 50_000;
export const JOURNAL_BACKUP_MAX_RECORD_BYTES = 64 * 1024;

export class JournalBackupError extends Error {
  constructor(readonly code: 'INVALID_BACKUP' | 'TOO_LARGE' | 'WRONG_ACCOUNT') {
    super(
      code === 'WRONG_ACCOUNT'
        ? 'Sign in to the account that owns this backup before importing it.'
        : code === 'TOO_LARGE'
          ? 'This backup exceeds the supported size limit.'
          : 'Choose an unchanged JustGO export or journal backup with a supported format.',
    );
    this.name = 'JournalBackupError';
  }
}

const backupSchema = z
  .object({
    format: z.literal('justgo-journal'),
    formatVersion: z.literal(1),
    accountId: z.uuid(),
    createdAt: z.iso.datetime().refine((date) => !date.startsWith('0000-')),
    // Records are parsed one at a time below so large local journals cannot
    // cause an unbounded schema clone or full JSON allocation before rejection.
    entries: z.array(z.unknown()).max(JOURNAL_BACKUP_MAX_ENTRIES),
    alternatives: z.array(z.unknown()).max(JOURNAL_BACKUP_MAX_ENTRIES),
  })
  .strict();
export type JournalBackup = Omit<
  z.infer<typeof backupSchema>,
  'entries' | 'alternatives'
> & {
  entries: LocalJournalEntry[];
  alternatives: LocalJournalEntry[];
};

export function parseJournalSnapshot(
  value: unknown,
  accountId: string,
): JournalBackup {
  // Reject the record count before schema validation traverses historical zones.
  if (
    value !== null &&
    typeof value === 'object' &&
    'entries' in value &&
    'alternatives' in value &&
    Array.isArray(value.entries) &&
    Array.isArray(value.alternatives) &&
    value.entries.length + value.alternatives.length >
      JOURNAL_BACKUP_MAX_ENTRIES
  )
    throw new JournalBackupError('TOO_LARGE');
  const result = backupSchema.safeParse(value);
  if (!result.success) throw new JournalBackupError('INVALID_BACKUP');
  const backup = result.data;
  if (backup.accountId !== accountId)
    throw new JournalBackupError('WRONG_ACCOUNT');
  // The only stored ZIP entry adds 122 bytes of headers and its fixed name.
  let archiveBytes =
    122 +
    strToU8(JSON.stringify({ ...backup, entries: [], alternatives: [] }))
      .length;
  const readEntry = (candidate: unknown, index: number) => {
    const parsed = localJournalEntrySchema.safeParse(candidate);
    if (!parsed.success) throw new JournalBackupError('INVALID_BACKUP');
    const entry = parsed.data;
    const recordBytes = strToU8(JSON.stringify(entry)).length;
    archiveBytes += recordBytes + (index > 0 ? 1 : 0);
    if (
      recordBytes > JOURNAL_BACKUP_MAX_RECORD_BYTES ||
      archiveBytes > JOURNAL_BACKUP_MAX_BYTES
    )
      throw new JournalBackupError('TOO_LARGE');
    return entry;
  };
  const ids = new Set<string>();
  const entries = backup.entries.map((candidate, index) => {
    const entry = readEntry(candidate, index);
    if (entry.accountId !== accountId || ids.has(entry.id))
      throw new JournalBackupError('INVALID_BACKUP');
    ids.add(entry.id);
    return entry;
  });
  const alternatives = backup.alternatives.map((candidate, index) => {
    const entry = readEntry(candidate, index);
    if (entry.accountId !== accountId || !ids.has(entry.id))
      throw new JournalBackupError('INVALID_BACKUP');
    return entry;
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of alternatives) {
    const original = byId.get(entry.id)!;
    if (!sameHistoricalContext(original, entry))
      throw new JournalBackupError('INVALID_BACKUP');
  }
  return { ...backup, entries, alternatives };
}

export function encodeJournalSnapshot({
  accountId,
  entries,
  alternatives = [],
  createdAt = new Date().toISOString(),
}: {
  accountId: string;
  entries: LocalJournalEntry[];
  alternatives?: LocalJournalEntry[];
  createdAt?: string;
}): Uint8Array {
  if (entries.length + alternatives.length > JOURNAL_BACKUP_MAX_ENTRIES)
    throw new JournalBackupError('TOO_LARGE');
  const backup = parseJournalSnapshot(
    {
      format: 'justgo-journal',
      formatVersion: 1,
      accountId,
      createdAt,
      entries,
      alternatives,
    },
    accountId,
  );
  return strToU8(JSON.stringify(backup));
}

export function createJournalBackup({
  createdAt = new Date().toISOString(),
  ...snapshot
}: {
  accountId: string;
  entries: LocalJournalEntry[];
  alternatives?: LocalJournalEntry[];
  createdAt?: string;
}): { name: string; bytes: Uint8Array } {
  return {
    name: `JustGO-journal-${createdAt.replace(/[:.]/g, '-')}.zip`,
    bytes: zipSync(
      { 'journal.json': encodeJournalSnapshot({ ...snapshot, createdAt }) },
      { level: 0 },
    ),
  };
}

export function readJournalBackup(
  bytes: Uint8Array,
  accountId: string,
): JournalBackup {
  if (bytes.length > JOURNAL_BACKUP_MAX_BYTES)
    throw new JournalBackupError('TOO_LARGE');
  let value: unknown;
  try {
    value = JSON.parse(readStoredJournalZip(bytes));
  } catch {
    // Do not surface parser messages containing private text or foreign paths.
    throw new JournalBackupError('INVALID_BACKUP');
  }
  return parseJournalSnapshot(value, accountId);
}
