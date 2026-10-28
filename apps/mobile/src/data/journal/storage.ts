import type { SQLiteDatabase } from 'expo-sqlite';
import {
  serializeJournalBackend,
  type JournalBackend,
  type JournalTransaction,
} from './backend';
import {
  journalEntryIdentity,
  LocalJournalError,
  parseOwnedEntry,
} from './model';

const databaseName = (accountId: string) => `justgo-journal-v1-${accountId}.db`;
type SQLiteDriver = Pick<
  typeof import('expo-sqlite'),
  'openDatabaseAsync' | 'deleteDatabaseAsync'
>;

export class SQLiteJournalBackend implements JournalBackend {
  private databases = new Map<string, Promise<SQLiteDatabase>>();

  constructor(
    private readonly load: () => Promise<SQLiteDriver> = () =>
      import('expo-sqlite'),
  ) {}

  private open(accountId: string): Promise<SQLiteDatabase> {
    let pending = this.databases.get(accountId);
    if (!pending) {
      pending = this.initialize(accountId).catch((error: unknown) => {
        this.databases.delete(accountId);
        throw error;
      });
      this.databases.set(accountId, pending);
    }
    return pending;
  }

  private async initialize(accountId: string): Promise<SQLiteDatabase> {
    // Lazy import permits a visible save failure on an older development binary
    // missing SQLite, rather than crashing while importing the app shell.
    const { openDatabaseAsync } = await this.load();
    const database = await openDatabaseAsync(databaseName(accountId));
    try {
      await database.execAsync(
        'PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA secure_delete = ON; PRAGMA busy_timeout = 5000;',
      );
      const version = await database.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      );
      if ((version?.user_version ?? 0) > 1)
        throw new LocalJournalError('UNAVAILABLE');
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(`
          CREATE TABLE IF NOT EXISTS journal_entries (
            id TEXT PRIMARY KEY NOT NULL,
            entry_json TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS journal_alternatives (
            entry_json TEXT PRIMARY KEY NOT NULL
          );
          PRAGMA user_version = 1;
        `);
      });
      return database;
    } catch (error) {
      await database.closeAsync();
      throw error;
    }
  }

  async transaction<T>(
    accountId: string,
    action: (transaction: JournalTransaction) => Promise<T>,
  ): Promise<T> {
    const database = await this.open(accountId);
    // Exclusive transactions prevent unrelated async work from joining an
    // import/edit and ensure a failed callback rolls back every entry.
    let result: T | undefined;
    await database.withExclusiveTransactionAsync(async (transaction) => {
      const decode = (row: { entry_json: string }) =>
        parseOwnedEntry(JSON.parse(row.entry_json) as unknown, accountId);
      result = await action({
        get: async (id) => {
          const row = await transaction.getFirstAsync<{ entry_json: string }>(
            'SELECT entry_json FROM journal_entries WHERE id = ?',
            id,
          );
          return row ? decode(row) : null;
        },
        list: async () =>
          (
            await transaction.getAllAsync<{ entry_json: string }>(
              'SELECT entry_json FROM journal_entries ORDER BY id',
            )
          ).map(decode),
        put: async (entry) => {
          await transaction.runAsync(
            'INSERT INTO journal_entries (id, entry_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET entry_json = excluded.entry_json',
            entry.id,
            journalEntryIdentity(entry),
          );
        },
        listConflicts: async () =>
          (
            await transaction.getAllAsync<{ entry_json: string }>(
              'SELECT entry_json FROM journal_alternatives ORDER BY entry_json',
            )
          ).map(decode),
        putConflict: async (entry) => {
          await transaction.runAsync(
            'INSERT INTO journal_alternatives (entry_json) VALUES (?) ON CONFLICT(entry_json) DO NOTHING',
            journalEntryIdentity(entry),
          );
        },
      });
    });
    // The transaction callback always assigns result before successful commit.
    return result as T;
  }

  async deleteOwned(accountId: string): Promise<void> {
    const { openDatabaseAsync, deleteDatabaseAsync } = await this.load();
    const pending = this.databases.get(accountId);
    // Expo rejects deleting an absent file. Opening without initializing the
    // schema makes cleanup idempotent after a prior deletion or interrupted
    // account cleanup, and still permits deleting unsupported future schemas.
    const database = pending
      ? await pending
      : await openDatabaseAsync(databaseName(accountId));
    await database.closeAsync();
    this.databases.delete(accountId);
    // Each account has a separate database, including its WAL/SHM files.
    await deleteDatabaseAsync(databaseName(accountId));
  }
}

export const localJournalBackend: JournalBackend = serializeJournalBackend(
  new SQLiteJournalBackend(),
);
