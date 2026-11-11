import { ActivityRuntime } from './activity-runtime';
import { AccountClient } from '../../lib/network/account-client';
import { createHttpClient } from '../../lib/network/http';
import type { JournalClock } from '../../data/activity/model';
import { clearExportFiles } from '../../platform/export/export-file';
import { clearBackupFiles } from '../../platform/backup/backup-file';
import {
  MemoryStorage,
  card,
  input,
  deferred,
  owner,
  otherOwner,
  zone,
} from '../../../test-support/journal';
jest.mock('../../platform/export/export-file', () => ({
  clearExportFiles: jest.fn(),
}));
jest.mock('../../platform/backup/backup-file', () => ({
  clearBackupFiles: jest.fn(),
}));
const cleanExports = jest.mocked(clearExportFiles);
const cleanBackups = jest.mocked(clearBackupFiles);
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
beforeEach(() => {
  jest.useFakeTimers();
  cleanExports.mockReset().mockResolvedValue(undefined);
  cleanBackups.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it.each(['exports', 'backups'] as const)(
  'keeps startup usable when %s cleanup throws synchronously',
  async (source) => {
    const cleanup = source === 'exports' ? cleanExports : cleanBackups;
    cleanup.mockImplementationOnce(() => {
      throw new Error('Synthetic cache cleanup failure');
    });
    const { runtime, client } = createRuntime();
    try {
      await jest.advanceTimersByTimeAsync(0);
      expect(cleanExports).toHaveBeenCalledTimes(1);
      expect(cleanBackups).toHaveBeenCalledTimes(1);
      runtime.setEnvironment({ active: true, online: false });
      runtime.changeAccount(owner);
      await runtime.getRepository()!.hydrate();
      expect(runtime.getRepository()!.store.getState().ready).toBe(true);
    } finally {
      runtime.dispose();
      client.changeAccount(null);
    }
  },
);

it.each(['exports', 'backups'] as const)(
  'propagates %s cleanup failure during deletion and permits an isolated retry',
  async (source) => {
    const storage = new MemoryStorage();
    storage.values.set(`justgo:v1:${otherOwner}:unrelated`, 'preserve');
    const { runtime, client } = createRuntime(storage);
    try {
      await jest.advanceTimersByTimeAsync(0);
      runtime.setEnvironment({ active: true, online: false });
      runtime.changeAccount(owner);
      await runtime.getRepository()!.complete(input(), card);
      const cleanup = source === 'exports' ? cleanExports : cleanBackups;
      cleanup.mockImplementationOnce(() => {
        throw new Error('Synthetic deletion cleanup failure');
      });
      await expect(runtime.deleteAccount(owner)).rejects.toThrow(
        'Synthetic deletion cleanup failure',
      );
      expect(runtime.getRepository()).toBeNull();
      await expect(runtime.deleteAccount(owner)).resolves.toBeUndefined();
      expect(storage.values.get(`justgo:v1:${otherOwner}:unrelated`)).toBe(
        'preserve',
      );
      expect(
        [...storage.values.keys()].some((key) =>
          key.startsWith(`justgo:v1:${owner}:`),
        ),
      ).toBe(false);
    } finally {
      runtime.dispose();
      client.changeAccount(null);
    }
  },
);
it('never reads a cloud journal during startup, reconnection or explicit synchronization', async () => {
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => {
      throw new Error('Unexpected HTTP request for an empty local journal');
    },
  );
  const client = new AccountClient(
    createHttpClient('http://127.0.0.1:3000', fetcher),
    {
      current: () => ({ userId: owner, token: 'synthetic-session' }),
      renew: jest.fn(),
      reject: jest.fn(),
    },
  );
  client.changeAccount(owner);
  const runtime = new ActivityRuntime(client, new MemoryStorage());
  try {
    runtime.changeAccount(owner);
    await runtime.getRepository()!.hydrate();
    runtime.setEnvironment({ active: true, online: false });
    runtime.setEnvironment({ active: false, online: true });
    runtime.setEnvironment({ active: true, online: true });
    await runtime.getRepository()!.synchronize();
    await jest.advanceTimersByTimeAsync(0);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    runtime.dispose();
    client.changeAccount(null);
  }
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
it('parks activity across identity changes and reuses the same repository on recovery', async () => {
  const storage = new MemoryStorage();
  const { runtime, client } = createRuntime(storage);
  runtime.setEnvironment({ active: true, online: false });
  runtime.changeAccount(owner);
  const first = runtime.getRepository()!;
  await first.complete(input(), card);
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

it('rolls over at midnight while active, clears stale cached downloads and retains completions', async () => {
  jest.setSystemTime(new Date('2026-10-31T23:59:59.500-04:00'));
  const storage = new MemoryStorage();
  const { runtime, client } = createRuntime(storage, { timeZone: () => zone });
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const repository = runtime.getRepository()!;
    await repository.hydrate();
    // Saved journals from before #293 can still hold these server caches.
    repository.store.setState({
      journal: {
        ...repository.store.getState().journal,
        today: {
          data: {
            date: '2026-10-31',
            totalReps: 0,
            entries: [],
            nextCursor: null,
          },
          timeZone: zone,
        },
        calendar: {
          data: { month: '2026-10', monthlyReps: 0, activeDays: 0, days: [] },
          timeZone: zone,
        },
      },
    });
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
