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
function savedPair(owner = account): [string, string][] {
  const raw = cached(owner);
  return [
    [key(owner), raw],
    [`${key(owner)}:recovery`, raw],
  ];
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
  const storage = memoryStorage(savedPair());
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
    const store = new AccessStore(origin, memoryStorage(savedPair()));
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
  const storage = memoryStorage(savedPair());
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const current = store.getSnapshot();
  store.changeOwner({ ...account });
  expect(store.getSnapshot()).toBe(current);
  expect(
    storage.getItem.mock.calls.filter(([name]) => name === key(account)),
  ).toHaveLength(1);
});

it('partitions the same identifier by guest/account mode and retires the prior mode approval', async () => {
  const storage = memoryStorage([...savedPair(account), ...savedPair(guest)]);
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
  expect(
    storage.setItem.mock.calls.filter(([name]) => name === key(guest)),
  ).toHaveLength(0);
});

it.each(['resolve', 'reject'] as const)(
  'ignores a late old-owner hydration that will %s after switching accounts',
  async (outcome) => {
    const storage = memoryStorage(savedPair(other));
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
    expect(
      storage.setItem.mock.calls.filter(([name]) => name === key(account)),
    ).toHaveLength(0);
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
  expect(
    storage.setItem.mock.calls.filter(([name]) => name === key(account)),
  ).toHaveLength(1);
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
    expect(
      storage.setItem.mock.calls.filter(([name]) => name === key(account)),
    ).toHaveLength(1);
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
  const storage = memoryStorage(savedPair());
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
  expect(
    storage.getItem.mock.calls.filter(([name]) => name === key(account)),
  ).toHaveLength(1);
  await store.receive(request(store), beta(), now);
  const restarted = new AccessStore(origin, storage, () => now);
  await select(restarted);
  expect(restarted.getSnapshot().approval).not.toBeNull();
});

it('cannot create or hydrate an approval without a configured API origin', async () => {
  const storage = memoryStorage(savedPair());
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
  const persist = storage.setItem.getMockImplementation()!;
  storage.setItem.mockImplementation(async (name, value) => {
    if (name === key(account)) await block.promise;
    await persist(name, value);
  });
  const store = new AccessStore(origin, storage, () => now);
  store.changeOwner(account);
  await hydrated(store);
  const saving = store.receive(request(store), beta(), now);
  expect(store.getSnapshot().approval?.owner).toEqual(account);
  expect(store.getSnapshot().hydrating).toBe(false);
  block.resolve();
  await saving;
  expect(store.getSnapshot().storageUnavailable).toBe(false);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe(
    storage.values.get(key(account)),
  );
});

it.each([
  ['missing recovery proof', null],
  ['durable denial', 'denied:v1'],
  ['malformed recovery proof', 'not json'],
  ['unrelated recovery proof', '{}'],
  ['semantically equal but different approval bytes', `${cached()}\n`],
] as const)('fails closed on cold launch with %s', async (_label, proof) => {
  const entries: [string, string][] = [[key(account), cached()]];
  if (proof !== null) entries.push([`${key(account)}:recovery`, proof]);
  const storage = memoryStorage(entries);
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    hydrating: false,
    storageUnavailable: false,
  });
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('does not trust matching recovery bytes when the approval itself is malformed', async () => {
  const storage = memoryStorage([
    [key(account), 'not json'],
    [`${key(account)}:recovery`, 'not json'],
  ]);
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  expect(store.getSnapshot().approval).toBeNull();
});

it('commits a denial that survives restart even when the old approval file cannot be removed', async () => {
  const storage = memoryStorage(savedPair());
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  expect(store.getSnapshot().approval).not.toBeNull();
  storage.removeItem.mockRejectedValueOnce(
    new Error('Synthetic clear failure'),
  );
  await store.receive(request(store), unpaid, now);
  await observe(store, (state) => state.storageUnavailable);
  expect(storage.values.get(key(account))).toBe(cached());
  expect(storage.values.get(`${key(account)}:recovery`)).toBe('denied:v1');

  const restarted = new AccessStore(origin, storage, () => now);
  await select(restarted);
  expect(restarted.getSnapshot().approval).toBeNull();

  await store.receive(request(store), beta(1), now + 1);
  const raw = storage.values.get(key(account));
  expect(raw).toBeDefined();
  expect(storage.values.get(`${key(account)}:recovery`)).toBe(raw);
  const reapproved = new AccessStore(origin, storage, () => now + 1);
  await select(reapproved);
  expect(reapproved.getSnapshot().approval?.access.checkedAt).toBe(
    beta(1).checkedAt,
  );
});

it('makes a denial durable before a blocked old cache write finishes and never lets that write restore recovery authority', async () => {
  const storage = memoryStorage(savedPair());
  const persist = storage.setItem.getMockImplementation()!;
  const write = deferred<void>();
  const started = deferred<void>();
  const removed = deferred<void>();
  storage.setItem.mockImplementation(async (name, value) => {
    if (name === key(account)) {
      started.resolve();
      await write.promise;
    }
    await persist(name, value);
  });
  storage.removeItem.mockImplementationOnce(async (name) => {
    storage.values.delete(name);
    removed.resolve();
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const saving = store.receive(request(store), beta(1), now + 1);
  try {
    await started.promise;
    await store.receive(request(store), unpaid, now + 1);
    expect(store.getSnapshot().approval).toBeNull();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.values.get(`${key(account)}:recovery`)).toBe('denied:v1');
    expect(storage.values.get(key(account))).toBe(cached());
    const restarted = new AccessStore(origin, storage, () => now + 1);
    await select(restarted);
    expect(restarted.getSnapshot().approval).toBeNull();
  } finally {
    write.resolve();
    await saving;
  }
  await removed.promise;
  expect(storage.values.has(key(account))).toBe(false);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe('denied:v1');
  const restarted = new AccessStore(origin, storage, () => now + 1);
  await select(restarted);
  expect(restarted.getSnapshot().approval).toBeNull();
});

it('preserves captured denial ordering when a newer verification starts before the recovery queue catches up', async () => {
  const storage = memoryStorage(savedPair());
  const persist = storage.setItem.getMockImplementation()!;
  const proof = deferred<void>();
  const proofStarted = deferred<void>();
  const freshCacheStarted = deferred<void>();
  const freshRaw = JSON.stringify(
    createBetaApproval(beta(1), origin, account, now + 1),
  );
  let blockFirstProof = true;
  storage.setItem.mockImplementation(async (name, value) => {
    if (name === `${key(account)}:recovery` && blockFirstProof) {
      blockFirstProof = false;
      proofStarted.resolve();
      await proof.promise;
    }
    if (name === key(account) && value === freshRaw)
      freshCacheStarted.resolve();
    await persist(name, value);
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const oldSave = store.receive(request(store), beta(), now);
  await proofStarted.promise;
  const denial = store.receive(request(store), unpaid, now);
  const freshSave = store.receive(request(store), beta(1), now + 1);
  try {
    // The recovery lane cannot hold up the later cache clear and fresh write.
    await freshCacheStarted.promise;
    expect(store.getSnapshot().approval?.receivedAt).toBe(now + 1);
  } finally {
    proof.resolve();
    await Promise.all([oldSave, denial, freshSave]);
  }
  expect(
    storage.setItem.mock.calls
      .filter(([name]) => name === `${key(account)}:recovery`)
      .map(([, value]) => value),
  ).toEqual([cached(), 'denied:v1', freshRaw]);
  expect(storage.values.get(key(account))).toBe(freshRaw);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe(freshRaw);
  const restarted = new AccessStore(origin, storage, () => now + 1);
  await select(restarted);
  expect(restarted.getSnapshot().approval?.receivedAt).toBe(now + 1);
});

it('fails closed after a recovery-proof read error and repairs the pair after fresh online verification', async () => {
  const storage = memoryStorage(savedPair());
  const read = storage.getItem.getMockImplementation()!;
  let fail = true;
  storage.getItem.mockImplementation(async (name) => {
    if (name === `${key(account)}:recovery` && fail) {
      fail = false;
      throw new Error('Synthetic recovery read failure');
    }
    return read(name);
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    storageUnavailable: true,
  });
  await store.receive(request(store), beta(), now);
  expect(store.getSnapshot().storageUnavailable).toBe(false);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe(
    storage.values.get(key(account)),
  );
  const restarted = new AccessStore(origin, storage, () => now);
  await select(restarted);
  expect(restarted.getSnapshot().approval).not.toBeNull();
});

it.each(['cache', 'proof'] as const)(
  'invalidates an older persisted pair after a fresh %s write fails',
  async (failure) => {
    const storage = memoryStorage(savedPair());
    const persist = storage.setItem.getMockImplementation()!;
    let fail = true;
    storage.setItem.mockImplementation(async (name, value) => {
      const target =
        failure === 'cache' ? key(account) : `${key(account)}:recovery`;
      if (name === target && value !== 'denied:v1' && fail) {
        fail = false;
        throw new Error('Synthetic approval persistence failure');
      }
      await persist(name, value);
    });
    const store = new AccessStore(origin, storage, () => now);
    await select(store);
    await store.receive(request(store), beta(1), now + 1);
    expect(store.getSnapshot().approval?.receivedAt).toBe(now + 1);
    expect(store.getSnapshot().storageUnavailable).toBe(true);
    expect(storage.values.get(`${key(account)}:recovery`)).toBe('denied:v1');
    const restarted = new AccessStore(origin, storage, () => now + 1);
    await select(restarted);
    expect(restarted.getSnapshot().approval).toBeNull();
  },
);

it('reports a failed durable denial marker while still completing independent best-effort cache erasure', async () => {
  const storage = memoryStorage(savedPair());
  const persist = storage.setItem.getMockImplementation()!;
  const removed = deferred<void>();
  storage.setItem.mockImplementation(async (name, value) => {
    if (name === `${key(account)}:recovery` && value === 'denied:v1')
      throw new Error('Synthetic denial marker failure');
    await persist(name, value);
  });
  storage.removeItem.mockImplementationOnce(async (name) => {
    storage.values.delete(name);
    removed.resolve();
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  await store.receive(request(store), unpaid, now);
  await removed.promise;
  expect(store.getSnapshot()).toMatchObject({
    approval: null,
    storageUnavailable: true,
  });
  expect(storage.values.has(key(account))).toBe(false);
  const restarted = new AccessStore(origin, storage, () => now);
  await select(restarted);
  expect(restarted.getSnapshot().approval).toBeNull();
});

it('does not apply an account denial marker to another owner or the same identifier in guest mode', async () => {
  const storage = memoryStorage([
    ...savedPair(account),
    ...savedPair(other),
    ...savedPair(guest),
  ]);
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  await store.receive(request(store), unpaid, now);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe('denied:v1');
  for (const owner of [other, guest]) {
    const restarted = new AccessStore(origin, storage, () => now);
    await select(restarted, owner);
    expect(restarted.getSnapshot().approval?.owner).toEqual(owner);
    expect(storage.values.get(`${key(owner)}:recovery`)).toBe(cached(owner));
  }
});

it('invalidates the old durable approval when an accepted shorter renewal fails to save after another poll merely begins', async () => {
  const storage = memoryStorage(savedPair());
  const persist = storage.setItem.getMockImplementation()!;
  const write = deferred<void>();
  const started = deferred<void>();
  const shorter = {
    ...beta(1),
    expiresAt: new Date(now + 60_000).toISOString(),
  };
  storage.setItem.mockImplementationOnce(async (name, value) => {
    started.resolve();
    await write.promise;
    await persist(name, value);
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const saving = store.receive(request(store), shorter, now + 1);
  await started.promise;
  // Starting a poll does not supersede the shorter response already accepted.
  request(store);
  write.reject(new Error('Synthetic shorter-renewal cache failure'));
  await saving;
  expect(store.getSnapshot().approval?.access.expiresAt).toBe(
    shorter.expiresAt,
  );
  expect(store.getSnapshot().storageUnavailable).toBe(true);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe('denied:v1');
  const restarted = new AccessStore(origin, storage, () => now + 1);
  await select(restarted);
  expect(restarted.getSnapshot().approval).toBeNull();
});

it('does not invalidate a newer accepted approval when an older optional save eventually fails', async () => {
  const storage = memoryStorage(savedPair());
  const persist = storage.setItem.getMockImplementation()!;
  const write = deferred<void>();
  const started = deferred<void>();
  const shorter = {
    ...beta(1),
    expiresAt: new Date(now + 60_000).toISOString(),
  };
  const newer = {
    ...beta(2),
    expiresAt: new Date(now + 120_000).toISOString(),
  };
  storage.setItem.mockImplementationOnce(async (name, value) => {
    started.resolve();
    await write.promise;
    await persist(name, value);
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const oldSave = store.receive(request(store), shorter, now + 1);
  await started.promise;
  const newSave = store.receive(request(store), newer, now + 2);
  expect(store.getSnapshot().approval?.access).toEqual(newer);
  write.reject(new Error('Synthetic superseded optional save failure'));
  await Promise.all([oldSave, newSave]);
  const raw = JSON.stringify(
    createBetaApproval(newer, origin, account, now + 2),
  );
  expect(storage.values.get(key(account))).toBe(raw);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe(raw);
  expect(storage.removeItem).not.toHaveBeenCalled();
  expect(store.getSnapshot().storageUnavailable).toBe(false);
  const restarted = new AccessStore(origin, storage, () => now + 2);
  await select(restarted);
  expect(restarted.getSnapshot().approval?.access).toEqual(newer);
});

it('drains a blocked cache write and the recovery proof that it schedules after settled starts', async () => {
  const storage = memoryStorage();
  const persist = storage.setItem.getMockImplementation()!;
  const cache = deferred<void>();
  const cacheStarted = deferred<void>();
  const proof = deferred<void>();
  const proofStarted = deferred<void>();
  storage.setItem.mockImplementation(async (name, value) => {
    if (name === key(account)) {
      cacheStarted.resolve();
      await cache.promise;
    } else if (name === `${key(account)}:recovery`) {
      proofStarted.resolve();
      await proof.promise;
    }
    await persist(name, value);
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const saving = store.receive(request(store), beta(), now);
  await cacheStarted.promise;
  let drained = false;
  const draining = store.settled().then(() => {
    drained = true;
  });
  try {
    expect(storage.values.has(key(account))).toBe(false);
    cache.resolve();
    await proofStarted.promise;
    // A drain that only awaited its original queue snapshot would already finish.
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(storage.values.get(key(account))).toBe(cached());
    expect(storage.values.has(`${key(account)}:recovery`)).toBe(false);
  } finally {
    cache.resolve();
    proof.resolve();
    await Promise.all([saving, draining]);
  }
  expect(drained).toBe(true);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe(cached());
});

it('drains both owner-removal lanes and a queued denial marker behind an older blocked proof', async () => {
  const storage = memoryStorage();
  const persist = storage.setItem.getMockImplementation()!;
  const proof = deferred<void>();
  const proofStarted = deferred<void>();
  const deletion = deferred<void>();
  const deletionStarted = deferred<void>();
  const denial = deferred<void>();
  const denialStarted = deferred<void>();
  storage.setItem.mockImplementation(async (name, value) => {
    if (name === `${key(account)}:recovery`) {
      if (value === 'denied:v1') {
        denialStarted.resolve();
        await denial.promise;
      } else {
        proofStarted.resolve();
        await proof.promise;
      }
    }
    await persist(name, value);
  });
  storage.removeItem.mockImplementation(async (name) => {
    deletionStarted.resolve();
    await deletion.promise;
    storage.values.delete(name);
  });
  const store = new AccessStore(origin, storage, () => now);
  await select(store);
  const saving = store.receive(request(store), beta(), now);
  await proofStarted.promise;
  store.changeOwner(null);
  await deletionStarted.promise;
  let drained = false;
  const draining = store.settled().then(() => {
    drained = true;
  });
  try {
    expect(store.getSnapshot()).toMatchObject({ owner: null, approval: null });
    deletion.resolve();
    proof.resolve();
    await denialStarted.promise;
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(storage.values.has(key(account))).toBe(false);
    expect(storage.values.get(`${key(account)}:recovery`)).toBe(cached());
  } finally {
    deletion.resolve();
    proof.resolve();
    denial.resolve();
    await Promise.all([saving, draining]);
  }
  expect(drained).toBe(true);
  expect(storage.values.has(key(account))).toBe(false);
  expect(storage.values.get(`${key(account)}:recovery`)).toBe('denied:v1');
});
