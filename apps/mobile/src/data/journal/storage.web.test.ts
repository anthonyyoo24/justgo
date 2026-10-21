import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import type { LocalJournalEntry } from './model';
import { LocalJournalRepository } from './repository';
import { IndexedDBJournalBackend } from './storage.web';

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
let factory: IDBFactory;
let backend: IndexedDBJournalBackend;
let journal: LocalJournalRepository;
beforeEach(() => {
  factory = new IDBFactory();
  backend = new IndexedDBJournalBackend(() => factory);
  journal = new LocalJournalRepository(owner, backend);
});
afterEach(() => jest.restoreAllMocks());

it('preserves current and alternative entries across connections and atomically snapshots both stores', async () => {
  const alternative = {
    ...entry,
    reflection: { ...entry.reflection, text: 'Legacy copy' },
  };
  await journal.mergeLegacy([entry, alternative, alternative]);
  const reopened = new LocalJournalRepository(
    owner,
    new IndexedDBJournalBackend(() => factory),
  );
  expect(await reopened.snapshot()).toEqual({
    entries: [entry],
    alternatives: [alternative],
  });
  expect(await reopened.get(id)).toEqual(entry);
  expect(await reopened.get(secondId)).toBeNull();
  await reopened.save({
    ...entry,
    reflection: { ...entry.reflection, text: 'Changed text', revision: 2 },
  });
  expect((await journal.get(id))?.reflection.text).toBe('Changed text');
});

it('rolls back every imported write when a later request fails and permits retry', async () => {
  const original = IDBObjectStore.prototype.put;
  jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if ((value as LocalJournalEntry).id === secondId)
      throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
    return original.call(this, value, key);
  });
  await expect(
    journal.merge([entry, { ...entry, id: secondId }]),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(await journal.list()).toEqual([]);
  jest.restoreAllMocks();
  await journal.merge([entry, { ...entry, id: secondId }]);
  expect(await journal.list()).toHaveLength(2);
});

it('rolls back a callback validation failure, including writes made before a bad alternative', async () => {
  await expect(
    journal.merge([entry], [{ ...entry, id: secondId }]),
  ).rejects.toMatchObject({ code: 'INVALID_ENTRY' });
  expect(await journal.list()).toEqual([]);
});

it('deletes the owned database across open connections while preserving another account', async () => {
  const otherBackend = new IndexedDBJournalBackend(() => factory);
  const otherOwnerJournal = new LocalJournalRepository(
    anotherOwner,
    otherBackend,
  );
  const secondConnection = new LocalJournalRepository(owner, otherBackend);
  await journal.save(entry);
  await secondConnection.list();
  await otherOwnerJournal.save({ ...entry, accountId: anotherOwner });
  await journal.deleteOwned();
  const reopened = new LocalJournalRepository(
    owner,
    new IndexedDBJournalBackend(() => factory),
  );
  expect(await reopened.list()).toEqual([]);
  expect(await otherOwnerJournal.list()).toEqual([
    { ...entry, accountId: anotherOwner },
  ]);
});

it('fails visibly if browser storage is unavailable, then retries initialization', async () => {
  let unavailable = true;
  const storage = new IndexedDBJournalBackend(() => {
    if (unavailable) throw new Error('Synthetic denied storage');
    return factory;
  });
  const unavailableJournal = new LocalJournalRepository(owner, storage);
  await expect(unavailableJournal.list()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  unavailable = false;
  expect(await unavailableJournal.list()).toEqual([]);
});

it('rejects future browser database schemas without downgrading or clearing data', async () => {
  const existing = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(`justgo-journal-v1-${owner}`, 2);
    request.onupgradeneeded = () => request.result.createObjectStore('future');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  existing.close();
  await expect(journal.list()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  const current = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(`justgo-journal-v1-${owner}`, 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  expect(current.objectStoreNames.contains('future')).toBe(true);
  current.close();
});

it('does not erase corrupt data or a wrong-owner record on read', async () => {
  await backend.transaction(owner, async (transaction) => {
    await transaction.put({ ...entry, accountId: anotherOwner });
  });
  await expect(journal.get(id)).rejects.toMatchObject({
    code: 'WRONG_ACCOUNT',
  });
  await expect(journal.list()).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
});

it('waits for a durable transaction completion instead of reporting a request as committed', async () => {
  const original = IDBObjectStore.prototype.put;
  jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const request = original.call(this, value, key);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  });
  await expect(journal.save(entry)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  jest.restoreAllMocks();
  expect(await journal.list()).toEqual([]);
});
