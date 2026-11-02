import { asyncStorageJournalStorageFixture } from './journey-storage';
import { asyncStorageJournalStorage } from '../src/data/activity/persistence/storage';

jest.mock('../src/data/activity/persistence/storage', () => ({
  asyncStorageJournalStorage: {
    getItem: jest.fn().mockResolvedValue('kept original'),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
afterEach(() => {
  globalThis.justgoJournalFaults.release();
  jest.clearAllMocks();
});
it('simulates unreadable source data without reading or overwriting the original and recovers through the existing release control', async () => {
  globalThis.justgoJournalFaults.mode = 'unreadable';
  await expect(
    asyncStorageJournalStorageFixture.getItem('synthetic:journal'),
  ).rejects.toThrow('Synthetic unreadable journal fixture');
  expect(asyncStorageJournalStorage.getItem).not.toHaveBeenCalled();
  expect(asyncStorageJournalStorage.setItem).not.toHaveBeenCalled();
  await expect(
    asyncStorageJournalStorageFixture.getItem('synthetic:catalog'),
  ).resolves.toBe('kept original');
  globalThis.justgoJournalFaults.release();
  await expect(
    asyncStorageJournalStorageFixture.getItem('synthetic:journal'),
  ).resolves.toBe('kept original');
});
