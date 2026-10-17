import type { Catalog } from '@justgo/contracts';
import { ChallengeController } from './controller';
import { AccountRepository } from '../../data/activity/repository';
import { catalog } from '../../../test-support/challenge-catalog';
import {
  MemoryStorage,
  backend,
  deferred,
  owner,
  otherOwner,
  today,
  uuid,
  zone,
} from '../../../test-support/journal';

const repositories: AccountRepository[] = [];
const controllers: ChallengeController[] = [];
const key = (accountId = owner) => `justgo:v1:${accountId}:decks`;
function setup(
  storage = new MemoryStorage(),
  accountId = owner,
  random = jest.fn(() => 0),
) {
  const repository = new AccountRepository({
    accountId,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
  });
  repository.setEnvironment({ online: false, active: true });
  repositories.push(repository);
  const controller = new ChallengeController(
    { request: jest.fn() },
    { repository: () => repository, random, id: () => uuid(1) },
  );
  controllers.push(controller);
  controller.changeAccount(accountId);
  return { repository, controller, storage, random };
}
const order = (
  controller: ChallengeController,
  venue: 'streets' | 'gym' = 'streets',
) => controller.getSnapshot().queues[venue]?.cards.map((card) => card.id);
async function download(
  value: ReturnType<typeof setup>,
  content: Catalog = catalog,
) {
  await value.repository.cacheCatalog(content);
  await value.controller.refresh();
  await value.repository.deckPreferences.settled();
}
afterEach(async () => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  for (const repository of repositories.splice(0)) {
    repository.dispose();
    await repository.deckPreferences.settled();
  }
});

it('shuffles once then resumes every saved venue and last selection on an offline relaunch', async () => {
  const first = setup();
  await download(first);
  expect(order(first.controller)).toEqual(['streets-1', 'streets-0']);
  expect(first.random).toHaveBeenCalledTimes(6);
  first.controller.skip();
  first.controller.select('gym');
  first.controller.skip();
  const streets = order(first.controller);
  const gym = order(first.controller, 'gym');
  await first.repository.deckPreferences.settled();
  first.controller.dispose();
  first.repository.dispose();
  const next = setup(
    first.storage,
    owner,
    jest.fn(() => 0.99),
  );
  await next.controller.refresh();
  expect(next.controller.getSnapshot().selected).toBe('gym');
  expect(order(next.controller)).toEqual(streets);
  expect(order(next.controller, 'gym')).toEqual(gym);
  expect(next.random).not.toHaveBeenCalled();
  expect(next.repository.store.getState().journal.operations).toEqual([]);
});

it('keeps the saved cycle through catalog wording/position changes and reconciles new/removed placements', async () => {
  const value = setup();
  await download(value);
  const extra = { ...catalog.cards[0]!, id: 'new-streets', position: 0 };
  await value.repository.cacheCatalog({
    cards: [
      ...catalog.cards
        .filter((card) => card.id !== 'streets-0')
        .map((card) => ({ ...card, position: 99, text: 'Updated wording' })),
      extra,
    ],
  });
  expect(order(value.controller)).toEqual(['streets-1', 'new-streets']);
  expect(value.controller.getSnapshot().queues.streets?.cards[0]?.text).toBe(
    'Updated wording',
  );
  await value.repository.deckPreferences.settled();
  expect(JSON.parse(value.storage.values.get(key())!).orders.streets).toEqual(
    order(value.controller),
  );
});

it('persists the rotated deck for give-up/skip and completion without persisting an unfinished challenge', async () => {
  const value = setup();
  await download(value);
  value.controller.skip();
  const before = order(value.controller)!;
  await value.controller.complete({
    card: value.controller.getSnapshot().queues.streets!.cards[0]!,
    startedAt: `${today}T14:00:00Z`,
    startTimeZone: zone,
    turn: 1,
  });
  await value.repository.deckPreferences.settled();
  expect(order(value.controller)).toEqual([before[1], before[0]]);
  const stored = JSON.parse(value.storage.values.get(key())!);
  expect(stored.orders.streets).toEqual(order(value.controller));
  expect(stored).not.toHaveProperty('active');
  expect(value.repository.store.getState().journal.operations).toHaveLength(1);
});

it.each([
  'not json',
  JSON.stringify({ version: 2 }),
  JSON.stringify({ version: 1, accountId: otherOwner, orders: {} }),
])(
  'falls back from invalid saved preferences without blocking Home or warning about activity loss',
  async (raw) => {
    const storage = new MemoryStorage();
    storage.values.set(key(), raw);
    const value = setup(storage);
    await download(value);
    expect(value.controller.getSnapshot().selected).toBe('streets');
    expect(order(value.controller)).toEqual(['streets-1', 'streets-0']);
    expect(value.repository.store.getState().warning).toBeNull();
  },
);

it('keeps browsing and selected venue working when optional deck writes fail, without saving/loss-risk UI', async () => {
  const value = setup();
  await download(value);
  value.storage.fail = true;
  value.controller.select('gym');
  value.controller.skip();
  await value.repository.deckPreferences.settled();
  expect(value.controller.getSnapshot()).toMatchObject({
    selected: 'gym',
    saving: false,
    error: '',
  });
  expect(order(value.controller, 'gym')).toEqual(['gym-0', 'gym-1']);
  expect(value.repository.store.getState().warning).toBeNull();
  value.storage.fail = false;
  value.controller.skip();
  await value.repository.deckPreferences.settled();
  expect(JSON.parse(value.storage.values.get(key())!).selected).toBe('gym');
});

it('loads only the selected account and fences an old account preference read', async () => {
  const oldRead = deferred<string | null>();
  const storage = new MemoryStorage();
  const getItem = jest
    .spyOn(storage, 'getItem')
    .mockImplementation((item) =>
      item === key()
        ? oldRead.promise
        : Promise.resolve(storage.values.get(item) ?? null),
    );
  const previous = setup(storage);
  const next = setup(storage, otherOwner);
  await download(next);
  previous.controller.changeAccount(null);
  oldRead.resolve(
    JSON.stringify({
      version: 1,
      accountId: owner,
      selected: 'gym',
      orders: {},
    }),
  );
  await previous.repository.deckPreferences.read();
  expect(previous.controller.getSnapshot()).toMatchObject({
    selected: 'streets',
    queues: {},
  });
  expect(next.controller.getSnapshot().selected).toBe('streets');
  expect(order(next.controller)).toEqual(['streets-1', 'streets-0']);
  getItem.mockRestore();
});

it('preserves a venue tapped during slow optional hydration', async () => {
  const storage = new MemoryStorage();
  const read = deferred<string | null>();
  jest
    .spyOn(storage, 'getItem')
    .mockImplementation((item) =>
      item === key()
        ? read.promise
        : Promise.resolve(storage.values.get(item) ?? null),
    );
  const value = setup(storage);
  value.controller.select('gym');
  read.resolve(
    JSON.stringify({
      version: 1,
      accountId: owner,
      selected: 'cafe',
      orders: {},
    }),
  );
  await download(value);
  expect(value.controller.getSnapshot().selected).toBe('gym');
});

it('drains optional writes before deleting only the owning account keys', async () => {
  const value = setup();
  await download(value);
  value.storage.values.set(key(otherOwner), 'Other account');
  value.storage.blocked = deferred<void>();
  value.controller.select('gym');
  const erased = value.repository.erase();
  value.storage.blocked.resolve();
  await erased;
  expect([...value.storage.values.keys()]).toEqual([key(otherOwner)]);
  value.controller.select('cafe');
  await value.repository.deckPreferences.settled();
  expect(value.storage.values.has(key())).toBe(false);
});
