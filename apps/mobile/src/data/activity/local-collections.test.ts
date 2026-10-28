import { AccountRepository } from './repository';
import {
  progressCalendar,
  progressDay,
  progressMetrics,
} from './progress/progress';
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
import { memoryLocalJournal } from '../../../test-support/local-journal';
import { journalEntry } from './private-journal';

const owned: AccountRepository[] = [];
function setup(storage = new MemoryStorage()) {
  const transport = backend();
  const repository = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
    localJournal: memoryLocalJournal(owner, storage),
    dataMode: 'local',
  });
  owned.push(repository);
  return { repository, storage, transport };
}
afterEach(() => {
  owned.splice(0).forEach((repository) => repository.dispose());
});

it('keeps guest history and private writing through relaunch and day changes without sending anything', async () => {
  const { repository, storage, transport } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Guest writing',
  });
  await repository.synchronize();
  await repository.rollover('2026-08-15', zone);
  expect(transport.calls).toEqual([]);
  repository.dispose();
  const next = setup(storage);
  next.repository.setEnvironment({ active: true, online: false });
  await next.repository.hydrate();
  expect(next.repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Guest writing',
  );
  expect(progressMetrics(next.repository.store.getState())?.totalReps).toBe(1);
  expect(
    progressCalendar(next.repository.store.getState(), today.slice(0, 7))
      ?.monthlyReps,
  ).toBe(1);
  expect(progressDay(next.repository.store.getState(), today)?.totalReps).toBe(
    1,
  );
});

it('merges complete history idempotently and rejects changed historical ownership context', async () => {
  const { repository } = setup();
  await repository.mergeCompletions([attempt(1)]);
  await repository.mergeCompletions([
    {
      ...attempt(1),
      startedAt: attempt(1).startedAt.replace('.000Z', '.000000Z'),
    },
  ]);
  await repository.mergeCompletions([attempt(1)]);
  expect((await repository.snapshotData()).attempts).toHaveLength(1);
  await expect(
    repository.mergeCompletions([{ ...attempt(1), challengeId: 'changed' }]),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(progressMetrics(repository.store.getState())?.totalReps).toBe(1);
});

it.each(['.000000Z', 'Z'])(
  'restores private writing and alternatives when completion timestamp precision differs (%s)',
  async (fraction) => {
    const { repository, transport } = setup();
    await repository.mergeCompletions([attempt(1)]);
    const entry = journalEntry(owner, {
      ...attempt(1),
      startedAt: attempt(1).startedAt.replace('.000Z', fraction),
      reflection: { feeling: null, text: 'Imported writing', revision: 1 },
    });
    const alternative = {
      ...entry,
      startedAt: attempt(1).startedAt,
      reflection: { ...entry.reflection, text: 'Preserved writing' },
    };
    await expect(
      repository.restoreJournal([entry], [alternative]),
    ).resolves.toMatchObject({ added: 1, conflictIds: [entry.id] });
    await expect(
      repository.restoreJournal([entry], [alternative]),
    ).resolves.toMatchObject({ identical: 1 });
    expect(await repository.snapshotJournal()).toEqual({
      entries: [entry],
      alternatives: [alternative],
    });
    expect(progressMetrics(repository.store.getState())?.totalReps).toBe(1);
    expect(transport.calls).toEqual([]);
  },
);

it.each([
  ['microseconds', { startedAt: `${today}T14:00:00.000001Z` }],
  ['challenge', { challengeId: 'changed' }],
  ['venue', { venue: 'cafe' as const }],
  ['date', { activityDate: '2026-10-06' }],
  ['start zone', { startTimeZone: null }],
  ['display zone', { displayTimeZone: 'UTC' }],
] as const)(
  'rejects a restored journal with changed %s context',
  async (_label, change) => {
    const { repository } = setup();
    await repository.mergeCompletions([attempt(1)]);
    const entry = journalEntry(owner, {
      ...attempt(1),
      ...change,
      reflection: { feeling: null, text: 'Imported writing', revision: 1 },
    });
    await expect(repository.restoreJournal([entry])).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(await repository.snapshotJournal()).toEqual({
      entries: [],
      alternatives: [],
    });
    expect((await repository.snapshotData()).attempts).toHaveLength(1);
  },
);

it('retains owner and feeling-scale validation when restoring equivalent timestamp precision', async () => {
  const { repository } = setup();
  await repository.mergeCompletions([attempt(1)]);
  const entry = journalEntry(owner, {
    ...attempt(1),
    startedAt: attempt(1).startedAt.replace('.000Z', '.000000Z'),
    reflection: { feeling: null, text: 'Imported writing', revision: 1 },
  });
  await expect(
    repository.restoreJournal([{ ...entry, accountId: otherOwner }]),
  ).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
  await expect(
    repository.restoreJournal([{ ...entry, feelingScaleVersion: 2 as 1 }]),
  ).rejects.toMatchObject({ code: 'INVALID_ENTRY' });
  expect((await repository.snapshotJournal()).entries).toEqual([]);
});

it('preserves concurrent writing and only adopts a remote successor when the local version still matches', async () => {
  const { repository } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), { text: 'Original' });
  const original = (await repository.snapshotJournal()).entries[0]!;
  const remote = {
    ...original,
    reflection: { ...original.reflection, text: 'Remote', revision: 2 },
  };
  await repository.submitReflection(uuid(1), uuid(3), { text: 'New local' });
  await repository.mergeSyncedJournal([remote], [], [original]);
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe('New local');
  expect(
    (await repository.listJournalConflicts()).some(
      (entry) => entry.reflection.text === 'Remote',
    ),
  ).toBe(true);
  const current = (await repository.snapshotJournal()).entries[0]!;
  await repository.mergeSyncedJournal([remote], [], [current]);
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe('Remote');
});

it('clears activity and all private versions while leaving the collection usable', async () => {
  const { repository, storage } = setup();
  await repository.mergeCompletions([attempt(1)]);
  await repository.restoreJournal([
    journalEntry(owner, {
      ...attempt(1),
      reflection: { feeling: null, text: 'Saved', revision: 1 },
    }),
  ]);
  await repository.clearData();
  expect(await repository.snapshotData()).toEqual({
    attempts: [],
    journal: { entries: [], alternatives: [] },
  });
  await repository.complete(input(2), card);
  repository.dispose();
  const next = setup(storage);
  await next.repository.hydrate();
  expect((await next.repository.snapshotData()).attempts).toHaveLength(1);
});
