import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as SQLite from 'expo-sqlite';
import type { LocalJournalEntry } from './model';
import { SQLiteJournalBackend } from './storage';
import { LocalJournalRepository } from './repository';

let mockDirectory = '';
let mockFailCommit = false;
let mockFailOpen = false;
const mockConnections: DatabaseSync[] = [];
jest.mock('expo-sqlite', () => {
  const { DatabaseSync } =
    jest.requireActual<typeof import('node:sqlite')>('node:sqlite');
  const { join } = jest.requireActual<typeof import('node:path')>('node:path');
  const { rmSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
  return {
    openDatabaseAsync: (name: string) => {
      if (mockFailOpen)
        return Promise.reject(new Error('Synthetic open failure'));
      const database = new DatabaseSync(join(mockDirectory, name));
      mockConnections.push(database);
      const connection = {
        execAsync: (sql: string) => Promise.resolve(database.exec(sql)),
        getFirstAsync: (sql: string, ...parameters: SQLInputValue[]) =>
          Promise.resolve(database.prepare(sql).get(...parameters) ?? null),
        getAllAsync: (sql: string, ...parameters: SQLInputValue[]) =>
          Promise.resolve(database.prepare(sql).all(...parameters)),
        runAsync: (sql: string, ...parameters: SQLInputValue[]) =>
          Promise.resolve(database.prepare(sql).run(...parameters)),
        closeAsync: () => Promise.resolve(database.close()),
        withExclusiveTransactionAsync: async (
          action: (connection: unknown) => Promise<void>,
        ) => {
          database.exec('BEGIN IMMEDIATE');
          try {
            await action(connection);
            if (mockFailCommit) throw new Error('Synthetic commit failure');
            database.exec('COMMIT');
          } catch (error) {
            database.exec('ROLLBACK');
            throw error;
          }
        },
      };
      return Promise.resolve(connection);
    },
    deleteDatabaseAsync: (name: string) => {
      // Match Expo's native delete: only the main file, and absent files fail.
      rmSync(join(mockDirectory, name));
      return Promise.resolve();
    },
  };
});

const owner = '10000000-0000-4000-8000-000000000001';
const anotherOwner = '10000000-0000-4000-8000-000000000002';
const id = '20000000-0000-4000-8000-000000000001';
const secondId = '20000000-0000-4000-8000-000000000002';
const entry: LocalJournalEntry = {
  accountId: owner,
  id,
  challengeId: 'challenge-1',
  venue: 'park',
  levelId: 'level-1',
  instruction: 'Synthetic historical context',
  startedAt: '2026-10-01T12:00:00.000Z',
  startTimeZone: 'UTC',
  displayTimeZone: 'UTC',
  activityDate: '2026-10-01',
  feelingScaleVersion: 1,
  reflection: { feeling: null, text: 'Synthetic writing', revision: 1 },
};
const filename = (accountId: string) =>
  join(mockDirectory, `justgo-journal-v1-${accountId}.db`);
const backendWithDriver = () =>
  new SQLiteJournalBackend(() => Promise.resolve(SQLite));

beforeEach(() => {
  mockDirectory = mkdtempSync(join(tmpdir(), 'justgo-journal-test-'));
  mockFailCommit = false;
  mockFailOpen = false;
});
afterEach(() => {
  for (const database of mockConnections.splice(0)) {
    if (database.isOpen) database.close();
  }
  rmSync(mockDirectory, { recursive: true, force: true });
});

it('uses real SQLite SQL to preserve entries and alternatives across connection restart', async () => {
  const journal = new LocalJournalRepository(owner, backendWithDriver());
  const alternative = {
    ...entry,
    reflection: { ...entry.reflection, text: 'Legacy copy' },
  };
  await journal.mergeLegacy([entry, alternative, alternative]);
  for (const database of mockConnections) database.close();
  const reopened = new LocalJournalRepository(owner, backendWithDriver());
  expect(await reopened.snapshot()).toEqual({
    entries: [entry],
    alternatives: [alternative],
  });
  expect(await reopened.get(id)).toEqual(entry);
  expect(await reopened.get(secondId)).toBeNull();
  await reopened.save({
    ...entry,
    reflection: { ...entry.reflection, text: 'New text', revision: 2 },
  });
  expect((await reopened.get(id))?.reflection.text).toBe('New text');
});

it('binds private writing as data and rolls back a failed multi-entry commit', async () => {
  const journal = new LocalJournalRepository(owner, backendWithDriver());
  const sqlText = "Synthetic '); DROP TABLE journal_entries; --";
  await journal.save({
    ...entry,
    reflection: { ...entry.reflection, text: sqlText },
  });
  mockFailCommit = true;
  await expect(
    journal.merge([{ ...entry, id: secondId }]),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  mockFailCommit = false;
  expect(await journal.list()).toEqual([
    { ...entry, reflection: { ...entry.reflection, text: sqlText } },
  ]);
  await journal.merge([{ ...entry, id: secondId }]);
  expect(await journal.list()).toHaveLength(2);
});

it('removes only the deleted account database and its SQLite sidecars', async () => {
  const backend = backendWithDriver();
  const journal = new LocalJournalRepository(owner, backend);
  const other = new LocalJournalRepository(anotherOwner, backend);
  await journal.save(entry);
  await other.save({ ...entry, accountId: anotherOwner });
  expect(existsSync(filename(owner))).toBe(true);
  await journal.deleteOwned();
  for (const suffix of ['', '-wal', '-shm'])
    expect(existsSync(filename(owner) + suffix)).toBe(false);
  expect(await other.list()).toEqual([{ ...entry, accountId: anotherOwner }]);
  await backend.deleteOwned(owner);
});

it('refuses an unsupported schema without replacing it and retries an initialization failure', async () => {
  const existing = new DatabaseSync(filename(owner));
  existing.exec(
    'PRAGMA user_version = 2; CREATE TABLE future_marker (id TEXT);',
  );
  existing.close();
  const backend = backendWithDriver();
  const journal = new LocalJournalRepository(owner, backend);
  await expect(journal.list()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  const preserved = new DatabaseSync(filename(owner));
  expect(preserved.prepare('PRAGMA user_version').get()).toMatchObject({
    user_version: 2,
  });
  expect(
    preserved
      .prepare("SELECT name FROM sqlite_master WHERE name = 'future_marker'")
      .get(),
  ).toBeDefined();
  preserved.close();
  await backend.deleteOwned(owner);
  mockFailOpen = true;
  await expect(journal.list()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  mockFailOpen = false;
  expect(await journal.list()).toEqual([]);
});

it('does not reset a database containing malformed or wrong-account rows', async () => {
  const backend = backendWithDriver();
  const journal = new LocalJournalRepository(owner, backend);
  await journal.save(entry);
  const database = mockConnections[0]!;
  database
    .prepare('UPDATE journal_entries SET entry_json = ?')
    .run('{bad-json');
  await expect(journal.list()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(
    database.prepare('SELECT COUNT(*) AS total FROM journal_entries').get(),
  ).toMatchObject({ total: 1 });
  database
    .prepare('UPDATE journal_entries SET entry_json = ?')
    .run(JSON.stringify({ ...entry, accountId: anotherOwner }));
  await expect(journal.get(id)).rejects.toMatchObject({
    code: 'WRONG_ACCOUNT',
  });
});
