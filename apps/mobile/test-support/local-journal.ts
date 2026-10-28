import type {
  JournalBackend,
  JournalTransaction,
} from '../src/data/journal/backend';
import {
  journalEntryIdentity,
  type LocalJournalEntry,
} from '../src/data/journal/model';
import { LocalJournalRepository } from '../src/data/journal/repository';

type State = {
  entries: Map<string, LocalJournalEntry>;
  alternatives: Map<string, LocalJournalEntry>;
};
const clone = (entry: LocalJournalEntry): LocalJournalEntry =>
  JSON.parse(JSON.stringify(entry)) as LocalJournalEntry;
const copyState = (state?: State): State => ({
  entries: new Map(
    [...(state?.entries ?? [])].map(([id, entry]) => [id, clone(entry)]),
  ),
  alternatives: new Map(
    [...(state?.alternatives ?? [])].map(([id, entry]) => [id, clone(entry)]),
  ),
});

export class MemoryJournalBackend implements JournalBackend {
  private accounts = new Map<string, State>();
  private queue: Promise<unknown> = Promise.resolve();
  failCommit = false;
  failDelete = false;
  beforeCommit: (() => Promise<void>) | null = null;
  commits = 0;
  deletions: string[] = [];

  transaction<T>(
    accountId: string,
    action: (transaction: JournalTransaction) => Promise<T>,
  ): Promise<T> {
    const operation = this.queue.then(async () => {
      const state = copyState(this.accounts.get(accountId));
      let dirty = false;
      const result = await action({
        get: (id) =>
          Promise.resolve(
            state.entries.get(id) ? clone(state.entries.get(id)!) : null,
          ),
        list: () => Promise.resolve([...state.entries.values()].map(clone)),
        put: (entry) => {
          dirty = true;
          state.entries.set(entry.id, clone(entry));
          return Promise.resolve();
        },
        listConflicts: () =>
          Promise.resolve([...state.alternatives.values()].map(clone)),
        putConflict: (entry) => {
          dirty = true;
          state.alternatives.set(journalEntryIdentity(entry), clone(entry));
          return Promise.resolve();
        },
      });
      if (dirty) {
        await this.beforeCommit?.();
        if (this.failCommit) throw new Error('Synthetic commit failure');
        this.accounts.set(accountId, state);
        this.commits++;
      }
      return result;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async deleteOwned(accountId: string): Promise<void> {
    await this.queue;
    if (this.failDelete) throw new Error('Synthetic delete failure');
    this.accounts.delete(accountId);
    this.deletions.push(accountId);
  }
}

const backends = new WeakMap<object, MemoryJournalBackend>();
export function memoryJournalBackend(owner: object): MemoryJournalBackend {
  let backend = backends.get(owner);
  if (!backend) {
    backend = new MemoryJournalBackend();
    backends.set(owner, backend);
  }
  return backend;
}
export function memoryLocalJournal(
  accountId: string,
  owner: object,
): LocalJournalRepository {
  return new LocalJournalRepository(accountId, memoryJournalBackend(owner));
}
