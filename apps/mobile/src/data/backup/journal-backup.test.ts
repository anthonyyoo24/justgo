import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  createJournalBackup,
  readJournalBackup,
  JOURNAL_BACKUP_MAX_BYTES,
  JOURNAL_BACKUP_MAX_ENTRIES,
} from './journal-backup';
import type { LocalJournalEntry } from '../journal/model';

const accountId = '10000000-0000-4000-8000-000000000001';
const otherOwner = '10000000-0000-4000-8000-000000000002';
const entry: LocalJournalEntry = {
  accountId,
  id: '20000000-0000-4000-8000-000000000001',
  challengeId: 'retired-challenge',
  venue: 'park',
  levelId: 'level-1',
  instruction: 'Historical challenge context.',
  startedAt: '2025-01-03T15:00:00.000Z',
  startTimeZone: 'America/Toronto',
  displayTimeZone: 'America/Toronto',
  activityDate: '2025-01-03',
  feelingScaleVersion: 1,
  reflection: {
    feeling: 'about_the_same',
    text: 'Line one.\nこんにちは 🌲',
    revision: 3,
  },
};
const data = () => ({
  format: 'justgo-journal',
  formatVersion: 1,
  accountId,
  createdAt: '2026-10-20T15:00:00.000Z',
  entries: [entry],
  alternatives: [],
});
const archive = (value: unknown = data()) =>
  zipSync({ 'journal.json': strToU8(JSON.stringify(value)) }, { level: 0 });

it('round trips every saved entry and historical alternative in a data-only ZIP', () => {
  const alternate = {
    ...entry,
    reflection: { ...entry.reflection, text: 'Preserved legacy version.' },
  };
  const result = createJournalBackup({
    accountId,
    entries: [entry],
    alternatives: [alternate],
    createdAt: data().createdAt,
  });
  expect(result.name).toBe('JustGO-journal-2026-10-20T15-00-00-000Z.zip');
  const files = unzipSync(result.bytes);
  expect(Object.keys(files)).toEqual(['journal.json']);
  expect(JSON.parse(strFromU8(files['journal.json']!))).toEqual({
    ...data(),
    alternatives: [alternate],
  });
  expect(readJournalBackup(result.bytes, accountId)).toEqual({
    ...data(),
    alternatives: [alternate],
  });
});

it('supports empty journals and a missing optional alternatives input when creating a snapshot', () => {
  const result = createJournalBackup({ accountId, entries: [] });
  expect(readJournalBackup(result.bytes, accountId)).toMatchObject({
    entries: [],
    alternatives: [],
  });
});

it('requires the recovered account to own the backup', () => {
  expect(() => readJournalBackup(archive(), otherOwner)).toThrow(
    'Sign in to the account',
  );
});

it.each([
  ['unsupported version', { ...data(), formatVersion: 2 }],
  ['unknown format', { ...data(), format: 'justgo-export' }],
  ['credentials', { ...data(), session: 'synthetic-secret' }],
  ['queue', { ...data(), operations: [] }],
  ['invalid creation date', { ...data(), createdAt: '2026-02-31' }],
  ['duplicate ID', { ...data(), entries: [entry, entry] }],
  [
    'foreign entry',
    { ...data(), entries: [{ ...entry, accountId: otherOwner }] },
  ],
  ['invalid ID', { ...data(), entries: [{ ...entry, id: '../private' }] }],
  [
    'invalid date',
    { ...data(), entries: [{ ...entry, activityDate: '2026-02-31' }] },
  ],
  [
    'invalid zone',
    {
      ...data(),
      entries: [{ ...entry, displayTimeZone: 'Somewhere/Missing' }],
    },
  ],
  [
    'unknown scale',
    { ...data(), entries: [{ ...entry, feelingScaleVersion: 2 }] },
  ],
  [
    'unknown feeling',
    {
      ...data(),
      entries: [
        { ...entry, reflection: { ...entry.reflection, feeling: 'happy' } },
      ],
    },
  ],
  [
    'long text',
    {
      ...data(),
      entries: [
        {
          ...entry,
          reflection: { ...entry.reflection, text: 'x'.repeat(10001) },
        },
      ],
    },
  ],
  ['receipt', { ...data(), entries: [{ ...entry, receipt: 'private' }] }],
  ['orphan alternative', { ...data(), entries: [], alternatives: [entry] }],
  [
    'foreign alternative',
    { ...data(), alternatives: [{ ...entry, accountId: otherOwner }] },
  ],
  ['missing alternatives field', { ...data(), alternatives: undefined }],
])('rejects %s before any journal writes', (_name, value) => {
  expect(() => readJournalBackup(archive(value), accountId)).toThrow(
    'supported format',
  );
});

it('bounds total records across current and preserved versions', () => {
  const alternatives = Array<LocalJournalEntry>(
    JOURNAL_BACKUP_MAX_ENTRIES,
  ).fill(entry);
  expect(() =>
    createJournalBackup({ accountId, entries: [entry], alternatives }),
  ).toThrow('size limit');
  expect(() =>
    readJournalBackup(
      archive({
        ...data(),
        alternatives: Array<unknown>(JOURNAL_BACKUP_MAX_ENTRIES).fill({}),
      }),
      accountId,
    ),
  ).toThrow('size limit');
});

it('rejects an oversized archive before inspecting headers', () => {
  expect(() =>
    readJournalBackup(new Uint8Array(JOURNAL_BACKUP_MAX_BYTES + 1), accountId),
  ).toThrow('size limit');
});

it('bounds backup creation before allocating a full oversized JSON snapshot', () => {
  const large = {
    ...entry,
    instruction: '界'.repeat(10_000),
    reflection: { ...entry.reflection, text: '界'.repeat(10_000) },
  };
  const stringify = jest.spyOn(JSON, 'stringify');
  try {
    expect(() =>
      createJournalBackup({
        accountId,
        entries: [large],
        alternatives: Array<LocalJournalEntry>(600).fill(large),
      }),
    ).toThrow('size limit');
    expect(
      stringify.mock.calls.some(
        ([value]) =>
          value !== null &&
          typeof value === 'object' &&
          'entries' in value &&
          Array.isArray(value.entries) &&
          value.entries.length > 0,
      ),
    ).toBe(false);
  } finally {
    stringify.mockRestore();
  }
});

it.each([
  ['CSV', { 'activity.csv': strToU8('id,reflection\n1,private') }],
  ['unsupported path', { '../journal.json': strToU8(JSON.stringify(data())) }],
  [
    'extra entry',
    {
      'journal.json': strToU8(JSON.stringify(data())),
      'session.json': strToU8('{}'),
    },
  ],
])('rejects %s archive entries', (_name, files) => {
  expect(() =>
    readJournalBackup(zipSync(files, { level: 0 }), accountId),
  ).toThrow('supported format');
});

it('rejects compressed archives, including highly compressible oversized input, without inflation', () => {
  const compressed = zipSync({
    'journal.json': strToU8('x'.repeat(JOURNAL_BACKUP_MAX_BYTES + 1)),
  });
  expect(compressed.length).toBeLessThan(100_000);
  expect(() => readJournalBackup(compressed, accountId)).toThrow(
    'supported format',
  );
});

it.each([
  [
    'truncated data',
    (bytes: Uint8Array) => bytes.subarray(0, bytes.length - 1),
  ],
  ['trailing bytes', (bytes: Uint8Array) => new Uint8Array([...bytes, 0])],
  [
    'bad CRC',
    (bytes: Uint8Array) => {
      bytes[42] = 0;
      return bytes;
    },
  ],
  [
    'forged size',
    (bytes: Uint8Array) => {
      new DataView(bytes.buffer).setUint32(18, 0xffffffff, true);
      return bytes;
    },
  ],
  [
    'forged central offset',
    (bytes: Uint8Array) => {
      new DataView(bytes.buffer).setUint32(bytes.length - 6, 0xffffffff, true);
      return bytes;
    },
  ],
  [
    'encrypted flag',
    (bytes: Uint8Array) => {
      bytes[6] = 1;
      return bytes;
    },
  ],
  [
    'central header mismatch',
    (bytes: Uint8Array) => {
      const view = new DataView(bytes.buffer);
      const central = view.getUint32(bytes.length - 6, true);
      view.setUint32(central + 20, 1, true);
      return bytes;
    },
  ],
])('rejects %s safely', (_name, alter) => {
  expect(() => readJournalBackup(alter(archive()), accountId)).toThrow(
    'supported format',
  );
});

it('rejects invalid JSON and invalid UTF-8 without exposing source text', () => {
  for (const bytes of [
    strToU8('private malformed text'),
    new Uint8Array([0xc0, 0xaf]),
  ]) {
    expect(() =>
      readJournalBackup(
        zipSync({ 'journal.json': bytes }, { level: 0 }),
        accountId,
      ),
    ).toThrow('Choose an unchanged JustGO');
  }
});
