import type { CompletionAttempt, JournalSyncVersion } from '@justgo/contracts';
import { ActivityRuntime } from './activity-runtime';
import {
  AccountClient,
  type AccountSession,
} from '../../lib/network/account-client';
import { ApiError, createHttpClient } from '../../lib/network/http';
import {
  createDataSyncTransport,
  type DataSyncTransport,
} from '../../data/cloud/transport';
import { iCloudSync } from '../../platform/icloud/icloud-sync';
import {
  ICloudError,
  type ICloudCollection,
  type ICloudSync,
  type ICloudValue,
} from '../../platform/icloud/model';
import { clearExportFiles } from '../../platform/export/export-file';
import { clearBackupFiles } from '../../platform/backup/backup-file';
import type { RestorableData } from '../../data/backup/data-backup';
import {
  MemoryStorage,
  card,
  input,
  owner,
  otherOwner,
  uuid,
  zone,
  deferred,
} from '../../../test-support/journal';

jest.mock('expo-crypto', () => {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: (_algorithm: string, value: string) =>
      Promise.resolve(crypto.createHash('sha256').update(value).digest('hex')),
    randomUUID: crypto.randomUUID,
  };
});
jest.mock('../../data/cloud/transport', () => ({
  createDataSyncTransport: jest.fn(),
}));
jest.mock('../../platform/icloud/icloud-sync', () => ({
  iCloudSync: {
    status: jest.fn(),
    setEnabled: jest.fn(),
    read: jest.fn(),
    write: jest.fn(),
    reset: jest.fn(),
    close: jest.fn(),
    purge: jest.fn(),
    subscribe: jest.fn(),
    dispose: jest.fn(),
  },
}));
jest.mock('../../platform/export/export-file', () => ({
  clearExportFiles: jest.fn(),
}));
jest.mock('../../platform/backup/backup-file', () => ({
  clearBackupFiles: jest.fn(),
}));

function server() {
  let epoch = 0;
  const attempts = new Map<string, CompletionAttempt>();
  const versions = new Map<string, JournalSyncVersion>();
  const check = (expected: number) => {
    if (expected !== epoch) throw new ApiError('DATA_EPOCH_CHANGED');
  };
  const transport: DataSyncTransport = {
    completions: jest.fn(async () => ({
      dataEpoch: epoch,
      attempts: [...attempts.values()],
      nextCursor: null,
    })),
    versions: jest.fn(async () => ({
      dataEpoch: epoch,
      versions: [...versions.values()],
      nextCursor: null,
    })),
    putCompletions: jest.fn(async (request) => {
      check(request.expectedEpoch);
      let added = 0;
      for (const attempt of request.attempts)
        if (!attempts.has(attempt.id)) {
          attempts.set(attempt.id, attempt);
          added++;
        }
      return {
        dataEpoch: epoch,
        attempts: request.attempts,
        added,
        identical: request.attempts.length - added,
      };
    }),
    putVersions: jest.fn(async (request) => {
      check(request.expectedEpoch);
      let saved = 0;
      for (const version of request.versions)
        if (!versions.has(version.versionId)) {
          versions.set(version.versionId, version);
          saved++;
        }
      return {
        dataEpoch: epoch,
        versions: request.versions,
        saved,
        identical: request.versions.length - saved,
      };
    }),
    deleteData: jest.fn(async (expected) => {
      check(expected);
      epoch++;
      attempts.clear();
      versions.clear();
      return { dataEpoch: epoch, deletedAt: '2026-10-20T12:00:00.000Z' };
    }),
  };
  return { transport, attempts, versions };
}

function apple() {
  type Zone = {
    generation: string;
    revision: number;
    wasReset: boolean;
    closed: boolean;
    records: Map<string, ICloudValue>;
  };
  const zones = new Map<string, Zone>();
  let serial = 800;
  let enabled = true;
  let onWrite: ((records: readonly ICloudValue[]) => void) | null = null;
  const zone = (collection: ICloudCollection) => {
    let current = zones.get(collection);
    if (!current) {
      current = {
        generation: uuid(serial++),
        revision: 0,
        wasReset: false,
        closed: false,
        records: new Map(),
      };
      zones.set(collection, current);
    }
    return current;
  };
  const transport: ICloudSync = {
    status: jest.fn(async () => ({
      status: 'available' as const,
      accountToken: 'a'.repeat(64),
      enabled,
    })),
    setEnabled: jest.fn(async (value: boolean) => {
      enabled = value;
    }),
    read: jest.fn(async ({ collection }) => {
      const current = zone(collection);
      return {
        generation: current.generation,
        revision: String(current.revision),
        wasReset: current.wasReset,
        closed: current.closed,
        records: [...current.records.values()],
        cursor: 'finished',
        hasMore: false,
      };
    }),
    write: jest.fn(async ({ collection, generation, records }) => {
      const current = zone(collection);
      if (current.closed) throw new ICloudError('COLLECTION_DELETED');
      if (generation !== current.generation)
        throw new ICloudError('STALE_GENERATION');
      for (const record of records) current.records.set(record.id, record);
      current.revision++;
      onWrite?.(records);
      return { generation };
    }),
    reset: jest.fn(async ({ collection, generation, expectedRevision }) => {
      const current = zone(collection);
      if (current.closed) throw new ICloudError('COLLECTION_DELETED');
      if (generation !== current.generation)
        throw new ICloudError('STALE_GENERATION');
      if (
        expectedRevision !== undefined &&
        expectedRevision !== String(current.revision)
      )
        throw new ICloudError('CONFLICT');
      current.generation = uuid(serial++);
      current.wasReset = true;
      current.records.clear();
      current.revision++;
      return { generation: current.generation };
    }),
    close: jest.fn(async ({ collection, generation }) => {
      const current = zone(collection);
      if (!current.closed) {
        if (generation !== current.generation)
          throw new ICloudError('STALE_GENERATION');
        current.generation = uuid(serial++);
        current.wasReset = true;
        current.closed = true;
        current.records.clear();
      }
      return { generation: current.generation };
    }),
    purge: jest.fn(async ({ collection }) => ({
      generation: zone(collection).generation,
      cursor: 'purged',
      hasMore: false,
    })),
    subscribe: () => () => {},
    dispose: () => {},
    withMaintenance: async (token, action) => {
      const status = await transport.status();
      if (status.accountToken !== token)
        throw new ICloudError('ACCOUNT_CHANGED');
      await action({
        ...transport,
        status: async () => ({ ...status, enabled: true }),
      });
    },
  };
  return {
    transport,
    zone,
    watchWrites: (listener: typeof onWrite) => {
      onWrite = listener;
    },
  };
}

const servers = new Map<string, ReturnType<typeof server>>();
const runtimes: { runtime: ActivityRuntime; client: AccountClient }[] = [];
let cloud: ReturnType<typeof apple>;
function setup(storage = new MemoryStorage()) {
  let session: AccountSession | null = null;
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => {
      throw new Error(
        'Unexpected HTTP request in isolated managed runtime test',
      );
    },
  );
  const client = new AccountClient(
    createHttpClient('http://127.0.0.1:1', fetcher),
    {
      current: () => session,
      renew: () => Promise.reject(new ApiError('UNAUTHORIZED')),
      reject: () => {},
    },
  );
  const runtime = new ActivityRuntime(client, storage, {
    managed: true,
    timeZone: () => zone,
  });
  runtime.setEnvironment({ active: true, online: false });
  runtimes.push({ runtime, client });
  const activate = async (
    id: string,
    mode: 'local' | 'cloud',
    kind: 'guest' | 'account',
  ) => {
    session =
      mode === 'cloud'
        ? { userId: id, token: 'synthetic-managed-session' }
        : null;
    client.changeAccount(session?.userId ?? null);
    client.changeCollection(id);
    runtime.changeAccount(id, mode, kind);
    const repository = runtime.getRepository();
    if (!repository) throw new Error('Missing isolated repository');
    await repository.hydrate();
    return repository;
  };
  return { runtime, client, storage, fetcher, activate };
}
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-20T14:00:00.000Z'));
  servers.clear();
  cloud = apple();
  Object.assign(iCloudSync, cloud.transport);
  jest
    .mocked(createDataSyncTransport)
    .mockReset()
    .mockImplementation((_client, id) => {
      let current = servers.get(id);
      if (!current) {
        current = server();
        servers.set(id, current);
      }
      return current.transport;
    });
  jest.mocked(clearExportFiles).mockReset().mockResolvedValue(undefined);
  jest.mocked(clearBackupFiles).mockReset();
});
afterEach(async () => {
  runtimes.splice(0).forEach(({ runtime, client }) => {
    runtime.dispose();
    client.changeAccount(null);
  });
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('runs optional iCloud delivery from guest local saves without a JustGO session or account upload', async () => {
  const { runtime, activate, fetcher } = setup();
  const repository = await activate(owner, 'local', 'guest');
  runtime.setEnvironment({ active: true, online: true });
  await repository.synchronize();
  const completed = deferred<void>();
  cloud.watchWrites((records) => {
    if (
      records.some((record) => JSON.parse(record.value).kind === 'completion')
    )
      completed.resolve();
  });
  await repository.complete(input(), card);
  await completed.promise;
  await repository.synchronize();
  const reflected = deferred<void>();
  cloud.watchWrites((records) => {
    if (records.some((record) => JSON.parse(record.value).kind === 'journal'))
      reflected.resolve();
  });
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Synthetic guest writing',
  });
  await reflected.promise;
  await repository.synchronize();
  expect(cloud.zone('guest').records.size).toBe(2);
  expect(servers.get(owner)?.transport.completions).not.toHaveBeenCalled();
  expect(servers.get(owner)?.transport.putCompletions).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects signed-out account imports while retaining the account-owned local collection', async () => {
  const { runtime, activate } = setup();
  const repository = await activate(owner, 'local', 'account');
  await repository.complete(input(), card);
  const snapshot = await repository.snapshotData();
  const backup: RestorableData = {
    owner: { id: owner, kind: 'account' },
    exportedAt: '2026-10-20T14:00:00.000Z',
    ...snapshot,
    preferences: null,
    legacyJournalOnly: false,
  };
  await expect(runtime.importData(backup)).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  expect((await repository.snapshotData()).attempts).toHaveLength(1);
  expect(cloud.transport.write).not.toHaveBeenCalled();
});

it('adopts phone writing once, retires its source and syncs later signed-out edits to the same account', async () => {
  const { runtime, activate, storage } = setup();
  const guest = await activate(otherOwner, 'local', 'guest');
  await guest.complete(input(), card);
  await guest.submitReflection(uuid(1), uuid(2), {
    text: 'Phone writing before sign-in',
  });
  await runtime.mergeGuestData(otherOwner, owner, {
    userId: owner,
    token: 'fixture-session',
  });
  // No late source write can slip between copying and the durable identity switch.
  await expect(guest.complete(input(2), card)).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
  const target = await activate(owner, 'cloud', 'account');
  await runtime.retireGuestData(otherOwner);
  expect((await target.snapshotData()).attempts).toHaveLength(1);
  expect((await target.snapshotJournal()).entries[0]?.reflection.text).toBe(
    'Phone writing before sign-in',
  );
  expect(
    [...storage.values.keys()].some((key) =>
      key.startsWith(`justgo:v1:${otherOwner}:`),
    ),
  ).toBe(false);
  expect(cloud.zone('guest').records.size).toBe(0);
  const server = servers.get(owner)!;
  const before = server.versions.size;
  const signedOut = await activate(owner, 'local', 'account');
  await signedOut.submitReflection(uuid(1), uuid(3), {
    text: 'Edited while signed out',
  });
  expect(server.versions.size).toBe(before);
  await activate(owner, 'cloud', 'account');
  runtime.setEnvironment({ active: true, online: true });
  await target.synchronize();
  expect(server.attempts.size).toBe(1);
  expect(
    [...server.versions.values()].some(
      (version) => version.reflection.text === 'Edited while signed out',
    ),
  ).toBe(true);
});

it('keeps source writing through adoption failure and fences concurrent new submissions until retry', async () => {
  const { runtime, activate } = setup();
  const guest = await activate(otherOwner, 'local', 'guest');
  await guest.complete(input(), card);
  const gate = deferred<void>();
  const entered = deferred<void>();
  const destination = server();
  servers.set(owner, destination);
  jest
    .spyOn(destination.transport, 'completions')
    .mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      throw new ApiError('NETWORK');
    });
  const adopting = runtime.mergeGuestData(otherOwner, owner, {
    userId: owner,
    token: 'fixture-session',
  });
  const result = expect(adopting).rejects.toMatchObject({ code: 'NETWORK' });
  await entered.promise;
  await expect(guest.complete(input(2), card)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  gate.resolve();
  await result;
  expect((await guest.snapshotData()).attempts).toHaveLength(1);
  await guest.submitReflection(uuid(1), uuid(2), {
    text: 'Saved after interrupted sign-in',
  });
  await runtime.mergeGuestData(otherOwner, owner, {
    userId: owner,
    token: 'fixture-session',
  });
  const target = await activate(owner, 'cloud', 'account');
  expect((await target.snapshotJournal()).entries[0]?.reflection.text).toBe(
    'Saved after interrupted sign-in',
  );
});

it('keeps fresh account writing after adoption advances a previously cached deletion epoch', async () => {
  const { runtime, activate } = setup();
  await cloud.transport.setEnabled(false);
  const guest = await activate(otherOwner, 'local', 'guest');
  await guest.complete(input(), card);
  const target = await activate(owner, 'cloud', 'account');
  runtime.setEnvironment({ active: true, online: true });
  await target.synchronize();
  runtime.setEnvironment({ active: true, online: false });
  const destination = servers.get(owner)!;
  await destination.transport.deleteData(0, new AbortController().signal);

  await activate(otherOwner, 'local', 'guest');
  await runtime.mergeGuestData(otherOwner, owner, {
    userId: owner,
    token: 'fixture-session',
  });
  await activate(owner, 'cloud', 'account');
  await runtime.retireGuestData(otherOwner);
  await target.complete(input(3), card);
  await target.submitReflection(uuid(3), uuid(4), {
    text: 'New writing after the account handover',
  });

  runtime.setEnvironment({ active: true, online: true });
  await target.synchronize();
  expect(
    (await target.snapshotData()).attempts.map(({ id }) => id).sort(),
  ).toEqual([uuid(1), uuid(3)].sort());
  expect(destination.attempts.has(uuid(3))).toBe(true);
  expect(
    [...destination.versions.values()].some(
      (version) =>
        version.reflection.text === 'New writing after the account handover',
    ),
  ).toBe(true);
});

it('finishes an already accepted target clear before copying guest writing into that account', async () => {
  const { runtime, activate, storage } = setup();
  await cloud.transport.setEnabled(false);
  const guest = await activate(otherOwner, 'local', 'guest');
  await guest.complete(input(), card);
  await guest.submitReflection(uuid(1), uuid(2), {
    text: 'Guest writing retained after a pending account clear',
  });
  const target = await activate(owner, 'cloud', 'account');
  runtime.setEnvironment({ active: true, online: true });
  await target.synchronize();
  await jest.advanceTimersByTimeAsync(0);
  const destination = servers.get(owner)!;
  await destination.transport.deleteData(0, new AbortController().signal);

  const clearing = deferred<void>();
  const releaseClear = deferred<void>();
  const write = storage.setItem.bind(storage);
  let blockNextClear = true;
  jest.spyOn(storage, 'setItem').mockImplementation(async (key, value) => {
    if (
      blockNextClear &&
      key === `justgo:v1:${owner}:cloud-sync` &&
      (JSON.parse(value) as { clearing?: boolean }).clearing
    ) {
      blockNextClear = false;
      clearing.resolve();
      await releaseClear.promise;
    }
    await write(key, value);
  });
  const previousSync = target.synchronize().catch((error: unknown) => error);
  await clearing.promise;
  let copied = false;
  const adoption = runtime
    .mergeGuestData(otherOwner, owner, {
      userId: owner,
      token: 'fixture-session',
    })
    .then(() => {
      copied = true;
    });
  let copiedWhileClearing: boolean;
  let uploadsWhileClearing: number;
  try {
    await jest.advanceTimersByTimeAsync(0);
    copiedWhileClearing = copied;
    uploadsWhileClearing = jest.mocked(destination.transport.putCompletions)
      .mock.calls.length;
  } finally {
    releaseClear.resolve();
  }
  const previousResult = await previousSync;
  await adoption;
  expect(previousResult).toMatchObject({ code: 'CANCELLED' });
  expect(copiedWhileClearing).toBe(false);
  expect(uploadsWhileClearing).toBe(0);
  await activate(owner, 'cloud', 'account');
  await runtime.retireGuestData(otherOwner);
  expect((await target.snapshotData()).attempts.map(({ id }) => id)).toEqual([
    uuid(1),
  ]);
  expect((await target.snapshotJournal()).entries[0]?.reflection.text).toBe(
    'Guest writing retained after a pending account clear',
  );
  expect(destination.attempts.has(uuid(1))).toBe(true);
});

it('adopts parked guest writing into another account without moving the previously selected account data', async () => {
  const { runtime, activate } = setup();
  await cloud.transport.setEnabled(false);
  const guest = await activate(otherOwner, 'local', 'guest');
  await guest.complete(input(), card);
  await guest.submitReflection(uuid(1), uuid(2), {
    text: 'Guest writing for the chosen account',
  });
  const previousAccount = await activate(owner, 'local', 'account');
  await previousAccount.complete(input(3), card);
  await previousAccount.submitReflection(uuid(3), uuid(4), {
    text: 'Private writing from the previous account',
  });
  const nextOwner = uuid(900);
  await runtime.mergeGuestData(otherOwner, nextOwner, {
    userId: nextOwner,
    token: 'fixture-session',
  });
  const nextAccount = await activate(nextOwner, 'cloud', 'account');
  await runtime.retireGuestData(otherOwner);
  expect(
    (await nextAccount.snapshotData()).attempts.map(({ id }) => id),
  ).toEqual([uuid(1)]);
  expect(
    (await nextAccount.snapshotJournal()).entries[0]?.reflection.text,
  ).toBe('Guest writing for the chosen account');
  expect([...servers.get(nextOwner)!.attempts.keys()]).toEqual([uuid(1)]);

  await activate(owner, 'local', 'account');
  expect(
    (await previousAccount.snapshotData()).attempts.map(({ id }) => id),
  ).toEqual([uuid(3)]);
  expect(
    (await previousAccount.snapshotJournal()).entries[0]?.reflection.text,
  ).toBe('Private writing from the previous account');
  expect(servers.get(owner)?.transport.putCompletions).not.toHaveBeenCalled();
});

it('deletes an earlier iCloud copy while sync is off and does not restore it when re-enabled', async () => {
  const { runtime, activate } = setup();
  const repository = await activate(owner, 'cloud', 'account');
  await repository.complete(input(), card);
  runtime.setEnvironment({ active: true, online: true });
  await repository.synchronize();
  expect(cloud.zone(`account:${owner}`).records.size).toBeGreaterThan(0);
  await cloud.transport.setEnabled(false);
  await runtime.deleteAllData();
  expect((await cloud.transport.status()).enabled).toBe(false);
  expect(
    [...cloud.zone(`account:${owner}`).records.values()].map(
      (record) => JSON.parse(record.value).kind,
    ),
  ).toEqual(['epoch']);
  await cloud.transport.setEnabled(true, async () => {});
  await repository.synchronize();
  expect((await repository.snapshotData()).attempts).toEqual([]);
});

it('keeps delete-all intent durable through failure, blocks stale delivery and retries only its own account', async () => {
  const { runtime, activate, storage } = setup();
  const repository = await activate(owner, 'cloud', 'account');
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Delete target fixture',
  });
  runtime.setEnvironment({ active: true, online: true });
  await repository.synchronize();
  const target = servers.get(owner)!;
  jest
    .spyOn(target.transport, 'deleteData')
    .mockRejectedValueOnce(new ApiError('UNAVAILABLE'));
  await expect(runtime.deleteAllData()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  const key = `justgo:v1:${owner}:delete-all-pending`;
  expect(storage.values.get(key)).toMatch(
    /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/,
  );
  expect(repository.store.getState().dataDeletionPending).toBe(true);
  await expect(repository.complete(input(2), card)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  const before = (target.transport.putCompletions as jest.Mock).mock.calls
    .length;
  await repository.synchronize();
  expect(
    (target.transport.putCompletions as jest.Mock).mock.calls,
  ).toHaveLength(before);
  const other = await activate(otherOwner, 'cloud', 'account');
  await other.complete(input(3), card);
  await other.synchronize();
  expect(servers.get(otherOwner)?.attempts.size).toBe(1);
  await activate(owner, 'cloud', 'account');
  await runtime.deleteAllData();
  expect(storage.values.has(key)).toBe(false);
  expect(repository.store.getState().dataDeletionPending).toBe(false);
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(target.attempts.size).toBe(0);
  expect(servers.get(otherOwner)?.attempts.size).toBe(1);
  expect(cloud.zone(`account:${otherOwner}`).records.size).toBeGreaterThan(0);
});

it('rehydrates a failed deletion intent and blocks new local writing before retry', async () => {
  const storage = new MemoryStorage();
  storage.values.set(`justgo:v1:${owner}:delete-all-pending`, 'true');
  const { activate } = setup(storage);
  const repository = await activate(owner, 'local', 'account');
  expect(repository.store.getState().dataDeletionPending).toBe(true);
  await expect(repository.complete(input(), card)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(cloud.transport.write).not.toHaveBeenCalled();
});

it('finishes permanent iCloud closure with account=null and retries temporary cleanup without reusing the erased repository', async () => {
  const { runtime, activate, storage } = setup();
  const repository = await activate(owner, 'cloud', 'account');
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Account closure fixture',
  });
  runtime.setEnvironment({ active: true, online: true });
  await repository.synchronize();
  await activate(owner, 'local', 'account');
  await jest.advanceTimersByTimeAsync(0);
  storage.values.set(
    `justgo:v1:${otherOwner}:preserve`,
    'other account fixture',
  );
  jest
    .mocked(clearExportFiles)
    .mockRejectedValueOnce(new Error('Synthetic temporary cleanup failure'));
  await expect(runtime.deleteAccount(owner)).rejects.toThrow(
    'Synthetic temporary cleanup failure',
  );
  expect(runtime.getRepository()).toBeNull();
  expect(cloud.zone(`account:${owner}`).closed).toBe(true);
  expect(cloud.zone(`account:${owner}`).records.size).toBe(0);
  expect(cloud.transport.close).toHaveBeenCalledTimes(1);
  await expect(runtime.deleteAccount(owner)).resolves.toBeUndefined();
  expect(cloud.transport.close).toHaveBeenCalledTimes(1);
  expect(storage.values.get(`justgo:v1:${otherOwner}:preserve`)).toBe(
    'other account fixture',
  );
  expect(
    [...storage.values.keys()].some((key) =>
      key.startsWith(`justgo:v1:${owner}:`),
    ),
  ).toBe(false);
});
