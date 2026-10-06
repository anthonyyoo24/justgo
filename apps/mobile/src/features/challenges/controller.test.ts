import { venues, type Catalog } from '@justgo/contracts';
import { ChallengeController, type ChallengeStart } from './controller';
import { AccountRepository } from '../../data/activity/repository';
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

import { catalog } from '../../../test-support/challenge-catalog';
let storage: MemoryStorage;
let repository: AccountRepository;
let current: AccountRepository | null;
let controller: ChallengeController;
let request: jest.Mock;
let ids: jest.Mock;
let start: ChallengeStart;
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
  await repository.hydrate();
  current = repository;
  request = jest.fn().mockResolvedValue(catalog);
  let n = 1;
  ids = jest.fn(() => uuid(n++));
  controller = new ChallengeController(
    { request },
    {
      repository: () => current,
      id: ids,
    },
  );
  controller.changeAccount(owner);
  start = {
    card: catalog.cards[0]!,
    startedAt: `${today}T23:59:00.000Z`,
    startTimeZone: zone,
    turn: 0,
  };
});
afterEach(() => {
  controller.dispose();
  repository.dispose();
  current?.dispose();
});
async function downloaded() {
  await repository.cacheCatalog(catalog);
}

it('hydrates all venue decks and cycles without IDs, writes or unfinished state', async () => {
  await downloaded();
  await controller.refresh();
  for (const { id } of venues)
    expect(controller.getSnapshot().queues[id]?.cards).toHaveLength(2);
  controller.select('gym');
  controller.skip();
  expect(controller.getSnapshot().queues.gym?.cards[0]?.id).toBe('gym-1');
  expect(controller.getSnapshot()).not.toHaveProperty('active');
  expect(ids).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(repository.store.getState().journal.operations).toEqual([]);
});
it('only Completed creates an ID, saves offline, and ignores duplicate completion after success', async () => {
  await downloaded();

  await controller.complete(start);
  expect(ids).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().success?.id).toBe(uuid(1));
  expect(
    repository.store.getState().journal.records[uuid(1)]?.phoneVersion,
  ).toBe(1);
  await controller.complete(start);
  await controller.dismissSuccess();
  expect(ids).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot()).not.toHaveProperty('active');
});
it('coalesces duplicate completion during a slow phone write', async () => {
  await downloaded();

  const block = deferred<void>();
  storage.blocked = block;
  const first = controller.complete(start);
  const duplicate = controller.complete(start);
  expect(first).toBe(duplicate);
  expect(controller.getSnapshot().saving).toBe(true);
  block.resolve();
  await first;
  expect(ids).toHaveBeenCalledTimes(1);
  expect(Object.keys(repository.store.getState().journal.records)).toHaveLength(
    1,
  );
});
it('retains the completion identity through an interrupted save and refuses give-up after submission', async () => {
  await downloaded();

  jest
    .spyOn(repository, 'complete')
    .mockRejectedValueOnce(new Error('interrupted'));
  await controller.complete(start);
  expect(controller.getSnapshot()).toMatchObject({
    saving: false,
    completionStarted: true,
    success: null,
  });
  expect(controller.getSnapshot().error).toContain('Try Completed again');
  controller.skip(start.card.venue);
  expect(controller.getSnapshot().queues.streets?.turn).toBe(0);
  await controller.complete(start);
  expect(controller.getSnapshot().success?.id).toBe(uuid(1));
  expect(ids).toHaveBeenCalledTimes(1);
  expect(repository.store.getState().journal.operations).toHaveLength(1);
});
it('finishes after phone saving while the upload remains pending', async () => {
  await downloaded();
  const cloud = deferred<never>();
  // Runtime uses the actual repository; only the external transport is controlled.
  current = new AccountRepository({
    accountId: otherOwner,
    storage,
    transport: { create: () => cloud.promise, patch: () => cloud.promise },
    today,
    timeZone: zone,
  });
  await current.hydrate();
  await current.cacheCatalog(catalog);
  controller.changeAccount(otherOwner);

  await controller.complete(start);
  expect(controller.getSnapshot().success).toBeTruthy();
  expect(controller.getSnapshot().saving).toBe(false);
  current.dispose();
  cloud.reject(new Error('cancelled fixture'));
});
it('allows memory-only continuation with risk when both save paths fail', async () => {
  await downloaded();

  storage.fail = true;
  await controller.complete(start);
  expect(controller.getSnapshot().success).toBeTruthy();
  expect(repository.store.getState().warning).toMatchObject({
    visible: true,
    online: false,
    storageFull: true,
  });
});
it('shows a first-download recovery state and clears it after a successful download', async () => {
  await controller.refresh();
  expect(controller.getSnapshot().error).toMatch(/offline/);
  repository.setEnvironment({ online: true, active: true });
  request.mockRejectedValueOnce(new Error('outage'));
  await controller.refresh();
  expect(controller.getSnapshot().error).toMatch(/couldn’t load/);
  await controller.refresh();
  expect(controller.getSnapshot().queues.streets?.cards).toHaveLength(2);
  expect(controller.getSnapshot().error).toBe('');
});
it('coalesces downloads and leaves a cached deck usable during failed or incomplete refresh', async () => {
  await downloaded();
  repository.setEnvironment({ online: true, active: true });
  const read = deferred<Catalog>();
  request.mockReturnValueOnce(read.promise);
  const first = controller.refresh();
  expect(controller.refresh()).toBe(first);
  controller.skip();
  expect(controller.getSnapshot().queues.streets?.turn).toBe(1);
  read.reject(new Error('outage'));
  await first;
  expect(controller.getSnapshot().error).toBe('');
  request.mockResolvedValueOnce({
    cards: catalog.cards.filter((c) => c.venue === 'cafe'),
  });
  await controller.refresh();
  expect(controller.getSnapshot().queues.gym?.cards).toHaveLength(2);
});
it('rejects an incomplete first catalog and ignores late results after account change', async () => {
  repository.setEnvironment({ online: true, active: true });
  request.mockResolvedValueOnce({ cards: [] });
  await controller.refresh();
  expect(controller.getSnapshot().queues).toEqual({});
  expect(controller.getSnapshot().error).toMatch(/couldn’t load/);
  const read = deferred<Catalog>();
  request.mockReturnValueOnce(read.promise);
  const refresh = controller.refresh();
  await Promise.resolve();
  controller.changeAccount(null);
  read.resolve(catalog);
  await refresh;
  expect(controller.getSnapshot().queues).toEqual({});
  expect(controller.getSnapshot().loading).toBe(false);
});
it('fences a slow save when the account changes and clears account completion context', async () => {
  await downloaded();

  const block = deferred<void>();
  storage.blocked = block;
  const saving = controller.complete(start);
  controller.changeAccount(null);
  block.resolve();
  await saving;
  expect(controller.getSnapshot().success).toBeNull();
  controller.changeAccount(owner);
  expect(controller.getSnapshot()).not.toHaveProperty('active');
  current = null;
  await controller.complete(start);
  await controller.refresh();
});
it('preserves the selected front card while refreshing its shared wording', async () => {
  await downloaded();
  controller.skip();

  await repository.cacheCatalog({
    cards: catalog.cards.map((c) => ({ ...c, text: 'New wording' })),
  });
  expect(controller.getSnapshot().queues.streets?.cards[0]?.id).toBe(
    'streets-1',
  );
  expect(controller.getSnapshot().queues.streets?.cards[0]?.text).toBe(
    'New wording',
  );
});
