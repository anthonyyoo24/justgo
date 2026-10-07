import { QueryClient } from '@tanstack/react-query';
import { accountKey } from '../../lib/account-client';
import { reconcileDayQueries, preserveDayRead } from './progress-read-cache';
import { progressCalendar, progressDay, progressMetrics } from './progress';
import { AccountRepository } from './repository';
import { ApiError } from '../../lib/http';
import type {
  ProgressSummary,
  ProgressCalendar,
  ProgressDayResponse,
} from '@justgo/contracts';
import {
  MemoryStorage,
  backend,
  card,
  input,
  owner,
  today,
  zone,
  uuid,
  attempt,
} from '../../../test-support/journal';
const repositories: AccountRepository[] = [];
const summary: ProgressSummary = {
  today,
  timeZone: zone,
  totalReps: 10,
  currentStreak: 2,
  bestStreak: 5,
  streakContext: { month: '2026-10', precedingRun: 0, bestBeforeMonth: 5 },
};
const calendar: ProgressCalendar = {
  month: '2026-10',
  monthlyReps: 10,
  activeDays: 2,
  days: [
    { date: '2026-10-03', reps: 2 },
    { date: '2026-10-04', reps: 8 },
  ],
};
async function setup(storage = new MemoryStorage(), transport = backend()) {
  const repo = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
  });
  repositories.push(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.hydrate();
  await repo.acceptSummary(summary, 0);
  await repo.acceptCalendar(calendar, zone, 0);
  return { repo, storage, transport };
}
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  repositories.forEach((r) => r.dispose());
  repositories.length = 0;
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
it('10 + 1 remains 11 through acknowledgement, independent rebase order and relaunch', async () => {
  const { repo, storage } = await setup();
  await repo.complete(input(), card);
  expect(progressMetrics(repo.store.getState())).toEqual({
    totalReps: 11,
    currentStreak: 3,
    bestStreak: 5,
  });
  expect(progressCalendar(repo.store.getState(), '2026-10')).toMatchObject({
    monthlyReps: 11,
    activeDays: 3,
  });
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(11);
  const fence = repo.captureAggregateFence()!;
  await repo.acceptCalendar(
    {
      ...calendar,
      monthlyReps: 11,
      activeDays: 3,
      days: [...calendar.days, { date: today, reps: 1 }],
    },
    zone,
    fence,
  );
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(11);
  await repo.acceptSummary(
    { ...summary, totalReps: 11, currentStreak: 3 },
    fence,
  );
  repo.dispose();
  const reopened = (await setup(storage)).repo;
  // Restore setup's artificial baselines to the actually stored acknowledgement.
  await reopened.acceptSummary(
    { ...summary, totalReps: 11, currentStreak: 3 },
    reopened.captureAggregateFence()!,
  );
  expect(progressMetrics(reopened.store.getState())?.totalReps).toBe(11);
  expect(progressDay(reopened.store.getState(), today)?.entries).toHaveLength(
    1,
  );
});
it('retains ten memory-only rounds once each through partial recovery, rebase and pruning', async () => {
  const { repo, storage } = await setup();
  storage.fail = true;
  for (let n = 1; n <= 10; n++) await repo.complete(input(n), card);
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(20);
  expect(progressCalendar(repo.store.getState(), '2026-10')).toMatchObject({
    monthlyReps: 20,
    activeDays: 3,
  });
  expect(progressDay(repo.store.getState(), today)?.entries).toHaveLength(10);
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(20);
  expect(progressDay(repo.store.getState(), today)?.entries).toHaveLength(10);
  storage.fail = false;
  await jest.advanceTimersByTimeAsync(30_000);
  await repo.acceptSummary(
    { ...summary, totalReps: 20, currentStreak: 3 },
    repo.captureAggregateFence()!,
  );
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(20);
  await repo.rollover('2026-10-06', zone);
  await repo.setFlowAttempt(null);
  expect(progressCalendar(repo.store.getState(), '2026-10')?.monthlyReps).toBe(
    20,
  );
});
it('corrects a definitive rejection once, keeps writing and sends independent entries', async () => {
  const transport = backend();
  const create = transport.create;
  transport.create = async (body, signal) => {
    if (body.id === uuid(1)) throw new ApiError('ATTEMPT_INELIGIBLE');
    return create(body, signal);
  };
  const { repo, storage } = await setup(new MemoryStorage(), transport);
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Retained rejected writing.',
  });
  await repo.complete(input(2), card);
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(11);
  expect(progressCalendar(repo.store.getState(), '2026-10')?.monthlyReps).toBe(
    11,
  );
  expect(
    progressDay(repo.store.getState(), today)?.entries.map((a) => a.id),
  ).toEqual([uuid(2)]);
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Retained rejected writing.',
  );
  repo.dispose();
  const reopened = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
  });
  repositories.push(reopened);
  reopened.setEnvironment({ active: true, online: false });
  await reopened.hydrate();
  expect(progressMetrics(reopened.store.getState())?.totalReps).toBe(11);
  expect(reopened.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Retained rejected writing.',
  );
  await reopened.rollover('2026-11-01', zone);
  expect(progressMetrics(reopened.store.getState())).toMatchObject({
    totalReps: 11,
    currentStreak: null,
    bestStreak: null,
  });
});
it.each(['INVALID_REQUEST', 'NOT_FOUND'] as const)(
  'removes rejected %s create credit and preserves provisional credit for transient failures',
  async (code) => {
    const transport = backend();
    transport.create = async () => {
      throw new ApiError(code);
    };
    const { repo } = await setup(new MemoryStorage(), transport);
    await repo.complete(input(), card);
    repo.setEnvironment({ active: true, online: true });
    await repo.synchronize();
    expect(progressMetrics(repo.store.getState())?.totalReps).toBe(10);
    expect(progressDay(repo.store.getState(), today)).toBeUndefined();
  },
);
it('keeps provisional progress on uncertain failure and rep credit on reflection-only rejection', async () => {
  const transport = backend();
  transport.create = async () => {
    throw new ApiError('NETWORK');
  };
  const { repo } = await setup(new MemoryStorage(), transport);
  await repo.complete(input(), card);
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(11);
  transport.create = async () => attempt();
  transport.patch = async () => {
    throw new ApiError('INVALID_REQUEST');
  };
  await jest.advanceTimersByTimeAsync(1000);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Rejected patch.' });
  await repo.synchronize();
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(11);
  expect(
    progressDay(repo.store.getState(), today)?.entries[0]?.reflection?.text,
  ).toBe('Rejected patch.');
});
it('same-ID day merging and stale downloaded/acknowledged reflections cannot erase newer writing', async () => {
  const { repo } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Latest local text.',
  });
  const page: ProgressDayResponse = {
    date: today,
    totalReps: 1,
    entries: [attempt()],
    nextCursor: null,
  };
  await repo.acceptTodayPage(page, zone);
  expect(progressDay(repo.store.getState(), today)?.entries).toHaveLength(1);
  expect(
    progressDay(repo.store.getState(), today)?.entries[0]?.reflection?.text,
  ).toBe('Latest local text.');
  repo.store.setState({ online: true });
  expect(
    progressDay(repo.store.getState(), '2026-10-04', {
      ...page,
      date: '2026-10-04',
      entries: [{ ...attempt(2), activityDate: '2026-10-04' }],
    })?.entries,
  ).toHaveLength(1);
  repo.store.setState({ online: false });
  expect(
    progressDay(repo.store.getState(), '2026-10-04', {
      ...page,
      date: '2026-10-04',
    }),
  ).toBeUndefined();
  expect(
    progressCalendar(repo.store.getState(), '2026-09', {
      ...calendar,
      month: '2026-09',
    }),
  ).toBeUndefined();
});
it('today paging retains later pages and higher revisions through refresh and offline restart', async () => {
  const { repo, storage } = await setup();
  const page = (n: number, nextCursor: string | null): ProgressDayResponse => ({
    date: today,
    totalReps: 2,
    entries: [
      {
        ...attempt(n),
        reflection: { feeling: null, text: 'Newer cloud text.', revision: 3 },
      },
    ],
    nextCursor,
  });
  await repo.acceptTodayPage(page(1, 'next'), zone);
  await repo.acceptTodayPage(page(2, null), zone, true);
  await repo.acceptTodayPage(
    { ...page(1, 'next'), entries: [attempt(1)] },
    zone,
  );
  expect(progressDay(repo.store.getState(), today)?.entries).toHaveLength(2);
  expect(
    progressDay(repo.store.getState(), today)?.entries[0]?.reflection?.revision,
  ).toBe(3);
  repo.dispose();
  const fresh = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
  });
  repositories.push(fresh);
  fresh.setEnvironment({ active: true, online: false });
  await fresh.hydrate();
  expect(progressDay(fresh.store.getState(), today)).toMatchObject({
    nextCursor: null,
    entries: expect.arrayContaining([expect.objectContaining({ id: uuid(2) })]),
  });
  await fresh.rollover('2026-11-01', 'UTC');
  expect(progressDay(fresh.store.getState(), '2026-11-01')).toBeUndefined();
  expect(progressCalendar(fresh.store.getState(), '2026-11')).toBeUndefined();
  expect(progressMetrics(fresh.store.getState())?.totalReps).toBe(10);
});
it('dates later than today preserve current streak and count toward best streak', async () => {
  const { repo } = await setup();
  await repo.acceptCalendar(
    {
      month: '2026-10',
      monthlyReps: 4,
      activeDays: 4,
      days: ['2026-10-04', today, '2026-10-06', '2026-10-07'].map((date) => ({
        date,
        reps: 1,
      })),
    },
    zone,
    0,
  );
  expect(progressMetrics(repo.store.getState())).toEqual({
    totalReps: 10,
    currentStreak: 2,
    bestStreak: 5,
  });
  await repo.acceptSummary(
    {
      ...summary,
      streakContext: { month: '2026-10', precedingRun: 4, bestBeforeMonth: 4 },
    },
    0,
  );
  await repo.acceptCalendar(
    { ...calendar, days: [{ date: '2026-10-01', reps: 1 }] },
    zone,
    0,
  );
  await repo.rollover('2026-10-01', zone);
  expect(progressMetrics(repo.store.getState())).toMatchObject({
    currentStreak: 5,
    bestStreak: 5,
  });
});
it('fences aggregates by local generation, period and active account', async () => {
  const { repo } = await setup();
  const old = repo.captureAggregateFence()!;
  await repo.complete(input(), card);
  expect(await repo.acceptSummary(summary, old)).toBe(false);
  expect(await repo.acceptCalendar(calendar, zone, old)).toBe(false);
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
  await repo.rollover('2026-10-06', zone);
  expect(await repo.acceptSummary(summary, repo.captureAggregateFence()!)).toBe(
    false,
  );
  repo.dispose();
  expect(
    await repo.acceptCalendar(calendar, zone, repo.captureAggregateFence()!),
  ).toBe(false);
});
it('preserves earlier frozen dates and retires an older snapshot until its generation is refreshed', async () => {
  const { repo } = await setup();
  repo.store.setState({ online: true });
  const september = {
    month: '2026-09',
    monthlyReps: 0,
    activeDays: 0,
    days: [],
    generation: 0,
  };
  expect(
    progressCalendar(repo.store.getState(), '2026-09', september)?.monthlyReps,
  ).toBe(0);
  repo.setEnvironment({ active: true, online: false });
  await repo.complete(
    { ...input(), startedAt: '2026-09-30T23:30:00.000Z', startTimeZone: zone },
    card,
  );
  expect(progressMetrics(repo.store.getState())?.totalReps).toBe(11);
  expect(progressCalendar(repo.store.getState(), '2026-10')?.monthlyReps).toBe(
    10,
  );
  repo.store.setState({ online: true });
  expect(
    progressCalendar(repo.store.getState(), '2026-09', september),
  ).toBeUndefined();
  expect(
    progressDay(repo.store.getState(), '2026-09-30')?.entries[0],
  ).toMatchObject({ activityDate: '2026-09-30', displayTimeZone: zone });
  expect(
    progressCalendar(repo.store.getState(), '2026-09', {
      ...september,
      generation: repo.store.getState().journal.generation,
      monthlyReps: 1,
      activeDays: 1,
      days: [{ date: '2026-09-30', reps: 1 }],
    })?.monthlyReps,
  ).toBe(1);
});

it('keeps day query edits through stale reads, adopts backend-wins corrections and isolates owners', async () => {
  const { repo } = await setup();
  const queries = new QueryClient();
  const key = accountKey(owner, 'progress', 'day', today);
  const otherKey = accountKey('other', 'progress', 'day', today);
  const page = {
    date: today,
    totalReps: 1,
    entries: [attempt()],
    nextCursor: null,
  };
  try {
    queries.setQueryData(key, { pages: [page], pageParams: [''] });
    queries.setQueryData(otherKey, { pages: [page], pageParams: [''] });
    await repo.adoptAttempt({
      ...attempt(),
      reflection: { feeling: null, text: 'Confirmed newer text.', revision: 3 },
    });
    reconcileDayQueries(queries, owner, repo.store.getState());
    expect(
      preserveDayRead(queries, key, page).entries[0]?.reflection?.text,
    ).toBe('Confirmed newer text.');
    expect(
      preserveDayRead(queries, otherKey, page).entries[0]?.reflection,
    ).toBeNull();
    // Canonical conflict recovery intentionally supersedes optimistic text.
    const journal = structuredClone(repo.store.getState().journal);
    journal.records[uuid(1)]!.attempt.reflection = {
      feeling: null,
      text: 'Backend wins.',
      revision: 2,
    };
    repo.store.setState({ journal });
    reconcileDayQueries(queries, owner, repo.store.getState());
    expect(
      preserveDayRead(queries, key, page).entries[0]?.reflection?.text,
    ).toBe('Backend wins.');
    expect(
      preserveDayRead(queries, key, {
        ...page,
        entries: [
          {
            ...attempt(),
            reflection: {
              feeling: null,
              text: 'Newest cloud text.',
              revision: 4,
            },
          },
        ],
      }).entries[0]?.reflection?.text,
    ).toBe('Newest cloud text.');
  } finally {
    queries.clear();
  }
});
