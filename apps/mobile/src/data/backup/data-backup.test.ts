import { completionAttemptSchema } from '@justgo/contracts';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  createDataBackup,
  readDataBackup,
  type DataBackup,
} from './data-backup';
import {
  createJournalBackup,
  JOURNAL_BACKUP_MAX_BYTES,
  JOURNAL_BACKUP_MAX_ENTRIES,
} from './journal-backup';
import { journalEntry } from '../activity/private-journal';
import { attempt, owner, otherOwner } from '../../../test-support/journal';

const entry = journalEntry(owner, {
  ...attempt(),
  reflection: {
    feeling: 'a_little_better',
    text: '=Private\nこんにちは 🌲',
    revision: 1,
  },
});
const snapshot = (): DataBackup => ({
  owner: { id: owner, kind: 'account' },
  exportedAt: '2026-10-20T12:00:00.000Z',
  attempts: [attempt()],
  journal: { entries: [entry], alternatives: [] },
  preferences: { reduceMotion: true, haptics: false },
});
function editArchive(edit: (data: Record<string, unknown>) => void) {
  const files = unzipSync(createDataBackup(snapshot()).bytes);
  const data = JSON.parse(strFromU8(files['data.json']!)) as Record<
    string,
    unknown
  >;
  edit(data);
  files['data.json'] = strToU8(JSON.stringify(data));
  return zipSync(files, { level: 0 });
}

it('round trips full history, private writing, alternatives and preferences without credentials or queue state', () => {
  const data = snapshot();
  data.journal.alternatives.push({
    ...entry,
    instruction: 'Earlier wording',
    reflection: { ...entry.reflection, text: 'Other version' },
  });
  const backup = createDataBackup(data);
  expect(readDataBackup(backup.bytes, data.owner)).toEqual({
    ...data,
    legacyJournalOnly: false,
  });
  const files = unzipSync(backup.bytes);
  expect(Object.keys(files)).toEqual([
    'data.json',
    'journal.json',
    'activity.csv',
    'README.txt',
  ]);
  expect(strFromU8(files['activity.csv']!)).toContain("'=Private");
  const exported = JSON.parse(strFromU8(files['data.json']!)) as {
    attempts: unknown[];
  };
  expect(exported.attempts[0]).not.toHaveProperty('reflection');
});

it('keeps orphan writing exportable and visible in CSV without inventing a challenge completion', () => {
  const data = { ...snapshot(), attempts: [] };
  const result = createDataBackup(data);
  expect(readDataBackup(result.bytes, data.owner)).toMatchObject({
    attempts: [],
    journal: { entries: [entry] },
  });
  expect(strFromU8(unzipSync(result.bytes)['activity.csv']!)).toContain(
    'journal only',
  );
});

it('accepts server-normalized timestamp precision without losing historical journal context', () => {
  const data = snapshot();
  data.journal.entries[0] = {
    ...entry,
    startedAt: entry.startedAt.replace('.000Z', '.000000Z'),
  };
  const result = readDataBackup(createDataBackup(data).bytes, data.owner);
  expect(result.journal.entries[0]?.startedAt).toBe(
    data.journal.entries[0].startedAt,
  );
  expect(result.attempts).toEqual(data.attempts);
});

it('rejects orphan alternatives that change historical identity before confirming an import', () => {
  expect(() =>
    createDataBackup({
      ...snapshot(),
      attempts: [],
      journal: {
        entries: [entry],
        alternatives: [{ ...entry, venue: 'cafe' }],
      },
    }),
  ).toThrow();
});

it('allows guest imports into a chosen collection but requires the same account for account-owned files', () => {
  const destination = { id: otherOwner, kind: 'account' as const };
  expect(() =>
    readDataBackup(createDataBackup(snapshot()).bytes, destination),
  ).toThrow('Sign in to the account');
  const guest = { ...snapshot(), owner: { id: owner, kind: 'guest' as const } };
  expect(
    readDataBackup(createDataBackup(guest).bytes, destination),
  ).toMatchObject({
    owner: destination,
    journal: { entries: [{ accountId: otherOwner }] },
  });
});

it.each([
  [
    'version',
    (data: Record<string, unknown>) => {
      data.formatVersion = 99;
    },
  ],
  [
    'credentials',
    (data: Record<string, unknown>) => {
      data.session = 'synthetic-token';
    },
  ],
  [
    'duplicate completions',
    (data: Record<string, unknown>) => {
      data.attempts = [attempt(), attempt()].map((attempt) =>
        completionAttemptSchema.strip().parse(attempt),
      );
    },
  ],
  [
    'mismatched historical context',
    (data: Record<string, unknown>) => {
      data.journal = {
        entries: [{ ...entry, challengeId: 'other-challenge' }],
        alternatives: [],
      };
    },
  ],
])('rejects %s before any data is imported', (_label, edit) => {
  expect(() => readDataBackup(editArchive(edit), snapshot().owner)).toThrow();
});

it('supports older journal-only files and does not pretend they contain challenge history or preferences', () => {
  const old = createJournalBackup({
    accountId: owner,
    entries: [entry],
    createdAt: snapshot().exportedAt,
  });
  expect(readDataBackup(old.bytes, snapshot().owner)).toMatchObject({
    attempts: [],
    preferences: null,
    legacyJournalOnly: true,
    journal: { entries: [entry] },
  });
});

it('restores the original account export while preserving rejected writing without counting it as a rep', () => {
  const rejected = {
    ...attempt(2),
    reflection: { ...entry.reflection, text: 'Retained rejected writing' },
  };
  const previous = {
    formatVersion: 1,
    exportedAt: snapshot().exportedAt,
    account: { id: owner },
    preferences: snapshot().preferences,
    attempts: [{ ...attempt(), reflection: entry.reflection }],
    localChanges: [
      { status: 'needs_attention', attempt: rejected },
      { status: 'pending_upload', attempt: attempt(3) },
    ],
  };
  const bytes = zipSync(
    {
      'data.json': strToU8(JSON.stringify(previous)),
      'activity.csv': strToU8('old'),
      'README.txt': strToU8('old'),
    },
    { level: 0 },
  );
  const restored = readDataBackup(bytes, snapshot().owner);
  expect(restored.attempts.map((value) => value.id)).toEqual([
    attempt().id,
    attempt(3).id,
  ]);
  expect(restored.journal.entries).toHaveLength(2);
  expect(restored.journal.entries[1]?.reflection.text).toBe(
    'Retained rejected writing',
  );
});

it('enforces archive, record and count bounds before constructing large output', () => {
  expect(() =>
    readDataBackup(
      new Uint8Array(JOURNAL_BACKUP_MAX_BYTES + 1),
      snapshot().owner,
    ),
  ).toThrow('size limit');
  expect(() =>
    createDataBackup({
      ...snapshot(),
      attempts: Array.from({ length: JOURNAL_BACKUP_MAX_ENTRIES + 1 }, () =>
        attempt(),
      ),
    }),
  ).toThrow('size limit');
  expect(() =>
    createDataBackup({
      ...snapshot(),
      journal: {
        entries: [{ ...entry, instruction: 'x'.repeat(70_000) }],
        alternatives: [],
      },
    }),
  ).toThrow('size limit');
});

it('rejects corrupted or unrelated archives', () => {
  const bytes = createDataBackup(snapshot()).bytes;
  bytes[50] = bytes[50]! ^ 1;
  expect(() => readDataBackup(bytes, snapshot().owner)).toThrow();
  expect(() =>
    readDataBackup(zipSync({ 'other.json': strToU8('{}') }), snapshot().owner),
  ).toThrow();
});
