import { act, renderHook } from '@testing-library/react-native';
import { useActiveChallenge } from './useActiveChallenge';
import { ChallengeController } from '../controller';
import { AccountRepository } from '../../../data/activity/repository';
import { catalog } from '../../../../test-support/challenge-catalog';
import {
  MemoryStorage,
  backend,
  deferred,
  owner,
  today,
  zone,
  uuid,
} from '../../../../test-support/journal';

let repository: AccountRepository;
let controller: ChallengeController;
let storage: MemoryStorage;
const capture = {
  now: () => Date.parse(`${today}T23:59:00Z`),
  timeZone: () => zone,
};
const mockFeedback = jest.fn();
jest.mock('../../../platform/haptics/haptics', () => ({
  useHapticFeedback: () => mockFeedback,
}));
beforeEach(async () => {
  mockFeedback.mockClear();
  storage = new MemoryStorage();
  repository = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
  });
  repository.setEnvironment({ active: true, online: false });
  await repository.cacheCatalog(catalog);
  controller = new ChallengeController(
    { request: jest.fn() },
    { repository: () => repository, id: () => uuid(1) },
  );
  controller.changeAccount(owner);
});
afterEach(() => {
  controller.dispose();
  repository.dispose();
});

it('captures one local start, freezes its card/duration, and gives up without a saved attempt', async () => {
  const screen = await renderHook(() =>
    useActiveChallenge(controller, capture),
  );
  await act(async () => {
    await screen.result.current.onAction(1);
    await screen.result.current.onAction(1);
  });
  expect(screen.result.current.active).toMatchObject({
    startedAt: `${today}T23:59:00.000Z`,
    startTimeZone: zone,
    turn: 0,
  });
  expect(screen.result.current.active).not.toHaveProperty('deadlineAt');
  expect(mockFeedback).toHaveBeenCalledTimes(1);
  expect(mockFeedback).toHaveBeenCalledWith('accept');
  expect(controller.getSnapshot()).not.toHaveProperty('active');
  await act(async () =>
    repository.cacheCatalog({
      cards: catalog.cards.map((c) => ({
        ...c,
        text: 'Updated',
        durationSeconds: 60,
      })),
    }),
  );
  expect(screen.result.current.active?.card).toMatchObject({
    text: 'Say hello.',
    durationSeconds: 300,
  });
  await act(async () => screen.result.current.finish('given_up'));
  expect(mockFeedback).toHaveBeenCalledTimes(1);
  expect(screen.result.current.active).toBeNull();
  expect(controller.getSnapshot().queues.streets?.turn).toBe(1);
  expect(repository.store.getState().journal.operations).toEqual([]);
  await screen.unmount();
});
it('ignores empty decks and skips locally before accepting', async () => {
  const screen = await renderHook(() =>
    useActiveChallenge(controller, capture),
  );
  await act(async () => screen.result.current.onAction(-1));
  expect(mockFeedback).not.toHaveBeenCalled();
  expect(controller.getSnapshot().queues.streets?.turn).toBe(1);
  await act(async () => screen.result.current.onAction(1));
  expect(screen.result.current.active?.turn).toBe(1);
  await screen.unmount();
  controller.changeAccount(null);
  const empty = await renderHook(() => useActiveChallenge(controller, capture));
  await act(async () => empty.result.current.onAction(1));
  expect(empty.result.current.active).toBeNull();
  await empty.unmount();
});
it('preserves original start values through a slow completion, refuses give-up and writes one rep', async () => {
  const screen = await renderHook(() =>
    useActiveChallenge(controller, capture),
  );
  await act(async () => screen.result.current.onAction(1));
  const block = deferred<void>();
  storage.blocked = block;
  let first!: Promise<void>, duplicate!: Promise<void>;
  await act(() => {
    first = screen.result.current.finish('completed');
    duplicate = screen.result.current.finish('completed');
  });
  expect(mockFeedback.mock.calls).toEqual([['accept']]);
  await act(async () => screen.result.current.finish('given_up'));
  expect(screen.result.current.active).not.toBeNull();
  await act(async () => {
    block.resolve();
    await Promise.all([first, duplicate]);
  });
  expect(Object.keys(repository.store.getState().journal.records)).toHaveLength(
    1,
  );
  expect(repository.getAttempt(uuid(1))).toMatchObject({
    startedAt: `${today}T23:59:00.000Z`,
    startTimeZone: zone,
    activityDate: today,
  });
  expect(mockFeedback.mock.calls).toEqual([['accept'], ['completed']]);
  await act(async () => screen.result.current.finish('completed'));
  expect(mockFeedback).toHaveBeenCalledTimes(2);
  await screen.unmount();
});
it('resets unfinished activity on remount and ignores callbacks retained after unmount', async () => {
  const screen = await renderHook(() =>
    useActiveChallenge(controller, capture),
  );
  await act(async () => screen.result.current.onAction(1));
  const old = screen.result.current;
  await screen.unmount();
  await old.onAction(1);
  await old.finish('completed');
  expect(mockFeedback.mock.calls).toEqual([['accept']]);
  const fresh = await renderHook(() => useActiveChallenge(controller, capture));
  expect(fresh.result.current.active).toBeNull();
  expect(repository.store.getState().journal.operations).toEqual([]);
  await fresh.unmount();
});

it('does not celebrate a failed local completion and celebrates its successful retry once', async () => {
  const screen = await renderHook(() =>
    useActiveChallenge(controller, capture),
  );
  await act(async () => screen.result.current.onAction(1));
  jest
    .spyOn(repository, 'complete')
    .mockRejectedValueOnce(new Error('completion unavailable'));
  await act(async () => screen.result.current.finish('completed'));
  expect(controller.getSnapshot().success).toBeNull();
  expect(mockFeedback.mock.calls).toEqual([['accept']]);
  await act(async () => screen.result.current.finish('completed'));
  expect(controller.getSnapshot().success).not.toBeNull();
  expect(mockFeedback.mock.calls).toEqual([['accept'], ['completed']]);
  await screen.unmount();
});

it('does not play late completion feedback after leaving the account flow', async () => {
  const screen = await renderHook(() =>
    useActiveChallenge(controller, capture),
  );
  await act(async () => screen.result.current.onAction(1));
  const block = deferred<void>();
  storage.blocked = block;
  let completion!: Promise<void>;
  await act(() => {
    completion = screen.result.current.finish('completed');
  });
  await screen.unmount();
  await act(async () => {
    block.resolve();
    await completion;
  });
  expect(mockFeedback.mock.calls).toEqual([['accept']]);
});

it.each(['given_up', 'completed'] as const)(
  'does not skip an untouched front when an active placement is removed before %s',
  async (outcome) => {
    await controller.refresh();
    const screen = await renderHook(() =>
      useActiveChallenge(controller, capture),
    );
    await act(async () => screen.result.current.onAction(1));
    const active = screen.result.current.active!;
    await act(async () =>
      repository.cacheCatalog({
        cards: [
          ...catalog.cards.filter((card) => card.id !== active.card.id),
          { ...active.card, id: 'replacement', position: 99 },
        ],
      }),
    );
    const before = controller.getSnapshot().queues.streets!;
    expect(before.cards).toHaveLength(2);
    const ids = before.cards.map((card) => card.id);
    await act(async () => screen.result.current.finish(outcome));
    await repository.deckPreferences.settled();
    expect(
      controller.getSnapshot().queues.streets?.cards.map((card) => card.id),
    ).toEqual(ids);
    expect(controller.getSnapshot().queues.streets?.turn).toBe(before.turn);
    expect((await repository.deckPreferences.read())?.orders.streets).toEqual(
      ids,
    );
    expect(repository.store.getState().journal.operations).toHaveLength(
      outcome === 'completed' ? 1 : 0,
    );
    await screen.unmount();
  },
);
