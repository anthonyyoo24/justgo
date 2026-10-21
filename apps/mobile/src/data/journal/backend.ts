import type { LocalJournalEntry } from './model';

export interface JournalTransaction {
  get(id: string): Promise<LocalJournalEntry | null>;
  list(): Promise<LocalJournalEntry[]>;
  put(entry: LocalJournalEntry): Promise<void>;
  listConflicts(): Promise<LocalJournalEntry[]>;
  putConflict(entry: LocalJournalEntry): Promise<void>;
}

export interface JournalBackend {
  // A rejected callback or failed commit leaves all prior data intact.
  transaction<T>(
    accountId: string,
    action: (transaction: JournalTransaction) => Promise<T>,
  ): Promise<T>;
  deleteOwned(accountId: string): Promise<void>;
}

// Account repositories may be disposed/recreated while the previous native
// operation finishes. Keep one queue per database across those lifetimes.
export function serializeJournalBackend(
  backend: JournalBackend,
): JournalBackend {
  const queues = new Map<string, Promise<unknown>>();
  function run<T>(accountId: string, action: () => Promise<T>): Promise<T> {
    const pending = (queues.get(accountId) ?? Promise.resolve()).then(action);
    queues.set(
      accountId,
      pending.catch(() => undefined),
    );
    return pending;
  }
  return {
    transaction: (accountId, action) =>
      run(accountId, () => backend.transaction(accountId, action)),
    deleteOwned: (accountId) =>
      run(accountId, () => backend.deleteOwned(accountId)),
  };
}
