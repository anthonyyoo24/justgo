import { LocalJournalRepository } from '../src/data/journal/repository';
import { MemoryJournalBackend } from './local-journal';

let mockBackend = new MemoryJournalBackend();
let mockJournals = new Map<string, LocalJournalRepository>();

function mockCreateLocalJournal(accountId: string): LocalJournalRepository {
  let journal = mockJournals.get(accountId);
  if (!journal || journal.isStopped) {
    journal = new LocalJournalRepository(accountId, mockBackend);
    mockJournals.set(accountId, journal);
  }
  return journal;
}

// Default app/provider suites need a durable controllable store without loading
// a native SQLite binary. Adapter/factory suites explicitly unmock this module.
jest.mock('../src/data/journal/factory', () => ({
  createLocalJournal: (accountId: string) => mockCreateLocalJournal(accountId),
}));

beforeEach(() => {
  mockBackend = new MemoryJournalBackend();
  mockJournals = new Map();
});
