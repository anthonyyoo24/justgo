import { ActivityRuntime } from './activity-runtime';
import { AccountClient } from '../../lib/account-client';
import { createHttpClient } from '../../lib/http';
import { journalSchema, type JournalClock } from '../../data/activity/model';
import {
  MemoryStorage,
  card,
  input,
  deferred,
  owner,
  otherOwner,
  zone,
} from '../../../test-support/journal';
function createRuntime(
  storage = new MemoryStorage(),
  options: { clock?: JournalClock; timeZone?: () => string } = {},
) {
  const client = new AccountClient(createHttpClient('http://127.0.0.1:3000'), {
    current: () => null,
    renew: async () => {
      throw new Error('unused');
    },
    reject: () => {},
  });
  return { runtime: new ActivityRuntime(client, storage, options), client };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
it('uses the supplied clock and fences late rollover failures after an account change', async () => {
  let now = Date.parse('2026-10-31T23:59:59.500-04:00');
  const { runtime, client } = createRuntime(new MemoryStorage(), {
    timeZone: () => zone,
    clock: {
      now: () => now,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (timer) => clearTimeout(timer),
    },
  });
  const late = deferred<void>();
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const first = runtime.getRepository()!;
    await first.hydrate();
    expect(first.store.getState().period.today).toBe('2026-10-31');
    jest.spyOn(first, 'rollover').mockImplementationOnce(() => late.promise);
    now += 500;
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(otherOwner);
    const second = runtime.getRepository()!;
    await second.hydrate();
    late.reject(new Error('fixture old-account rollover failure'));
    await expect(late.promise).rejects.toThrow(
      'fixture old-account rollover failure',
    );
    expect(first.store.getState().coordinatorError).toBeNull();
    expect(second.store.getState()).toMatchObject({
      coordinatorError: null,
      period: { today: '2026-11-01', timeZone: zone },
    });
  } finally {
    late.resolve();
    runtime.dispose();
    client.changeAccount(null);
  }
});
it('uses the current day when hydration spans midnight without losing persisted submissions', async () => {
  const storage = new MemoryStorage();
  const seed = createRuntime(storage);
  seed.runtime.setEnvironment({ active: true, online: false });
  seed.runtime.changeAccount(owner);
  await seed.runtime.getRepository()!.complete(input(), card);
  seed.runtime.dispose();
  seed.client.changeAccount(null);
  const raw = storage.values.get(`justgo:v1:${owner}:journal`)!;
  const read = deferred<string | null>();
  jest.spyOn(storage, 'getItem').mockImplementationOnce(() => read.promise);
  jest.setSystemTime(new Date('2026-10-31T23:59:59.500-04:00'));
  const { runtime, client } = createRuntime(storage, { timeZone: () => zone });
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const repository = runtime.getRepository()!;
    await jest.advanceTimersByTimeAsync(500);
    read.resolve(raw);
    await repository.hydrate();
    expect(repository.store.getState().period.today).toBe('2026-11-01');
    expect(repository.getAttempt(input().id)).toBeDefined();
  } finally {
    read.resolve(raw);
    await runtime.getRepository()?.hydrate();
    runtime.dispose();
    client.changeAccount(null);
  }
});

it('ignores stale period callbacks and retries a failed rollover without abandoning pending content', async () => {
  jest.setSystemTime(new Date('2026-10-31T23:59:59.500-04:00'));
  const timers = jest.spyOn(globalThis, 'setTimeout');
  const { runtime, client } = createRuntime(new MemoryStorage(), {
    timeZone: () => zone,
  });
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const repository = runtime.getRepository()!;
    await repository.complete(input(), card);
    const callback = timers.mock.calls[0]![0];
    const rollover = jest
      .spyOn(repository, 'rollover')
      .mockRejectedValueOnce(new Error('fixture rollover failure'));
    await jest.advanceTimersByTimeAsync(500);
    expect(repository.store.getState().coordinatorError).toBe('UNAVAILABLE');
    expect(repository.getAttempt(input().id)).toBeDefined();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(repository.store.getState().period.today).toBe('2026-11-01');
    expect(rollover).toHaveBeenCalledTimes(2);
    runtime.setEnvironment({ active: false, online: false });
    runtime.setEnvironment({ active: true, online: false });
    if (typeof callback !== 'function')
      throw new Error('Expected a period callback');
    callback();
    expect(jest.getTimerCount()).toBe(1);
    runtime.dispose();
    callback();
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    runtime.dispose();
    client.changeAccount(null);
  }
});
it('parks memory-only activity across identity changes and reuses the same repository on recovery', async () => {
  const storage = new MemoryStorage();
  storage.fail = true;
  const { runtime, client } = createRuntime(storage);
  runtime.setEnvironment({ active: true, online: false });
  runtime.changeAccount(owner);
  const first = runtime.getRepository()!;
  await first.complete(input(), card);
  expect(first.store.getState().warning?.visible).toBe(true);
  runtime.changeAccount(otherOwner);
  expect(first.store.getState().active).toBe(false);
  const second = runtime.getRepository()!;
  expect(second.getAttempt(input().id)).toBeUndefined();
  runtime.changeAccount(null);
  expect(runtime.getRepository()).toBeNull();
  runtime.changeAccount(owner);
  expect(runtime.getRepository()).toBe(first);
  expect(first.getAttempt(input().id)).toBeTruthy();
  runtime.dispose();
  expect(first.store.getState().active).toBe(false);
  client.changeAccount(null);
});

it('rolls over at midnight while active, clears stale downloads and retains pending submissions', async () => {
  jest.setSystemTime(new Date('2026-10-31T23:59:59.500-04:00'));
  const storage = new MemoryStorage();
  const { runtime, client } = createRuntime(storage, { timeZone: () => zone });
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const repository = runtime.getRepository()!;
    await repository.hydrate();
    await repository.acceptTodayPage(
      { date: '2026-10-31', totalReps: 0, entries: [], nextCursor: null },
      zone,
    );
    await repository.acceptCalendar(
      { month: '2026-10', monthlyReps: 0, activeDays: 0, days: [] },
      zone,
      repository.store.getState().journal.generation,
    );
    expect(repository.store.getState().journal.calendar?.data.month).toBe(
      '2026-10',
    );
    await repository.complete(input(), card);
    await jest.advanceTimersByTimeAsync(500);
    expect(repository.store.getState()).toMatchObject({
      period: { today: '2026-11-01', timeZone: zone },
      journal: { today: null, calendar: null },
    });
    expect(repository.getAttempt(input().id)).toBeDefined();
    await repository.acceptTodayPage(
      { date: '2026-11-01', totalReps: 0, entries: [], nextCursor: null },
      zone,
    );
    expect(repository.store.getState().journal.today?.data.date).toBe(
      '2026-11-01',
    );
    const writes = storage.writes.length;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(storage.writes).toHaveLength(writes);
    expect(jest.getTimerCount()).toBe(1);
  } finally {
    runtime.dispose();
    client.changeAccount(null);
  }
  expect(jest.getTimerCount()).toBe(0);
});

it('refreshes a parked repository when the same account returns after a day and zone change', async () => {
  jest.setSystemTime(new Date('2026-10-31T23:00:00-04:00'));
  let timeZone = zone;
  const { runtime, client } = createRuntime(new MemoryStorage(), {
    timeZone: () => timeZone,
  });
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const first = runtime.getRepository()!;
    await first.hydrate();
    runtime.changeAccount(otherOwner);
    await runtime.getRepository()!.hydrate();
    runtime.setEnvironment({ active: false, online: false });
    jest.setSystemTime(new Date('2026-11-02T02:00:00Z'));
    timeZone = 'UTC';
    runtime.changeAccount(owner);
    expect(runtime.getRepository()).toBe(first);
    expect(first.store.getState().period).toEqual({
      today: '2026-11-02',
      timeZone,
    });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    runtime.dispose();
    client.changeAccount(null);
  }
});

it('refreshes the foreground period and cancels background, disconnect and disposed timers', async () => {
  jest.setSystemTime(new Date('2026-10-31T23:00:00-04:00'));
  let timeZone = zone;
  const { runtime, client } = createRuntime(new MemoryStorage(), {
    timeZone: () => timeZone,
  });
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const repository = runtime.getRepository()!;
    await repository.hydrate();
    expect(jest.getTimerCount()).toBe(1);
    runtime.setEnvironment({ active: false, online: false });
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(new Date('2026-11-01T05:00:00Z'));
    timeZone = 'UTC';
    runtime.setEnvironment({ active: true, online: false });
    expect(repository.store.getState().period).toEqual({
      today: '2026-11-01',
      timeZone,
    });
    expect(jest.getTimerCount()).toBe(1);
    runtime.changeAccount(null);
    expect(jest.getTimerCount()).toBe(0);
    runtime.dispose();
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    expect(runtime.getRepository()).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    runtime.dispose();
    client.changeAccount(null);
  }
});

it('resumes hydrated auth-blocked submissions after a session becomes valid during a slow journal read', async () => {
  const storage = new MemoryStorage();
  const seed = createRuntime(storage);
  seed.runtime.setEnvironment({ active: true, online: false });
  seed.runtime.changeAccount(owner);
  await seed.runtime.getRepository()!.complete(input(), card);
  const key = `justgo:v1:${owner}:journal`;
  const journal = journalSchema.parse(JSON.parse(storage.values.get(key)!));
  journal.operations[0]!.state = 'auth';
  const raw = JSON.stringify(journal);
  seed.runtime.dispose();
  seed.client.changeAccount(null);
  const read = deferred<string | null>();
  jest.spyOn(storage, 'getItem').mockImplementationOnce(() => read.promise);
  const { runtime, client } = createRuntime(storage);
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const repository = runtime.getRepository()!;
    runtime.resumeAuthentication();
    expect(repository.store.getState().ready).toBe(false);
    read.resolve(raw);
    await repository.hydrate();
    expect(repository.store.getState().journal.operations[0]?.state).toBe(
      'pending',
    );
  } finally {
    read.resolve(raw);
    runtime.dispose();
    client.changeAccount(null);
  }
});

it('defers renewed authentication while inactive and applies it only to the same foreground account', async () => {
  const { runtime, client } = createRuntime();
  runtime.setEnvironment({ active: true, online: false });
  runtime.changeAccount(owner);
  const first = runtime.getRepository()!;
  await first.complete(input(), card);
  const journal = structuredClone(first.store.getState().journal);
  journal.operations[0]!.state = 'auth';
  first.store.setState({ journal });
  runtime.setEnvironment({ active: false, online: false });
  expect(() => runtime.resumeAuthentication()).not.toThrow();
  expect(first.store.getState().journal.operations[0]?.state).toBe('auth');
  runtime.setEnvironment({ active: true, online: false });
  expect(first.store.getState().journal.operations[0]?.state).toBe('pending');
  journal.operations[0]!.state = 'auth';
  first.store.setState({ journal: structuredClone(journal) });
  runtime.setEnvironment({ active: false, online: false });
  runtime.resumeAuthentication();
  runtime.changeAccount(otherOwner);
  runtime.setEnvironment({ active: true, online: false });
  expect(first.store.getState().journal.operations[0]?.state).toBe('auth');
  expect(runtime.getRepository()?.accountId).toBe(otherOwner);
  runtime.dispose();
  runtime.resumeAuthentication();
  client.changeAccount(null);
});
