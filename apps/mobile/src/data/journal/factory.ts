import { LocalJournalRepository } from './repository';
import { localJournalBackend } from './storage';

const journals = new Map<string, LocalJournalRepository>();

// Reuse one serialized owner for activity, manual imports and deletion.
export function createLocalJournal(accountId: string): LocalJournalRepository {
  let journal = journals.get(accountId);
  if (!journal || journal.isStopped) {
    journal = new LocalJournalRepository(accountId, localJournalBackend);
    journals.set(accountId, journal);
  }
  return journal;
}
