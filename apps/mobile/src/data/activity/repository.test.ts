import { AccountRepository } from './repository';
import { AccountRepositories } from './accounts';
import { journalSchema } from './model';
import { ApiError } from '../../lib/http';
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
it('preserves the committed journal during a failed later write and interrupted relaunch', async () => {
  const { repo, storage } = await setup();
  await repo.complete(input(), card);
  const committed = storage.values.get(key);
  storage.fail = true;
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Synthetic unsaved edit',
  });
  expect(storage.values.get(key)).toBe(committed);
  expect(state(repo).warning?.visible).toBe(true);
  repo.dispose();
  storage.fail = false;
  const reopened = (await setup(storage)).repo;
  expect(reopened.getAttempt(uuid(1))?.reflection).toBeNull();
  expect(state(reopened).journal.operations).toHaveLength(1);
});
it('retains ten memory-only rounds and newer reflection edits through navigation, rollover, dismissal and offline recovery', async () => {
  const { repo, storage } = await setup();
  storage.fail = true;
  for (let n = 1; n <= 10; n++) await repo.complete(input(n), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'First synthetic submission',
  });
  const episode = state(repo).warning?.episode;
  repo.dismissWarning();
  await repo.setFlowAttempt(uuid(2));
  await repo.rollover('2026-10-06', zone);
  await repo.setFlowAttempt(null);
  await repo.submitReflection(uuid(1), uuid(102), {
    text: 'Newer synthetic submission',
  });
  expect(Object.keys(state(repo).journal.records)).toHaveLength(10);
  expect(state(repo).journal.operations).toHaveLength(12);
  expect(state(repo).warning).toMatchObject({
    episode,
    visible: false,
    storageFull: true,
    online: false,
  });
  storage.fail = false;
  await jest.advanceTimersByTimeAsync(30_000);
  expect(disk(storage).records[uuid(1)]?.attempt.reflection?.text).toBe(
    'Newer synthetic submission',
  );
  expect(state(repo).warning).toBeNull();
  expect(state(repo).recoverySequence).toBe(1);
  await jest.advanceTimersByTimeAsync(300_000);
  expect(state(repo).recoverySequence).toBe(1);
  storage.fail = true;
  await repo.complete(input(11), card);
  expect(state(repo).warning).toMatchObject({
    visible: true,
    episode: (episode ?? 0) + 1,
  });
});
it('does not report a newer submission saved by an older in-flight phone snapshot', async () => {
  const { repo, storage } = await setup();
  storage.fail = true;
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Older fixture' });
  storage.fail = false;
  storage.blocked = deferred<void>();
  const recovery = jest.advanceTimersByTimeAsync(30_000);
  // The sparse recovery snapshot has started but is not committed.
  await Promise.resolve();
  await Promise.resolve();
  const submitted = repo.submitReflection(uuid(1), uuid(102), {
    text: 'Newer fixture',
  });
  await Promise.resolve();
  await Promise.resolve();
  storage.blocked.resolve();
  storage.blocked = null;
  await recovery;
  await submitted;
  expect(disk(storage).records[uuid(1)]?.attempt.reflection?.text).toBe(
    'Newer fixture',
  );
  expect(disk(storage).records[uuid(1)]?.phoneVersion).toBe(3);
  expect(state(repo).recoverySequence).toBe(1);
});
it('partial/versioned server recovery keeps the warning until all endangered versions are safe', async () => {
  const { repo, storage, transport } = await setup();
  storage.fail = true;
  await repo.complete(input(), card);
  await repo.complete(input(2), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Synthetic new version',
  });
  const create = transport.create;
  transport.create = async (body, signal) => {
    if (body.id === uuid(2)) throw new ApiError('NETWORK');
    return create(body, signal);
  };
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  expect(state(repo).journal.records[uuid(1)]?.serverVersion).toBe(2);
  expect(state(repo).journal.records[uuid(2)]?.serverVersion).toBe(0);
  expect(state(repo).warning?.visible).toBe(true);
  expect(state(repo).recoverySequence).toBe(0);
  transport.create = create;
  await jest.advanceTimersByTimeAsync(2000);
  expect(state(repo).warning).toBeNull();
  expect(state(repo).recoverySequence).toBe(1);
});
it('automatically closes an undismissed banner after full recovery and identifies unknown storage causes accurately', async () => {
  const { repo, storage } = await setup();
  storage.fail = true;
  storage.cause = 'UNKNOWN';
  await repo.complete(input(), card);
  expect(state(repo).warning).toMatchObject({
    visible: true,
    storageFull: false,
  });
  storage.fail = false;
  await jest.advanceTimersByTimeAsync(30_000);
  expect(state(repo).warning).toBeNull();
  expect(state(repo).recoverySequence).toBe(1);
});
it('keeps immutable submission identities before and after acknowledgements', async () => {
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
  expect(state(repo).journal.operations).toHaveLength(2);
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    '  Exact fixture whitespace  ',
  );
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  await repo.submitReflection(uuid(1), uuid(101), {
    feeling: 'a_little_better',
    text: '  Exact fixture whitespace  ',
  });
  expect(state(repo).journal.operations).toHaveLength(0);
  await expect(
    repo.submitReflection(uuid(1), uuid(101), { text: 'Changed fixture' }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    repo.submitReflection(uuid(1), uuid(102), { feeling: 'a_lot_better' }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
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
  await repo.complete(input(), card);
  expect(storage.values.get(key)).toBe('unreadable fixture');
  expect(state(repo).warning?.visible).toBe(true);
  storage.fail = false;
  await jest.advanceTimersByTimeAsync(30_000);
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
it('prunes only fully confirmed, reconciled records outside today and the current flow', async () => {
  const { repo, storage } = await setup();
  await repo.complete(input(), card);
  await repo.setFlowAttempt(uuid(1));
  await repo.rollover('2026-11-01', zone);
  expect(repo.getAttempt(uuid(1))).toBeDefined();
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  const fence = repo.captureAggregateFence()!;
  await repo.acceptSummary(
    {
      today: '2026-11-01',
      timeZone: zone,
      totalReps: 1,
      currentStreak: 0,
      bestStreak: 1,
      streakContext: { month: '2026-11', precedingRun: 0, bestBeforeMonth: 1 },
    },
    fence,
  );
  // October reconciliation metadata still needs this earlier entry.
  expect(repo.getAttempt(uuid(1))).toBeDefined();
  // Calendar additions for old months are no longer needed once the total baseline covers them.
  await repo.setFlowAttempt(null);
  expect(disk(storage).records[uuid(1)]).toBeUndefined();
});
it('preserves parked memory-only accounts and rejects submissions to inactive/disposed repositories', async () => {
  const storage = new MemoryStorage();
  storage.fail = true;
  const accounts = new AccountRepositories((accountId) => {
    const repo = new AccountRepository({
      accountId,
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

it('rejects a late save result after an identity change while retaining accepted input in its original account', async () => {
  const { repo, storage, transport } = await setup();
  storage.fail = true;
  const late = deferred<ReturnType<typeof attempt>>();
  transport.create = async () => late.promise;
  repo.setEnvironment({ active: true, online: true });
  const saving = repo.complete(input(), card);
  const result = expect(saving).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
  await jest.advanceTimersByTimeAsync(0);
  repo.setEnvironment({ active: false, online: false });
  late.resolve(attempt());
  await result;
  expect(repo.getAttempt(uuid(1))).toBeDefined();
  expect(state(repo).journal.records[uuid(1)]?.serverVersion).toBe(0);
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
  expect(state(repo).journal.today?.data.entries[0]?.reflection?.text).toBe(
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
