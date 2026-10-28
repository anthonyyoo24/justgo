import { localJournalBackend as backend } from '../src/data/journal/storage.web';
import type { JournalBackend } from '../src/data/journal/backend';
import { waitForPrivateJournalFixture } from './journey-storage';

// Selected only by the guarded web journey resolver. Waiting before opening the
// real transaction preserves IndexedDB atomicity while exercising slow commits.
export const localJournalBackend: JournalBackend = {
  async transaction(accountId, action) {
    await waitForPrivateJournalFixture();
    return backend.transaction(accountId, action);
  },
  deleteOwned: (accountId) => backend.deleteOwned(accountId),
};
