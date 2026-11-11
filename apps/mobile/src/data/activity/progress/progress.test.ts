import { progressCalendar, progressDay, progressMetrics } from './progress';
import { AccountRepository } from '../repository';
import { journalEntry } from '../private-journal';
import {
  MemoryStorage,
  card,
  input,
  owner,
  today,
  zone,
  uuid,
  attempt,
} from '../../../../test-support/journal';
const repositories: AccountRepository[] = [];
async function setup(storage = new MemoryStorage()) {
  const repo = new AccountRepository({
    accountId: owner,
    storage,
    today,
    timeZone: zone,
  });
  repositories.push(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.hydrate();
  return { repo, storage };
}
const on = (n: number, date: string) => ({
  ...input(n),
  startedAt: `${date}T14:00:00.000Z`,
});
afterEach(() => {
  repositories.forEach((r) => r.dispose());
  repositories.length = 0;
});
it('counts reps, days and streaks from the history saved on this phone, through relaunch', async () => {
  const { repo, storage } = await setup();
  await repo.complete(on(1, '2026-09-28'), card);
  await repo.complete(on(2, '2026-10-03'), card);
  await repo.complete(on(3, '2026-10-04'), card);
  await repo.complete(input(4), card);
  await repo.complete(input(5), card);
  const expected = (state: AccountRepository['store']) => {
    expect(progressMetrics(state.getState())).toEqual({
      totalReps: 5,
      currentStreak: 3,
      bestStreak: 3,
    });
    expect(progressCalendar(state.getState(), '2026-10')).toEqual({
      month: '2026-10',
      monthlyReps: 4,
      activeDays: 3,
      days: [
        { date: '2026-10-03', reps: 1 },
        { date: '2026-10-04', reps: 1 },
        { date: today, reps: 2 },
      ],
    });
    expect(progressCalendar(state.getState(), '2026-09')).toMatchObject({
      monthlyReps: 1,
      activeDays: 1,
    });
    expect(progressDay(state.getState(), today)).toMatchObject({
      date: today,
      totalReps: 2,
      nextCursor: null,
      entries: [
        expect.objectContaining({ id: uuid(4) }),
        expect.objectContaining({ id: uuid(5) }),
      ],
    });
  };
  expected(repo.store);
  repo.dispose();
  expected((await setup(storage)).repo.store);
});
it('keeps the current streak through today until a day is missed', async () => {
  const { repo } = await setup();
  await repo.complete(on(1, '2026-10-03'), card);
  await repo.complete(on(2, '2026-10-04'), card);
  expect(progressMetrics(repo.store.getState())).toMatchObject({
    currentStreak: 2,
    bestStreak: 2,
  });
  await repo.rollover('2026-10-06', zone);
  expect(progressMetrics(repo.store.getState())).toMatchObject({
    totalReps: 2,
    currentStreak: 0,
    bestStreak: 2,
  });
  expect(progressDay(repo.store.getState(), '2026-10-03').entries).toHaveLength(
    1,
  );
});
it('leaves out a record that an earlier upload marked rejected', async () => {
  const { repo } = await setup();
  await repo.complete(input(1), card);
  await repo.complete(input(2), card);
  const journal = repo.store.getState().journal;
  repo.store.setState({
    journal: {
      ...journal,
      records: {
        ...journal.records,
        [uuid(1)]: {
          ...journal.records[uuid(1)]!,
          rejected: 'INVALID_REQUEST',
        },
      },
    },
  });
  expect(progressMetrics(repo.store.getState()).totalReps).toBe(1);
  expect(progressCalendar(repo.store.getState(), '2026-10').monthlyReps).toBe(
    1,
  );
  expect(
    progressDay(repo.store.getState(), today).entries.map((a) => a.id),
  ).toEqual([uuid(2)]);
});
it('shows the newest private writing on its day and counts only completions', async () => {
  const { repo } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Latest local text.',
  });
  await repo.restoreJournal([
    journalEntry(owner, {
      ...attempt(2),
      activityDate: '2026-10-03',
      startedAt: '2026-10-03T14:00:00.000Z',
      reflection: {
        feeling: null,
        text: 'Restored synthetic journal',
        revision: 1,
      },
    }),
  ]);
  expect(
    progressDay(repo.store.getState(), today).entries[0]?.reflection?.text,
  ).toBe('Latest local text.');
  expect(progressDay(repo.store.getState(), '2026-10-03')).toMatchObject({
    totalReps: 0,
    entries: [expect.objectContaining({ id: uuid(2) })],
  });
  expect(progressMetrics(repo.store.getState()).totalReps).toBe(1);
});
