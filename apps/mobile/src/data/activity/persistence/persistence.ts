import type { StoreApi } from 'zustand/vanilla';
import {
  cloneJournal,
  journalSchema,
  type JournalState,
  type JournalStorage,
} from '../model';

// A single serialized envelope commits displayed content, upload intent and receipts.
// Native writes cannot be cancelled safely: a later write waits for the earlier I/O.
export class JournalPersistence {
  dirty = false;
  protected = false;
  storageFull = false;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly key: string,
    private readonly storage: JournalStorage,
    private readonly store: StoreApi<JournalState>,
    private readonly committed: () => void,
  ) {}
  persist(): Promise<boolean> {
    const work = async () => {
      if (this.protected) return false;
      for (let retry = 0; retry < 2; retry++) {
        const snapshot = cloneJournal(this.store.getState().journal);
        for (const record of Object.values(snapshot.records))
          record.phoneVersion = record.version;
        const settled = new Set(
          snapshot.operations
            .filter((op) => op.state === 'acknowledged')
            .map((op) => op.id),
        );
        snapshot.operations = snapshot.operations.filter(
          (op) => !settled.has(op.id),
        );
        const serialized = JSON.stringify(journalSchema.parse(snapshot));
        try {
          await this.storage.setItem(this.key, serialized);
        } catch (error) {
          this.storageFull =
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ENOSPC';
          this.dirty = true;
          if (retry === 0) {
            // Only replaceable confirmed read caches; never pending user content.
            const journal = cloneJournal(this.store.getState().journal);
            journal.calendar = null;
            journal.today = null;
            this.store.setState({ journal });
          }
          continue;
        }
        const live = cloneJournal(this.store.getState().journal);
        for (const [id, record] of Object.entries(snapshot.records)) {
          const current = live.records[id];
          if (current)
            current.phoneVersion = Math.max(
              current.phoneVersion,
              record.phoneVersion,
            );
        }
        // Acknowledgements received during this write were not committed by it.
        live.operations = live.operations.filter((op) => !settled.has(op.id));
        this.dirty = JSON.stringify(journalSchema.parse(live)) !== serialized;
        this.store.setState({ journal: live });
        this.storageFull = false;
        this.committed();
        return true;
      }
      return false;
    };
    const result = this.writes.then(work, work);
    this.writes = result;
    return result;
  }
}
