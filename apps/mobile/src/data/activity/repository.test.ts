import { AccountRepository } from './repository';
import { AccountRepositories } from './accounts';
import { journalSchema } from './model';
import {
  memoryLocalJournal,
  memoryJournalBackend,
} from '../../../test-support/local-journal';
import {
  MemoryStorage,
  backend,
  card,
  deferred,
  input,
  owner,
  otherOwner,
  today,
  uuid,
  zone,
  attempt,
} from '../../../test-support/journal';

const repositories: AccountRepository[] = [];
const key = `justgo:v1:${owner}:journal`;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(`${today}T14:00:00Z`));
});
afterEach(async () => {
  repositories.forEach((repo) => repo.dispose());
  repositories.length = 0;
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
async function setup(
  storage = new MemoryStorage(),
  transport = backend(),
  accountId = owner,
) {
  const repo = new AccountRepository({
    accountId,
    localJournal: memoryLocalJournal(accountId, storage),
    storage,
    transport,
    today,
    timeZone: zone,
    random: () => 0.5,
  });
  repositories.push(repo);
  repo.setEnvironment({ online: false, active: true });
  await repo.hydrate();
  return { repo, storage, transport };
}
const state = (repo: AccountRepository) => repo.store.getState();
it('retains the first metadata failure through blocked private preparation without exposing raw errors', async () => {
  const storage = new MemoryStorage();
  const read = jest
    .spyOn(storage, 'getItem')
    .mockRejectedValueOnce(new Error('Synthetic private native detail'));
  const repo = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
    dataMode: 'local',
    localJournal: memoryLocalJournal(owner, storage),
  });
  repositories.push(repo);
  repo.setEnvironment({ online: false, active: true });
  await repo.hydrate();
  expect(state(repo)).toMatchObject({
    hydrationError: 'unreadable',
    hydrationDiagnostic: 'METADATA_READ',
    localJournalReady: false,
  });
  expect(JSON.stringify(state(repo))).not.toContain(
    'Synthetic private native detail',
  );
  expect(storage.values.size).toBe(0);
  read.mockRestore();
});
it('erases only the deleted account, including quarantine, after an outstanding journal write settles', async () => {
  const { repo, storage } = await setup();
  storage.values.set(`justgo:v1:${owner}:quarantine:1`, 'Synthetic quarantine');
  storage.values.set(`justgo:v1:${owner}:catalog`, 'Synthetic catalog');
  storage.values.set(`justgo:v1:${otherOwner}:journal`, 'Other owner');
  storage.blocked = deferred<void>();
  const write = repo.complete(input(), card);
  await Promise.resolve();
  const erased = repo.erase();
  storage.blocked.resolve();
  await Promise.allSettled([write]);
  await erased;
  expect([...storage.values.keys()]).toEqual([
    `justgo:v1:${otherOwner}:journal`,
  ]);
  expect(state(repo).journal.records).toEqual({});
  await expect(repo.complete(input(), card)).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
});
const disk = (storage: MemoryStorage) =>
  journalSchema.parse(JSON.parse(storage.values.get(key)!));

it('commits completion plus upload intent together and survives offline relaunch', async () => {
  const { repo, storage, transport } = await setup();
  await Promise.all([
    repo.complete(input(), card),
    repo.complete(input(), card),
  ]);
  expect(transport.calls).toEqual([]);
  expect(disk(storage).operations).toHaveLength(1);
  expect(disk(storage).records[uuid(1)]?.phoneVersion).toBe(1);
  expect(state(repo).warning).toBeNull();
  repo.dispose();
  const reopened = (await setup(storage)).repo;
  expect(reopened.getAttempt(uuid(1))).toEqual(attempt());
  expect(state(reopened).journal.operations[0]?.input).toEqual(input());
  await expect(
    reopened.complete(
      { ...input(), venue: 'cafe' },
      { ...card, venue: 'cafe' },
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('ordinary local saves finish while HTTP is still pending', async () => {
  const { repo, transport, storage } = await setup();
  const pending = deferred<ReturnType<typeof attempt>>();
  transport.create = async () => pending.promise;
  repo.setEnvironment({ active: true, online: true });
  await expect(repo.complete(input(), card)).resolves.toEqual(attempt());
  expect(disk(storage).records[uuid(1)]?.phoneVersion).toBe(1);
  expect(state(repo).warning).toBeNull();
  pending.resolve(attempt());
  await repo.synchronize();
});
it('retries one failed phone write after clearing only replaceable caches', async () => {
  const { repo, storage } = await setup();
  await repo.cacheCatalog({ cards: [card] });
  const catalog = storage.values.get(`justgo:v1:${owner}:catalog`);
  await repo.acceptCalendar(
    { month: '2026-10', monthlyReps: 0, activeDays: 0, days: [] },
    zone,
    0,
  );
  await repo.acceptTodayPage(
    { date: today, totalReps: 0, entries: [], nextCursor: null },
    zone,
  );
  const before = storage.writes.length;
  storage.failures = 1;
  await repo.complete(input(), card);
  expect(storage.writes.length - before).toBe(2);
  expect(disk(storage).calendar).toBeNull();
  expect(disk(storage).today).toBeNull();
  expect(disk(storage).operations).toHaveLength(1);
  expect(storage.values.get(`justgo:v1:${owner}:catalog`)).toBe(catalog);
  expect(state(repo).warning).toBeNull();
});
it('keeps the prior committed journal intact when a private update fails', async () => {
  const { repo, storage } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Committed private fixture',
  });
  const committed = storage.values.get(key);
  memoryJournalBackend(storage).failCommit = true;
  await expect(
    repo.submitReflection(uuid(1), uuid(102), {
      text: 'Uncommitted private fixture',
    }),
  ).rejects.toMatchObject({ code: 'STORAGE' });
  expect(storage.values.get(key)).toBe(committed);
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Committed private fixture',
  );
  repo.dispose();
  memoryJournalBackend(storage).failCommit = false;
  const reopened = (await setup(storage)).repo;
  expect(reopened.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Committed private fixture',
  );
  expect(state(reopened).journal.operations).toHaveLength(1);
});
it('waits for the private journal commit and serializes a newer explicit edit', async () => {
  const { repo, storage } = await setup();
  await repo.complete(input(), card);
  const gate = deferred<void>(),
    entered = deferred<void>();
  memoryJournalBackend(storage).beforeCommit = async () => {
    entered.resolve();
    await gate.promise;
  };
  let settled = false;
  const first = repo
    .submitReflection(uuid(1), uuid(101), { text: 'Older fixture' })
    .then(() => {
      settled = true;
    });
  await entered.promise;
  expect(settled).toBe(false);
  const second = repo.submitReflection(uuid(1), uuid(102), {
    text: 'Newer fixture',
  });
  gate.resolve();
  await Promise.all([first, second]);
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe('Newer fixture');
  expect(disk(storage).records[uuid(1)]?.attempt.reflection).toBeNull();
  expect(disk(storage).records[uuid(1)]?.phoneVersion).toBe(1);
});
it('keeps immutable submission identities', async () => {
  const { repo } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    feeling: 'a_little_better',
    text: '  Exact fixture whitespace  ',
  });
  await repo.submitReflection(uuid(1), uuid(101), {
    feeling: 'a_little_better',
    text: '  Exact fixture whitespace  ',
  });
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    '  Exact fixture whitespace  ',
  );
  await expect(
    repo.submitReflection(uuid(1), uuid(101), { text: 'Changed fixture' }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    repo.submitReflection(uuid(1), uuid(102), { feeling: 'a_lot_better' }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    repo.submitReflection(uuid(1), uuid(103), { text: ' '.repeat(10001) }),
  ).rejects.toBeDefined();
  await expect(
    repo.submitReflection(uuid(999), uuid(104), { text: 'Unknown' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it.each([
  'invalid JSON',
  JSON.stringify({ version: 99 }),
  JSON.stringify({
    ...journalSchema.parse({
      version: 1,
      accountId: otherOwner,
      generation: 0,
      records: {},
      operations: [],
      submissions: {},
      summaryAdditions: [],
      calendarAdditions: [],
      summary: null,
      calendar: null,
      today: null,
    }),
  }),
])(
  'quarantines an unreadable or wrong-owner journal without silently resetting its bytes',
  async (raw) => {
    const storage = new MemoryStorage();
    storage.values.set(key, raw);
    const { repo } = await setup(storage);
    expect(state(repo).hydrationError).toBe('unreadable');
    expect(state(repo).hydrationDiagnostic).toBe('COMPLETION_FORMAT');
    expect(
      [...storage.values.entries()].some(
        ([name, value]) => name.includes(':quarantine:') && value === raw,
      ),
    ).toBe(true);
    await repo.complete(input(), card);
    expect(disk(storage).operations).toHaveLength(1);
  },
);
it('protects unreadable bytes when quarantine cannot be saved', async () => {
  const storage = new MemoryStorage();
  storage.values.set(key, 'unreadable fixture');
  storage.fail = true;
  const { repo } = await setup(storage);
  await expect(repo.complete(input(), card)).rejects.toMatchObject({
    code: 'STORAGE',
  });
  expect(storage.values.get(key)).toBe('unreadable fixture');
  storage.fail = false;
  await expect(repo.complete(input(2), card)).rejects.toMatchObject({
    code: 'STORAGE',
  });
  expect(storage.values.get(key)).toBe('unreadable fixture');
});
it('optional catalog-cache failure preserves live challenges and the committed pending journal', async () => {
  const { repo, storage } = await setup();
  await repo.complete(input(), card);
  const committed = storage.values.get(key);
  storage.fail = true;
  await repo.cacheCatalog({ cards: [card] });
  expect(state(repo).catalog).toEqual({ cards: [card] });
  expect(storage.values.get(key)).toBe(committed);
  expect(state(repo).warning).toBeNull();
});
it('preserves parked accounts and rejects submissions to inactive/disposed repositories', async () => {
  const storage = new MemoryStorage();
  const accounts = new AccountRepositories((accountId) => {
    const repo = new AccountRepository({
      accountId,
      localJournal: memoryLocalJournal(accountId, storage),
      storage,
      transport: backend(),
      today,
      timeZone: zone,
    });
    repositories.push(repo);
    return repo;
  });
  const a = accounts.activate(owner, { active: true, online: false })!;
  await a.complete(input(), card);
  const b = accounts.activate(otherOwner, { active: true, online: false })!;
  await b.hydrate();
  expect(b.getAttempt(uuid(1))).toBeUndefined();
  await expect(
    a.submitReflection(uuid(1), uuid(101), { text: 'Late UI fixture' }),
  ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(accounts.activate(owner, { active: true, online: false })).toBe(a);
  expect(a.getAttempt(uuid(1))).toBeDefined();
  accounts.activate(null, { active: false, online: false });
  accounts.dispose();
  await expect(a.complete(input(2), card)).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
});

it('rejects stale aggregate refreshes and keeps limited current-period downloads with safe page merging', async () => {
  const { repo } = await setup();
  const initialFence = repo.captureAggregateFence()!;
  await repo.complete(input(), card);
  expect(repo.captureAggregateFence()).toBeNull();
  const summary = {
    today,
    timeZone: zone,
    totalReps: 0,
    currentStreak: 0,
    bestStreak: 0,
    streakContext: { month: '2026-10', precedingRun: 0, bestBeforeMonth: 0 },
  };
  expect(await repo.acceptSummary(summary, initialFence)).toBe(false);
  expect(
    await repo.acceptCalendar(
      { month: '2026-10', monthlyReps: 0, activeDays: 0, days: [] },
      zone,
      initialFence,
    ),
  ).toBe(false);
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  const fence = repo.captureAggregateFence()!;
  expect(await repo.acceptSummary({ ...summary, timeZone: 'UTC' }, fence)).toBe(
    false,
  );
  expect(
    await repo.acceptCalendar(
      { month: '2026-09', monthlyReps: 0, activeDays: 0, days: [] },
      zone,
      fence,
    ),
  ).toBe(true);
  expect(state(repo).journal.calendar).toBeNull();
  await repo.acceptTodayPage(
    { date: '2026-10-04', totalReps: 1, entries: [], nextCursor: null },
    zone,
  );
  expect(state(repo).journal.today).toBeNull();
  const current = {
    ...attempt(),
    reflection: { feeling: null, text: 'Newer canonical fixture', revision: 2 },
  };
  await repo.acceptTodayPage(
    {
      date: today,
      totalReps: 2,
      entries: [current],
      nextCursor: 'fixture-next',
    },
    zone,
  );
  await repo.acceptTodayPage(
    {
      date: today,
      totalReps: 2,
      entries: [attempt(), attempt(2)],
      nextCursor: null,
    },
    zone,
    true,
  );
  expect(state(repo).journal.today?.data.entries).toHaveLength(2);
  expect(state(repo).journal.today?.data.entries[0]?.reflection).toBeNull();
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Newer canonical fixture',
  );
  await repo.rollover('2026-11-01', zone);
  expect(state(repo).journal.today).toBeNull();
});
it('adopts confirmed online history even when device caching fails and protects newer local submissions from stale reads', async () => {
  const { repo, storage } = await setup();
  storage.fail = true;
  await repo.adoptAttempt(attempt());
  expect(repo.getAttempt(uuid(1))).toEqual(attempt());
  expect(state(repo).warning).toBeNull();
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Newer local fixture',
  });
  await repo.adoptAttempt(attempt());
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Newer local fixture',
  );
});

it('opens an unchanged durable attempt without a journal write or notification, while adopting newer remote text', async () => {
  const { repo, storage } = await setup();
  await repo.adoptAttempt(attempt());
  const journal = state(repo).journal;
  expect(repo.hasCurrentAttempt(attempt())).toBe(true);
  expect(repo.hasCurrentAttempt(attempt(2))).toBe(false);
  const writes = storage.writes.length;
  const changed = jest.fn();
  const unsubscribe = repo.store.subscribe(changed);
  try {
    storage.blocked = deferred<void>();
    await repo.adoptAttempt(attempt());
    expect(storage.writes).toHaveLength(writes);
    expect(changed).not.toHaveBeenCalled();
    expect(state(repo).journal).toBe(journal);
    storage.blocked.resolve();
    storage.blocked = null;
    const newer = {
      ...attempt(),
      reflection: { feeling: null, text: 'Newer remote fixture', revision: 1 },
    };
    expect(repo.hasCurrentAttempt(newer)).toBe(false);
    await repo.adoptAttempt(newer);
    expect(repo.getAttempt(uuid(1))).toEqual(newer);
    expect(disk(storage).records[uuid(1)]?.attempt).toEqual(attempt());
    expect((await repo.listJournalEntries())[0]?.reflection.text).toBe(
      'Newer remote fixture',
    );
    expect(storage.writes.length).toBeGreaterThan(writes);
    repo.dispose();
    expect(repo.hasCurrentAttempt(newer)).toBe(false);
    await expect(repo.adoptAttempt(newer)).rejects.toMatchObject({
      code: 'ACCOUNT_CHANGED',
    });
  } finally {
    storage.blocked?.resolve();
    storage.blocked = null;
    unsubscribe();
  }
});

it('persists a previously memory-only adopted row when storage becomes available', async () => {
  const { repo, storage } = await setup();
  storage.fail = true;
  await repo.adoptAttempt(attempt());
  expect(state(repo).journal.records[uuid(1)]?.phoneVersion).toBe(0);
  expect(repo.hasCurrentAttempt(attempt())).toBe(false);
  storage.fail = false;
  await repo.adoptAttempt(attempt());
  expect(disk(storage).records[uuid(1)]?.phoneVersion).toBe(1);
});

it('preserves feeling-only reflections, normalizes empty input and keeps returned attempts outside the mutable journal', async () => {
  const { repo } = await setup();
  await repo.complete(input(), card);
  await expect(
    repo.submitReflection(uuid(1), uuid(101), { text: '  ' }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  await repo.submitReflection(uuid(1), uuid(102), {
    feeling: 'a_little_better',
  });
  await repo.submitReflection(uuid(1), uuid(103), { text: null });
  expect(repo.getAttempt(uuid(1))?.reflection).toMatchObject({
    feeling: 'a_little_better',
    text: null,
  });
  const copy = repo.getAttempt(uuid(1))!;
  copy.instruction = 'Untrusted caller mutation';
  expect(repo.getAttempt(uuid(1))?.instruction).toBe(card.text);
});
it('serializes overlapping optional catalog writes and hydrates only the correct versioned owner', async () => {
  const { repo, storage } = await setup();
  const gate = deferred<void>();
  storage.blocked = gate;
  const first = repo.cacheCatalog({ cards: [card] });
  await Promise.resolve();
  await Promise.resolve();
  const newer = { ...card, text: 'Newer downloaded wording' };
  const second = repo.cacheCatalog({ cards: [newer] });
  await Promise.resolve();
  gate.resolve();
  storage.blocked = null;
  await Promise.all([first, second]);
  repo.dispose();
  const reopened = (await setup(storage)).repo;
  expect(state(reopened).catalog?.cards[0]?.text).toBe(
    'Newer downloaded wording',
  );
  reopened.dispose();
  storage.values.set(
    `justgo:v1:${owner}:catalog`,
    JSON.stringify({
      version: 1,
      accountId: otherOwner,
      catalog: { cards: [card] },
    }),
  );
  const isolated = (await setup(storage)).repo;
  expect(state(isolated).catalog).toBeNull();
});
// Known bug #375: the retry returns the in-memory record without saving it.
it.failing(
  'saves a retried completion to the phone before it reports success (#375)',
  async () => {
    const { repo, storage } = await setup();
    storage.fail = true;
    await expect(repo.complete(input(), card)).rejects.toMatchObject({
      code: 'STORAGE',
    });
    storage.fail = false;
    await expect(repo.complete(input(), card)).resolves.toEqual(attempt());
    expect(storage.values.get(key)).toBeDefined();
    expect(disk(storage).records[uuid(1)]?.attempt).toEqual(attempt());
  },
);
