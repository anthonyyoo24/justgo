import { AccountRepository } from './repository';
import type { JournalTransport } from './sync/transport';
import { emptyJournal } from './model';
import { addCompletion, addReflection } from './submissions';
import { journalEntry } from './private-journal';
import { progressDay, progressMetrics } from './progress/progress';
import {
  MemoryStorage,
  backend,
  card,
  input,
  owner,
  otherOwner,
  today,
  zone,
  uuid,
  attempt,
} from '../../../test-support/journal';
import {
  memoryJournalBackend,
  memoryLocalJournal,
} from '../../../test-support/local-journal';

const repositories: AccountRepository[] = [];
const key = `justgo:v1:${owner}:journal`;
const privateAttempt = (id = 1, text = 'Private synthetic writing') => ({
  ...attempt(id),
  reflection: { feeling: 'a_little_better' as const, text, revision: 1 },
});
function setup(
  storage = new MemoryStorage(),
  transport: JournalTransport & {
    calls: string[];
    records: Map<string, import('@justgo/contracts').Attempt>;
  } = backend(),
) {
  const journal = memoryLocalJournal(owner, storage);
  const repository = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
    localJournal: journal,
  });
  repository.setEnvironment({ online: false, active: true });
  repositories.push(repository);
  return {
    repository,
    storage,
    transport,
    journal,
    database: memoryJournalBackend(storage),
  };
}
beforeEach(() =>
  jest.useFakeTimers().setSystemTime(new Date(`${today}T14:00:00Z`)),
);
afterEach(async () => {
  repositories.splice(0).forEach((repository) => repository.dispose());
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it('commits private saves independently, with completion-only wire and cache data', async () => {
  const { repository, transport, storage } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Private synthetic writing',
  });
  repository.setEnvironment({ online: true, active: true });
  await repository.synchronize();
  expect(transport.calls).toEqual([`create:${uuid(1)}`]);
  expect(transport.records.get(uuid(1))?.reflection).toBeNull();
  expect(storage.values.get(key)).not.toContain('Private synthetic writing');
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Private synthetic writing',
  );
});

it('rejects a failed private commit and retains the prior entry without cloud fallback', async () => {
  const { repository, database, transport } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), { text: 'Saved' });
  database.failCommit = true;
  await expect(
    repository.submitReflection(uuid(1), uuid(3), { text: 'New input' }),
  ).rejects.toMatchObject({ code: 'STORAGE' });
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe('Saved');
  expect(transport.calls).toEqual([]);
  database.failCommit = false;
  await repository.submitReflection(uuid(1), uuid(3), { text: 'New input' });
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe('New input');
});

it('adopts a committed private save while backgrounded so the next text edit keeps its saved feeling', async () => {
  const { repository, database } = setup();
  await repository.complete(input(), card);
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  database.beforeCommit = () => {
    started();
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const saving = repository.submitReflection(uuid(1), uuid(2), {
    feeling: 'a_little_better',
    text: 'First writing',
  });
  await entered;
  repository.setEnvironment({ online: false, active: false });
  release();
  await expect(saving).resolves.toMatchObject({
    reflection: { feeling: 'a_little_better', text: 'First writing' },
  });
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'First writing',
  );
  database.beforeCommit = null;
  repository.setEnvironment({ online: false, active: true });
  await expect(
    repository.submitReflection(uuid(1), uuid(3), { text: 'Newer writing' }),
  ).resolves.toMatchObject({
    reflection: { feeling: 'a_little_better', text: 'Newer writing' },
  });
});

it('adopts an atomic restore that commits while Files has backgrounded the current account', async () => {
  const { repository, database } = setup();
  await repository.hydrate();
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  database.beforeCommit = () => {
    started();
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const restore = repository.restoreJournal([
    journalEntry(owner, privateAttempt()),
  ]);
  await entered;
  repository.setEnvironment({ online: false, active: false });
  release();
  await expect(restore).resolves.toMatchObject({ added: 1 });
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Private synthetic writing',
  );
});

it('reloads accepted original-account writing after returning from an account switch during commit', async () => {
  const { repository, database, journal } = setup();
  await repository.complete(input(), card);
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  database.beforeCommit = () => {
    started();
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const saving = repository.submitReflection(uuid(1), uuid(2), {
    feeling: 'a_little_better',
    text: 'Writing accepted before the switch',
  });
  await entered;
  repository.setAccountCurrent(false);
  repository.setEnvironment({ online: false, active: false });
  release();
  await expect(saving).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(repository.getAttempt(uuid(1))?.reflection).toBeNull();
  database.beforeCommit = null;
  const reads = jest.spyOn(journal, 'list');
  repository.setAccountCurrent(true);
  repository.setEnvironment({ online: false, active: true });
  await jest.advanceTimersByTimeAsync(0);
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Writing accepted before the switch',
  );
  const readCount = reads.mock.calls.length;
  repository.setAccountCurrent(true);
  repository.setEnvironment({ online: false, active: false });
  repository.setEnvironment({ online: false, active: true });
  await jest.advanceTimersByTimeAsync(0);
  expect(reads).toHaveBeenCalledTimes(readCount);
});

it('retains visible writing and exposes a retryable read failure on ownership return', async () => {
  const { repository, journal } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Saved writing',
  });
  const reads = jest
    .spyOn(journal, 'list')
    .mockRejectedValueOnce(new Error('Synthetic unavailable store'));
  repository.setAccountCurrent(false);
  repository.setAccountCurrent(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Saved writing',
  );
  expect(repository.store.getState()).toMatchObject({
    hydrationError: 'unreadable',
    localJournalReady: false,
  });
  reads.mockRestore();
  expect((await repository.snapshotJournal()).entries[0]?.reflection.text).toBe(
    'Saved writing',
  );
  expect(repository.store.getState()).toMatchObject({
    hydrationError: null,
    localJournalReady: true,
  });
});

it('ignores a delayed refresh failure after its ownership generation has ended', async () => {
  const { repository, journal } = setup();
  await repository.complete(input(), card);
  let fail!: (error: Error) => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  jest.spyOn(journal, 'list').mockImplementationOnce(() => {
    started();
    return new Promise((_resolve, reject) => {
      fail = reject;
    });
  });
  repository.setAccountCurrent(false);
  repository.setAccountCurrent(true);
  await entered;
  repository.setAccountCurrent(false);
  fail(new Error('Synthetic late failure'));
  await jest.advanceTimersByTimeAsync(0);
  expect(repository.store.getState().hydrationError).toBeNull();
});

it('preserves legacy queued/rejected writing before stripping private retries', async () => {
  const storage = new MemoryStorage();
  const old = emptyJournal(owner);
  addCompletion(old, input(), card);
  addReflection(old, uuid(1), uuid(2), { text: 'Earlier saved writing' });
  addReflection(old, uuid(1), uuid(3), { text: 'Latest saved writing' });
  old.today = {
    timeZone: zone,
    data: {
      date: today,
      totalReps: 1,
      entries: [privateAttempt(1, 'Distinct cached writing')],
      nextCursor: null,
    },
  };
  old.operations[1]!.state = 'rejected';
  old.operations[1]!.code = 'INVALID_REQUEST';
  storage.values.set(key, JSON.stringify(old));
  const { repository } = setup(storage);
  await repository.hydrate();
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Latest saved writing',
  );
  expect(
    (await repository.listJournalConflicts()).some(
      (entry) => entry.reflection.text === 'Earlier saved writing',
    ),
  ).toBe(true);
  expect(
    (await repository.listJournalConflicts()).some(
      (entry) => entry.reflection.text === 'Distinct cached writing',
    ),
  ).toBe(true);
  expect(
    repository.store
      .getState()
      .journal.operations.map((operation) => operation.kind),
  ).toEqual(['create']);
  expect(storage.values.get(key)).not.toContain('saved writing');
});

it('keeps the legacy envelope intact when migration cannot commit and retries after restart', async () => {
  const storage = new MemoryStorage();
  const old = emptyJournal(owner);
  addCompletion(old, input(), card);
  addReflection(old, uuid(1), uuid(2), { text: 'Preserve me' });
  const bytes = JSON.stringify(old);
  storage.values.set(key, bytes);
  const first = setup(storage);
  first.database.failCommit = true;
  await first.repository.hydrate();
  expect(first.repository.store.getState().localJournalReady).toBe(false);
  expect(storage.values.get(key)).toBe(bytes);
  first.repository.dispose();
  first.database.failCommit = false;
  const second = setup(storage);
  await second.repository.hydrate();
  expect(second.repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Preserve me',
  );
});

it('retries failed private preservation in the same session before accepting new writing', async () => {
  const storage = new MemoryStorage();
  const old = emptyJournal(owner);
  addCompletion(old, input(), card);
  addReflection(old, uuid(1), uuid(2), { text: 'Preserve me' });
  const bytes = JSON.stringify(old);
  storage.values.set(key, bytes);
  const { repository, database } = setup(storage);
  database.failCommit = true;
  await repository.hydrate();
  await expect(repository.snapshotJournal()).rejects.toMatchObject({
    code: 'STORAGE',
  });
  expect(storage.values.get(key)).toBe(bytes);
  database.failCommit = false;
  expect((await repository.snapshotJournal()).entries[0]?.reflection.text).toBe(
    'Preserve me',
  );
  await repository.submitReflection(uuid(1), uuid(3), {
    text: 'New saved writing',
  });
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'New saved writing',
  );
  expect(storage.values.get(key)).not.toContain('Preserve me');
});

it('preserves cached-only legacy writing when failed migration rolls over before a same-session retry', async () => {
  const storage = new MemoryStorage();
  const old = emptyJournal(owner);
  const historical = {
    ...privateAttempt(8, 'Cached-only historical writing'),
    startedAt: '2026-09-01T14:00:00.000Z',
    activityDate: '2026-09-01',
  };
  old.today = {
    timeZone: zone,
    data: {
      date: historical.activityDate,
      totalReps: 1,
      entries: [historical],
      nextCursor: null,
    },
  };
  const bytes = JSON.stringify(old);
  storage.values.set(key, bytes);
  const { repository, database } = setup(storage);
  database.failCommit = true;
  await repository.hydrate();
  expect(repository.store.getState().journal.today).toBeNull();
  expect(repository.store.getState().localJournalReady).toBe(false);
  expect(storage.values.get(key)).toBe(bytes);
  await repository.complete(input(), card);
  database.failCommit = false;
  expect((await repository.snapshotJournal()).entries).toEqual([
    journalEntry(owner, historical),
  ]);
  expect(repository.store.getState().journal.records[uuid(1)]).toBeDefined();
  expect(storage.values.get(key)).not.toContain(historical.reflection.text);
  repository.dispose();
  const reopened = setup(storage).repository;
  await reopened.hydrate();
  expect(reopened.getAttempt(historical.id)?.reflection?.text).toBe(
    historical.reflection.text,
  );
});

it('restores old entries offline without adding reps or upload operations', async () => {
  const { repository } = setup();
  await repository.hydrate();
  const old = {
    ...privateAttempt(),
    startedAt: '2026-09-01T14:00:00.000Z',
    activityDate: '2026-09-01',
  };
  const before = progressMetrics(repository.store.getState());
  const restored = await repository.restoreJournal([journalEntry(owner, old)]);
  expect(restored.added).toBe(1);
  expect(
    progressDay(repository.store.getState(), '2026-09-01')?.entries[0]
      ?.reflection?.text,
  ).toBe(old.reflection.text);
  expect(progressMetrics(repository.store.getState())).toEqual(before);
  expect(repository.store.getState().journal.operations).toEqual([]);
  expect(
    (await repository.restoreJournal([journalEntry(owner, old)])).identical,
  ).toBe(1);
  await expect(
    repository.restoreJournal([journalEntry(otherOwner, old)]),
  ).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
  expect((await repository.listJournalEntries()).length).toBe(1);
});

it('keeps local writing through rollover, relaunch and newer empty server reads', async () => {
  const { repository, storage } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Local historical entry',
  });
  await repository.rollover('2026-11-01', zone);
  repository.dispose();
  const next = setup(storage).repository;
  await next.hydrate();
  await next.adoptAttempt(attempt());
  expect(next.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Local historical entry',
  );
  expect(
    progressDay(next.store.getState(), today)?.entries[0]?.reflection?.text,
  ).toBe('Local historical entry');
});

it('synchronizes completions without reading a retired cloud journal or its migration marker', async () => {
  const { repository, transport, storage } = setup();
  const read = jest.spyOn(storage, 'getItem');
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Local writing stays on this phone',
  });
  repository.setEnvironment({ online: true, active: true });
  await repository.synchronize();
  expect(transport.calls).toEqual([`create:${uuid(1)}`]);
  expect(
    read.mock.calls.every(
      ([path]) => !path.includes('legacy-journal-migrated'),
    ),
  ).toBe(true);
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Local writing stays on this phone',
  );
});
