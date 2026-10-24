import type { AccessResponse } from '@justgo/contracts';
import { deferred } from '../../../../test-support/journal';
import {
  createBetaApproval,
  hasBetaApproval,
  type AccessOwner,
} from './policy';
import { AccessStore, sameAccessOwner } from './store';

const now = Date.parse('2026-10-24T12:00:00.000Z');
const origin = 'https://api.beta.example';
const account: AccessOwner = { id: 'synthetic-account', kind: 'account' };
const other: AccessOwner = { id: 'another-account', kind: 'account' };
const guest: AccessOwner = { ...account, kind: 'guest' };
const beta = (offset = 0): AccessResponse => ({
  status: 'verified',
  source: 'free_beta',
  checkedAt: new Date(now + offset).toISOString(),
  expiresAt: new Date(now + 3_600_000).toISOString(),
});
const unpaid: AccessResponse = {
  status: 'unpaid',
  source: 'free_beta',
  checkedAt: new Date(now).toISOString(),
};
const key = (owner: AccessOwner) =>
  `justgo:v1:${owner.id}:access:${owner.kind}:${encodeURIComponent(origin)}`;
function cached(owner = account) {
  return JSON.stringify(createBetaApproval(beta(), origin, owner, now));
}
function memoryStorage(initial: [string, string][] = []) {
  const values = new Map(initial);
  return {
    values,
    getItem: jest.fn(async (name: string) => values.get(name) ?? null),
    setItem: jest.fn(async (name: string, value: string) => {
      values.set(name, value);
    }),
    removeItem: jest.fn(async (name: string) => {
      values.delete(name);
    }),
  };
}
function observe(
  store: AccessStore,
  matches: (state: ReturnType<AccessStore['getSnapshot']>) => boolean,
) {
  if (matches(store.getSnapshot())) return Promise.resolve();
  const changed = deferred<void>();
  const unsubscribe = store.subscribe(() => {
    if (matches(store.getSnapshot())) changed.resolve();
  });
  return changed.promise.finally(unsubscribe);
}
async function hydrated(store: AccessStore, owner = account) {
  await observe(
    store,
    (state) => sameAccessOwner(state.owner, owner) && !state.hydrating,
  );
}
async function select(store: AccessStore, owner = account) {
  store.changeOwner(owner);
  await hydrated(store, owner);
}
function request(store: AccessStore, owner = account) {
  const lease = store.beginRequest(owner);
  if (!lease) throw new Error('Expected a current owner request');
  return lease;
}

it('keeps a first offline launch closed when no server approval was previously saved', async () => {
  const storage = memoryStorage();
  const store = new AccessStore(origin, storage, () => now);
  expect(store.getSnapshot()).toEqual({
    owner: null,
    approval: null,
    hydrating: false,
    online: true,
    active: true,
    authenticated: false,
    storageUnavailable: false,
  });
  store.setEnvironment({ online: false, active: false });
  store.changeOwner(account);
  expect(store.getSnapshot()).toMatchObject({
    hydrating: true,
    approval: null,
  });
  await hydrated(store);
  expect(store.getSnapshot()).toMatchObject({
    owner: account,
    approval: null,
    online: false,
    active: false,
    storageUnavailable: false,
  });
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('restores an approved beta offline after response freshness ends, using the injected current clock', async () => {
  const storage = memoryStorage([[key(account), cached()]]);
  const store = new AccessStore(origin, storage, () => now + 90_000);
  store.setEnvironment({ online: false, active: true });
  await select(store);
  expect(hasBetaApproval(store.getSnapshot().approval, now + 90_000)).toBe(
    true,
  );
  expect(storage.getItem).toHaveBeenCalledWith(key(account));
  expect(storage.setItem).not.toHaveBeenCalled();

  const expired = new AccessStore(origin, storage, () => now + 3_600_000);
  await select(expired);
  expect(expired.getSnapshot().approval).toBeNull();
});

it('uses the default clock to reject an expired persisted approval', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 3_600_000);
  try {
    const store = new AccessStore(
      origin,
      memoryStorage([[key(account), cached()]]),
    );
    await select(store);
    expect(store.getSnapshot().approval).toBeNull();
  } finally {
    clock.mockRestore();
  }
});

it('ignores malformed persisted bytes while keeping a current server response usable', async () => {
  const storage = memoryStorage([[key(account), 'not json']]);
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    storageUnavailable: false,
  });
  await store.receive(request(store), beta(), now);
  expect(hasBetaApproval(store.getSnapshot().approval, now)).toBe(true);
  expect(JSON.parse(storage.values.get(key(account))!)).toEqual(
    store.getSnapshot().approval,
  );
});

it('notifies subscribers only for changed environments and stops notifying after unsubscribe', () => {
  const store = new AccessStore(null, memoryStorage(), () => now);
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);
  const initial = store.getSnapshot();
  store.changeOwner(null);
  store.setEnvironment({ online: true, active: true });
  expect(store.getSnapshot()).toBe(initial);
  expect(listener).not.toHaveBeenCalled();
  store.setEnvironment({ online: false, active: true });
  store.setEnvironment({ online: false, active: false });
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  store.setEnvironment({ online: true, active: true });
  expect(listener).toHaveBeenCalledTimes(2);
});

it('does not hydrate again or discard a valid approval for the same owner', async () => {
  const storage = memoryStorage([[key(account), cached()]]);
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const current = store.getSnapshot();
  store.changeOwner({ ...account });
  expect(store.getSnapshot()).toBe(current);
  expect(storage.getItem).toHaveBeenCalledTimes(1);
});

it('partitions the same identifier by guest/account mode and retires the prior mode approval', async () => {
  const storage = memoryStorage([
    [key(account), cached(account)],
    [key(guest), cached(guest)],
  ]);
  const store = new AccessStore(origin, storage, () => now);
  await select(store, guest);
  const oldRequest = request(store, guest);
  store.changeOwner(account);
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    hydrating: true,
  });
  await store.receive(oldRequest, beta(), now);
  await hydrated(store);
  expect(store.getSnapshot().approval?.owner).toEqual(account);
  expect(storage.values.has(key(guest))).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it.each(['resolve', 'reject'] as const)(
  'ignores a late old-owner hydration that will %s after switching accounts',
  async (outcome) => {
    const storage = memoryStorage([[key(other), cached(other)]]);
    const read = deferred<string | null>();
    const started = deferred<void>();
    storage.getItem.mockImplementationOnce(() => {
      started.resolve();
      return read.promise;
    });
    const store = new AccessStore(origin, storage, () => now);
    store.changeOwner(account);
    await started.promise;
    const oldRequest = request(store);
    store.changeOwner(other);
    const currentOwner = store.getSnapshot();
    await store.receive(oldRequest, beta(), now);
    expect(store.getSnapshot()).toBe(currentOwner);
    if (outcome === 'resolve') read.resolve(cached());
    else read.reject(new Error('Synthetic old storage failure'));
    await hydrated(store, other);
    expect(store.getSnapshot()).toMatchObject({
      owner: other,
      storageUnavailable: false,
      hydrating: false,
    });
    expect(store.getSnapshot().approval?.owner).toEqual(other);
    expect(storage.setItem).not.toHaveBeenCalled();
  },
);

it('keeps a newer server decision authoritative over a still-pending cache read', async () => {
  const storage = memoryStorage();
  const read = deferred<string | null>();
  const started = deferred<void>();
  const removed = deferred<void>();
  storage.getItem.mockImplementationOnce(() => {
    started.resolve();
    return read.promise;
  });
  storage.removeItem.mockImplementationOnce(async (name) => {
    storage.values.delete(name);
    removed.resolve();
  });
  const store = new AccessStore(origin, storage, () => now);
  store.changeOwner(account);
  await started.promise;
  await store.receive(request(store), unpaid, now);
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    hydrating: false,
  });
  read.resolve(cached());
  await removed.promise;
  expect(store.getSnapshot().approval).toBeNull();
  expect(storage.values.has(key(account))).toBe(false);
});

it('admits only the newest request lease and rejects requests for another owner or mode', async () => {
  const storage = memoryStorage();
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const old = request(store);
  const current = request(store);
  expect(store.beginRequest(other)).toBeNull();
  expect(store.beginRequest(guest)).toBeNull();
  await store.receive(current, beta(), now);
  const approved = store.getSnapshot();
  await store.receive(old, unpaid, now);
  expect(store.getSnapshot()).toBe(approved);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(storage.removeItem).not.toHaveBeenCalled();
});

it.each([other, null])(
  'serializes old-owner erasure after its pending write when the owner changes to %j',
  async (nextOwner) => {
    const storage = memoryStorage();
    const write = deferred<void>();
    const started = deferred<void>();
    const removed = deferred<void>();
    storage.setItem.mockImplementationOnce(async (name, value) => {
      started.resolve();
      await write.promise;
      storage.values.set(name, value);
    });
    storage.removeItem.mockImplementationOnce(async (name) => {
      storage.values.delete(name);
      removed.resolve();
    });
    const store = new AccessStore(origin, storage, () => now);
    await select(store);
    const oldRequest = request(store);
    const receiving = store.receive(oldRequest, beta(), now);
    await started.promise;
    store.changeOwner(nextOwner);
    expect(store.getSnapshot()).toMatchObject({
      owner: nextOwner,
      approval: null,
    });
    expect(storage.removeItem).not.toHaveBeenCalled();
    await store.receive(oldRequest, beta(), now);
    write.resolve();
    await receiving;
    await removed.promise;
    if (nextOwner) await hydrated(store, nextOwner);
    expect(storage.values.has(key(account))).toBe(false);
    expect(store.getSnapshot()).toMatchObject({
      owner: nextOwner,
      approval: null,
    });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  },
);

it('clears a persisted pending approval after a newer denial without publishing the old grant', async () => {
  const storage = memoryStorage();
  const write = deferred<void>();
  const started = deferred<void>();
  const removed = deferred<void>();
  storage.setItem.mockImplementationOnce(async (name, value) => {
    started.resolve();
    await write.promise;
    storage.values.set(name, value);
  });
  storage.removeItem.mockImplementationOnce(async (name) => {
    storage.values.delete(name);
    removed.resolve();
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const receiving = store.receive(request(store), beta(), now);
  await started.promise;
  await store.receive(request(store), unpaid, now);
  expect(store.getSnapshot().approval).toBeNull();
  expect(storage.removeItem).not.toHaveBeenCalled();
  write.resolve();
  await receiving;
  await removed.promise;
  expect(store.getSnapshot().approval).toBeNull();
  expect(storage.values.has(key(account))).toBe(false);
});

it('fails closed after a read error, then persists a fresh response without poisoning the storage queue', async () => {
  const storage = memoryStorage();
  storage.getItem.mockRejectedValueOnce(new Error('Synthetic read failure'));
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    hydrating: false,
    storageUnavailable: true,
  });
  await store.receive(request(store), beta(), now);
  expect(store.getSnapshot().approval).not.toBeNull();
  expect(store.getSnapshot().storageUnavailable).toBe(false);
  expect(storage.values.has(key(account))).toBe(true);
});

it('keeps current server approval in memory after a write fails and recovers persistence on a fresh verification', async () => {
  const storage = memoryStorage();
  storage.setItem.mockRejectedValueOnce(new Error('Synthetic write failure'));
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  await store.receive(request(store), beta(), now);
  expect(hasBetaApproval(store.getSnapshot().approval, now)).toBe(true);
  expect(store.getSnapshot().storageUnavailable).toBe(true);
  expect(storage.values.has(key(account))).toBe(false);
  await store.receive(request(store), beta(1), now + 1);
  expect(store.getSnapshot().storageUnavailable).toBe(false);
  expect(storage.values.has(key(account))).toBe(true);
});

it('never resurrects invalidated bytes after erasure fails and the same account is selected again', async () => {
  const storage = memoryStorage([[key(account), cached()]]);
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  storage.removeItem.mockRejectedValueOnce(
    new Error('Synthetic clear failure'),
  );
  const failed = observe(store, (state) => state.storageUnavailable);
  store.changeOwner(null);
  await failed;
  expect(store.getSnapshot()).toMatchObject({ owner: null, approval: null });
  expect(storage.values.has(key(account))).toBe(true);
  store.changeOwner(account);
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    hydrating: false,
  });
  expect(storage.getItem).toHaveBeenCalledTimes(1);
  await store.receive(request(store), beta(), now);
  const restarted = new AccessStore(origin, storage, () => now);
  await select(restarted);
  expect(restarted.getSnapshot().approval).not.toBeNull();
});

it('cannot create or hydrate an approval without a configured API origin', async () => {
  const storage = memoryStorage([[key(account), cached()]]);
  const store = new AccessStore(null, storage, () => now);
  store.changeOwner(account);
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    hydrating: false,
  });
  await store.receive(request(store), beta(), now);
  store.changeOwner(null);
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
  expect(store.getSnapshot().approval).toBeNull();
});

it('admits a fresh beta response while an optional cache write is still blocked', async () => {
  const storage = memoryStorage();
  const block = deferred<void>();
  storage.setItem.mockImplementation(async () => block.promise);
  const store = new AccessStore(origin, storage, () => now);
  store.changeOwner(account);
  await hydrated(store);
  const saving = store.receive(request(store), beta(), now);
  expect(store.getSnapshot().approval?.owner).toEqual(account);
  expect(store.getSnapshot().hydrating).toBe(false);
  block.resolve();
  await saving;
  expect(store.getSnapshot().storageUnavailable).toBe(false);
});
