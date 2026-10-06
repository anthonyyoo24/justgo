import { act, renderHook } from '@testing-library/react-native';
import { useActiveChallenge } from './useActiveChallenge';
import { ChallengeController } from './controller';
import { AccountRepository } from '../../data/activity/repository';
import { catalog } from '../../../test-support/challenge-catalog';
import {
  MemoryStorage,
  backend,
  deferred,
  owner,
  today,
  zone,
  uuid,
} from '../../../test-support/journal';

let repository: AccountRepository;
let controller: ChallengeController;
let storage: MemoryStorage;
const capture = {
  now: () => Date.parse(`${today}T23:59:00Z`),
  timeZone: () => zone,
};
beforeEach(async () => {
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
  const screen = renderHook(() => useActiveChallenge(controller, capture));
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
  expect(screen.result.current.active).toBeNull();
  expect(controller.getSnapshot().queues.streets?.turn).toBe(1);
  expect(repository.store.getState().journal.operations).toEqual([]);
  screen.unmount();
});
it('ignores empty decks and skips locally before accepting', async () => {
  const screen = renderHook(() => useActiveChallenge(controller, capture));
  await act(async () => screen.result.current.onAction(-1));
  expect(controller.getSnapshot().queues.streets?.turn).toBe(1);
  await act(async () => screen.result.current.onAction(1));
  expect(screen.result.current.active?.turn).toBe(1);
  screen.unmount();
  controller.changeAccount(null);
  const empty = renderHook(() => useActiveChallenge(controller, capture));
  await act(async () => empty.result.current.onAction(1));
  expect(empty.result.current.active).toBeNull();
  empty.unmount();
});
it('preserves original start values through a slow completion, refuses give-up and writes one rep', async () => {
  const screen = renderHook(() => useActiveChallenge(controller, capture));
  await act(async () => screen.result.current.onAction(1));
  const block = deferred<void>();
  storage.blocked = block;
  let first!: Promise<void>, duplicate!: Promise<void>;
  act(() => {
    first = screen.result.current.finish('completed');
    duplicate = screen.result.current.finish('completed');
  });
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
  screen.unmount();
});
it('resets unfinished activity on remount and ignores callbacks retained after unmount', async () => {
  const screen = renderHook(() => useActiveChallenge(controller, capture));
  await act(async () => screen.result.current.onAction(1));
  const old = screen.result.current;
  screen.unmount();
  await old.onAction(1);
  await old.finish('completed');
  const fresh = renderHook(() => useActiveChallenge(controller, capture));
  expect(fresh.result.current.active).toBeNull();
  expect(repository.store.getState().journal.operations).toEqual([]);
  fresh.unmount();
});
