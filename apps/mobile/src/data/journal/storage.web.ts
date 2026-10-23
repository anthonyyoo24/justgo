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

const databaseName = (accountId: string) => `justgo-journal-v1-${accountId}`;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new LocalJournalError('UNAVAILABLE'));
  });
}

// IndexedDB is only the development browser adapter. It does not establish
// SQLite crash behavior or iOS file protection/backup acceptance.
export class IndexedDBJournalBackend implements JournalBackend {
  private databases = new Map<string, Promise<IDBDatabase>>();

  constructor(private readonly factory: () => IDBFactory = () => indexedDB) {}

  private open(accountId: string): Promise<IDBDatabase> {
    let pending = this.databases.get(accountId);
    if (!pending) {
      pending = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory().open(databaseName(accountId), 1);
        let blocked = false;
        request.onupgradeneeded = () => {
          request.result.createObjectStore('entries', { keyPath: 'id' });
          request.result.createObjectStore('alternatives');
        };
        request.onsuccess = () => {
          const database = request.result;
          if (blocked) {
            database.close();
            return;
          }
          database.onversionchange = () => {
            database.close();
            this.databases.delete(accountId);
          };
          resolve(database);
        };
        request.onerror = () => reject(new LocalJournalError('UNAVAILABLE'));
        request.onblocked = () => {
          blocked = true;
          reject(new LocalJournalError('UNAVAILABLE'));
        };
      }).catch((error: unknown) => {
        this.databases.delete(accountId);
        throw error;
      });
      this.databases.set(accountId, pending);
    }
    return pending;
  }

  async transaction<T>(
    accountId: string,
    action: (transaction: JournalTransaction) => Promise<T>,
  ): Promise<T> {
    const database = await this.open(accountId);
    const transaction = database.transaction(
      ['entries', 'alternatives'],
      'readwrite',
      { durability: 'strict' },
    );
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(new LocalJournalError('UNAVAILABLE'));
    });
    // Attach a rejection handler immediately; a failed request may abort before
    // the action reaches the commit wait below.
    const outcome = completed.then(
      () => false,
      () => true,
    );
    const entries = transaction.objectStore('entries');
    const alternatives = transaction.objectStore('alternatives');
    try {
      const result = await action({
        get: async (id) => {
          const entry: unknown = await requestResult(entries.get(id));
          return entry === undefined ? null : parseOwnedEntry(entry, accountId);
        },
        list: async () => {
          const values: unknown[] = await requestResult(entries.getAll());
          return values.map((entry) => parseOwnedEntry(entry, accountId));
        },
        put: async (entry) => {
          await requestResult(entries.put(entry));
        },
        listConflicts: async () => {
          const values: unknown[] = await requestResult(alternatives.getAll());
          return values.map((entry) => parseOwnedEntry(entry, accountId));
        },
        putConflict: async (entry) => {
          await requestResult(
            alternatives.put(entry, journalEntryIdentity(entry)),
          );
        },
      });
      const failure = await outcome;
      if (failure) throw new LocalJournalError('UNAVAILABLE');
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // An automatically aborted transaction is already rolled back.
      }
      await outcome;
      throw error;
    }
  }

  async deleteOwned(accountId: string): Promise<void> {
    const pending = this.databases.get(accountId);
    if (pending) {
      (await pending).close();
      this.databases.delete(accountId);
    }
    await new Promise<void>((resolve, reject) => {
      const request = this.factory().deleteDatabase(databaseName(accountId));
      request.onsuccess = () => resolve();
      request.onerror = request.onblocked = () =>
        reject(new LocalJournalError('UNAVAILABLE'));
    });
  }
}

export const localJournalBackend: JournalBackend = serializeJournalBackend(
  new IndexedDBJournalBackend(),
);
