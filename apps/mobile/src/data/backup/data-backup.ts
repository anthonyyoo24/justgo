import { strToU8, zipSync } from 'fflate';
import { z } from 'zod';
import {
  attemptSchema,
  completionAttemptSchema,
  restoredCompletionSchema,
  sameHistoricalContext,
  type Attempt,
} from '@justgo/contracts';
import type { LocalJournalEntry } from '../journal/model';
import { journalEntry } from '../activity/private-journal';
import {
  encodeJournalSnapshot,
  parseJournalSnapshot,
  JOURNAL_BACKUP_MAX_BYTES,
  JOURNAL_BACKUP_MAX_ENTRIES,
  JOURNAL_BACKUP_MAX_RECORD_BYTES,
  JournalBackupError,
} from './journal-backup';
import { readStoredBackupZip } from './stored-zip';

export type BackupOwner = { id: string; kind: 'guest' | 'account' };
export type DataPreferences = { reduceMotion: boolean; haptics: boolean };
export type DataBackup = {
  owner: BackupOwner;
  exportedAt: string;
  attempts: Attempt[];
  journal: { entries: LocalJournalEntry[]; alternatives: LocalJournalEntry[] };
  preferences: DataPreferences;
};
export type RestorableData = Omit<DataBackup, 'preferences'> & {
  preferences: DataPreferences | null;
  legacyJournalOnly: boolean;
};
const ownerSchema = z
  .object({ id: z.uuid(), kind: z.enum(['guest', 'account']) })
  .strict();
const preferencesSchema = z
  .object({ reduceMotion: z.boolean(), haptics: z.boolean() })
  .strict();
const envelopeSchema = z
  .object({
    format: z.literal('justgo-data'),
    formatVersion: z.literal(1),
    owner: ownerSchema,
    exportedAt: z.iso.datetime(),
    preferences: preferencesSchema,
    attempts: z.array(z.unknown()).max(JOURNAL_BACKUP_MAX_ENTRIES),
    journal: z
      .object({
        entries: z.array(z.unknown()).max(JOURNAL_BACKUP_MAX_ENTRIES),
        alternatives: z.array(z.unknown()).max(JOURNAL_BACKUP_MAX_ENTRIES),
      })
      .strict(),
  })
  .strict();
function invalid(): never {
  throw new JournalBackupError('INVALID_BACKUP');
}
function parseData(value: unknown, destination: BackupOwner): RestorableData {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) invalid();
  const source = parsed.data;
  if (
    source.owner.kind === 'account' &&
    (destination.kind !== 'account' || destination.id !== source.owner.id)
  )
    throw new JournalBackupError('WRONG_ACCOUNT');
  if (
    source.attempts.length +
      source.journal.entries.length +
      source.journal.alternatives.length >
    JOURNAL_BACKUP_MAX_ENTRIES
  )
    throw new JournalBackupError('TOO_LARGE');
  const attempts = source.attempts.map((candidate) => {
    const attempt = restoredCompletionSchema.safeParse(candidate);
    if (!attempt.success) invalid();
    return { ...attempt.data, reflection: null };
  });
  const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  if (byId.size !== attempts.length) invalid();
  const journal = parseJournalSnapshot(
    {
      format: 'justgo-journal',
      formatVersion: 1,
      accountId: source.owner.id,
      createdAt: source.exportedAt,
      ...source.journal,
    },
    source.owner.id,
  );
  for (const entry of [...journal.entries, ...journal.alternatives]) {
    const attempt = byId.get(entry.id);
    if (attempt && !sameHistoricalContext(attempt, entry)) invalid();
  }
  return {
    owner: destination,
    exportedAt: source.exportedAt,
    attempts,
    journal: {
      entries: journal.entries.map((entry) => ({
        ...entry,
        accountId: destination.id,
      })),
      alternatives: journal.alternatives.map((entry) => ({
        ...entry,
        accountId: destination.id,
      })),
    },
    preferences: source.preferences,
    legacyJournalOnly: false,
  };
}
const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export function createDataBackup(snapshot: DataBackup): {
  name: string;
  bytes: Uint8Array;
} {
  ownerSchema.parse(snapshot.owner);
  if (
    snapshot.attempts.length +
      snapshot.journal.entries.length +
      snapshot.journal.alternatives.length >
    JOURNAL_BACKUP_MAX_ENTRIES
  )
    throw new JournalBackupError('TOO_LARGE');
  // Reserve before building large JSON/CSV strings. Stored ZIP members are bounded.
  let budget = 4096;
  for (const record of [
    ...snapshot.attempts,
    ...snapshot.journal.entries,
    ...snapshot.journal.alternatives,
  ]) {
    const size = strToU8(JSON.stringify(record)).length;
    budget += size * 4;
    if (
      size > JOURNAL_BACKUP_MAX_RECORD_BYTES ||
      budget > JOURNAL_BACKUP_MAX_BYTES
    )
      throw new JournalBackupError('TOO_LARGE');
  }
  const data = {
    format: 'justgo-data',
    formatVersion: 1,
    ...snapshot,
    attempts: snapshot.attempts.map((attempt) =>
      completionAttemptSchema.strip().parse(attempt),
    ),
  };
  parseData(data, snapshot.owner);
  const privateById = new Map(
    snapshot.journal.entries.map((entry) => [entry.id, entry]),
  );
  const completionIds = new Set(snapshot.attempts.map((attempt) => attempt.id));
  const csv =
    '\uFEFF' +
    [
      ['attempt_id', 'challenge', 'date', 'feeling', 'reflection', 'version']
        .map(csvCell)
        .join(','),
      ...snapshot.attempts.map((attempt) => {
        const entry = privateById.get(attempt.id);
        return [
          attempt.id,
          attempt.instruction,
          attempt.activityDate,
          entry?.reflection.feeling,
          entry?.reflection.text,
          'current',
        ]
          .map(csvCell)
          .join(',');
      }),
      ...snapshot.journal.entries
        .filter((entry) => !completionIds.has(entry.id))
        .map((entry) =>
          [
            entry.id,
            entry.instruction,
            entry.activityDate,
            entry.reflection.feeling,
            entry.reflection.text,
            'journal only',
          ]
            .map(csvCell)
            .join(','),
        ),
      ...snapshot.journal.alternatives.map((entry) =>
        [
          entry.id,
          entry.instruction,
          entry.activityDate,
          entry.reflection.feeling,
          entry.reflection.text,
          'preserved',
        ]
          .map(csvCell)
          .join(','),
      ),
    ].join('\r\n') +
    '\r\n';
  const bytes = zipSync(
    {
      'data.json': strToU8(JSON.stringify(data)),
      'journal.json': encodeJournalSnapshot({
        accountId: snapshot.owner.id,
        ...snapshot.journal,
        createdAt: snapshot.exportedAt,
      }),
      'activity.csv': strToU8(csv),
      'README.txt': strToU8(
        'JustGO data backup\n\nThis private snapshot contains challenge history, feelings, reflections, preserved versions and preferences. Use Import data in JustGO and choose this unchanged ZIP. Save it in Files, iCloud Drive or another private destination. It does not contain account credentials or sign you in. Account-owned backups require the same account; guest backups can be added to your current collection. Later changes need a new download.\n',
      ),
    },
    { level: 0 },
  );
  if (bytes.length > JOURNAL_BACKUP_MAX_BYTES)
    throw new JournalBackupError('TOO_LARGE');
  return {
    name: `JustGO-data-${snapshot.exportedAt.replace(/[:.]/g, '-')}.zip`,
    bytes,
  };
}
export function readDataBackup(
  bytes: Uint8Array,
  destination: BackupOwner,
): RestorableData {
  if (bytes.length > JOURNAL_BACKUP_MAX_BYTES)
    throw new JournalBackupError('TOO_LARGE');
  ownerSchema.parse(destination);
  let archive: ReturnType<typeof readStoredBackupZip>;
  let data: unknown;
  let journal: unknown;
  try {
    archive = readStoredBackupZip(bytes);
    journal = archive.journal ? JSON.parse(archive.journal) : null;
    data = archive.data ? JSON.parse(archive.data) : null;
  } catch {
    invalid();
  }
  if (
    data &&
    typeof data === 'object' &&
    'format' in data &&
    data.format === 'justgo-data'
  )
    return parseData(data, destination);
  if (
    data &&
    typeof data === 'object' &&
    'formatVersion' in data &&
    (data.formatVersion === 1 || data.formatVersion === 2)
  ) {
    const previous = z
      .object({
        formatVersion: z.union([z.literal(1), z.literal(2)]),
        exportedAt: z.iso.datetime(),
        account: z.object({ id: z.uuid() }).passthrough(),
        attempts: z.array(attemptSchema).max(JOURNAL_BACKUP_MAX_ENTRIES),
        localChanges: z
          .array(
            z
              .object({
                status: z.enum(['pending_upload', 'needs_attention']),
                attempt: attemptSchema,
              })
              .passthrough(),
          )
          .max(JOURNAL_BACKUP_MAX_ENTRIES),
        preferences: preferencesSchema,
      })
      .passthrough()
      .safeParse(data);
    if (
      !previous.success ||
      previous.data.account.id !== destination.id ||
      destination.kind !== 'account'
    )
      invalid();
    if (
      previous.data.attempts.length + previous.data.localChanges.length >
      JOURNAL_BACKUP_MAX_ENTRIES
    )
      throw new JournalBackupError('TOO_LARGE');
    const oldJournal = journal
      ? parseJournalSnapshot(journal, destination.id)
      : {
          entries: [] as LocalJournalEntry[],
          alternatives: [] as LocalJournalEntry[],
        };
    if (previous.data.formatVersion === 2 && !journal) invalid();
    const preferred = new Map(
      oldJournal.entries.map((entry) => [entry.id, entry]),
    );
    // Earlier exports embedded private content in accepted and rejected local rows.
    // Preserve writing from either; only accepted/pending completions count as reps.
    for (const attempt of [
      ...previous.data.attempts,
      ...previous.data.localChanges.map((change) => change.attempt),
    ]) {
      if (!attempt.reflection) continue;
      const entry = journalEntry(destination.id, attempt);
      const old = preferred.get(entry.id);
      if (!old) preferred.set(entry.id, entry);
      else if (JSON.stringify(old) !== JSON.stringify(entry))
        oldJournal.alternatives.push(entry);
    }
    const attempts = new Map(
      previous.data.attempts.map((attempt) => [attempt.id, attempt]),
    );
    for (const { attempt, status } of previous.data.localChanges) {
      const old = attempts.get(attempt.id);
      if (old && !sameHistoricalContext(old, attempt)) invalid();
      if (!old && status === 'pending_upload')
        attempts.set(attempt.id, attempt);
    }
    return parseData(
      {
        format: 'justgo-data',
        formatVersion: 1,
        owner: destination,
        exportedAt: previous.data.exportedAt,
        preferences: previous.data.preferences,
        attempts: [...attempts.values()].map((attempt) =>
          completionAttemptSchema.strip().parse(attempt),
        ),
        journal: {
          entries: [...preferred.values()],
          alternatives: oldJournal.alternatives,
        },
      },
      destination,
    );
  }
  if (data !== null) invalid();
  const oldJournal = parseJournalSnapshot(journal, destination.id);
  return {
    owner: destination,
    exportedAt: oldJournal.createdAt,
    attempts: [],
    journal: {
      entries: oldJournal.entries,
      alternatives: oldJournal.alternatives,
    },
    preferences: null,
    legacyJournalOnly: true,
  };
}
