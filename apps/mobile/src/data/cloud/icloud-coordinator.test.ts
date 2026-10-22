import { createHash } from 'node:crypto';
import { AccountRepository } from '../activity/repository';
import { journalEntry } from '../activity/private-journal';
import { ICloudDataCoordinator } from './icloud-coordinator';
import { CloudDataCoordinator } from './coordinator';
import type { DataSyncTransport } from './transport';
import {
  completionData,
  iCloudDataIdentity,
  type ICloudData,
} from './icloud-records';
import {
  ICLOUD_PAGE_LIMIT,
  ICLOUD_WRITE_BYTE_LIMIT,
  ICloudError,
  type ICloudSync,
  type ICloudValue,
} from '../../platform/icloud/model';
import {
  MemoryStorage,
  attempt,
  backend,
  card,
  input,
  owner,
  otherOwner,
  today,
  uuid,
  zone,
} from '../../../test-support/journal';
import { memoryLocalJournal } from '../../../test-support/local-journal';

const pin = 'a'.repeat(64);
const fingerprint = (data: ICloudData) =>
  Promise.resolve(
    createHash('sha256').update(iCloudDataIdentity(data)).digest('hex'),
  );
const owned: { repository: AccountRepository; sync: ICloudDataCoordinator }[] =
  [];
function setup(
  remote = cloud(),
  account = owner,
  collection = 'guest' as 'guest' | `account:${string}`,
  storage = new MemoryStorage(),
  serial = 100,
) {
  const repository = new AccountRepository({
    accountId: account,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
    localJournal: memoryLocalJournal(account, storage),
    dataMode: 'local',
  });
  const sync = new ICloudDataCoordinator(
    repository,
    storage,
    remote.transport,
    collection,
    { fingerprint, id: () => uuid(serial++) },
  );
  owned.push({ repository, sync });
  return { repository, sync, remote, storage };
}
function cloud() {
  let accountToken = pin;
  let generation = uuid(900);
  let revision = 1;
  let wasReset = false;
  let closed = false;
  let enabled = true;
  let loseAcknowledgement = false;
  let loseResetAcknowledgement = false;
  let failCleanup = false;
  const generations = new Map<string, Map<string, ICloudValue>>([
    [generation, new Map()],
  ]);
  const records = () => generations.get(generation)!;
  const check = (expected: string) => {
    if (generation !== expected) throw new ICloudError('STALE_GENERATION');
  };
  const transport: ICloudSync = {
    status: jest.fn(async () => ({
      status: 'available' as const,
      enabled,
      accountToken,
    })),
    setEnabled: jest.fn(async (value) => {
      enabled = value;
    }),
    read: jest.fn(async ({ cursor }) => {
      const offset = cursor ? Number(cursor.slice(1)) : 0;
      const values = [...records().values()];
      return {
        generation,
        revision: String(revision),
        wasReset,
        closed,
        records: values.slice(offset, offset + 50),
        cursor: `p${offset + 50}`,
        hasMore: offset + 50 < values.length,
      };
    }),
    write: jest.fn(async ({ generation: expected, records: incoming }) => {
      if (closed) throw new ICloudError('COLLECTION_DELETED');
      check(expected);
      for (const value of incoming) {
        const old = records().get(value.id);
        if (old && old.value !== value.value) throw new ICloudError('CONFLICT');
        records().set(value.id, value);
      }
      revision++;
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new ICloudError('UNAVAILABLE');
      }
      return { generation };
    }),
    reset: jest.fn(async ({ generation: expected, expectedRevision }) => {
      if (closed) throw new ICloudError('COLLECTION_DELETED');
      check(expected);
      if (
        expectedRevision !== undefined &&
        expectedRevision !== String(revision)
      )
        throw new ICloudError('CONFLICT');
      revision++;
      generation = uuid(Number(generation.slice(-12)) + 1);
      wasReset = true;
      generations.set(generation, new Map());
      if (loseResetAcknowledgement) {
        loseResetAcknowledgement = false;
        throw new ICloudError('UNAVAILABLE');
      }
      return { generation };
    }),
    close: jest.fn(async ({ generation: expected }) => {
      if (closed) return { generation };
      check(expected);
      generation = uuid(Number(generation.slice(-12)) + 1);
      wasReset = true;
      closed = true;
      generations.set(generation, new Map());
      return { generation };
    }),
    purge: jest.fn(async ({ generation: expected }) => {
      check(expected);
      if (failCleanup) {
        failCleanup = false;
        throw new ICloudError('QUOTA_EXCEEDED');
      }
      for (const key of generations.keys())
        if (key !== generation) generations.delete(key);
      return { generation, cursor: 'finished', hasMore: false };
    }),
    withMaintenance: async (token, action) => {
      if (token !== accountToken) throw new ICloudError('ACCOUNT_CHANGED');
      const previous = enabled;
      enabled = true;
      try {
        await action(transport);
      } finally {
        enabled = previous;
      }
    },
    subscribe: () => () => {},
    dispose: () => {},
  };
  return {
    transport,
    records,
    generations,
    changeAppleAccount(token: string) {
      accountToken = token;
    },
    loseNextAcknowledgement: () => {
      loseAcknowledgement = true;
    },
    loseNextResetAcknowledgement: () => {
      loseResetAcknowledgement = true;
    },
    failNextCleanup: () => {
      failCleanup = true;
    },
    reset: () => transport.reset({ collection: 'guest', generation }),
  };
}
afterEach(() =>
  owned.splice(0).forEach(({ repository, sync }) => {
    sync.stop();
    repository.dispose();
  }),
);

it('adopts local writing without touching never-used disabled iCloud', async () => {
  const { repository, sync, remote } = setup();
  await remote.transport.setEnabled(false);
  await repository.complete(input(), card);
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  await sync.handoverGuest(otherOwner, imported);
  expect(imported.mock.calls[0]?.[0].attempts).toHaveLength(1);
  expect(remote.transport.read).not.toHaveBeenCalled();
  expect(remote.transport.write).not.toHaveBeenCalled();
  expect(remote.transport.reset).not.toHaveBeenCalled();
});

it('adopts a formerly enabled guest copy while off, including remote writing, before retiring it', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), { text: 'Local source' });
  await sync.synchronize();
  const second = setup(remote, otherOwner, 'guest', new MemoryStorage(), 300);
  await second.sync.synchronize();
  await second.repository.submitReflection(uuid(1), uuid(3), {
    text: 'Other device writing',
  });
  await second.sync.synchronize();
  await remote.transport.setEnabled(false);
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  await sync.handoverGuest(otherOwner, imported);
  expect(imported.mock.calls[0]?.[0].journal.entries[0]?.reflection.text).toBe(
    'Other device writing',
  );
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
  expect(remote.records().size).toBe(0);
  expect(remote.generations.size).toBe(1);
  expect((await remote.transport.status()).enabled).toBe(false);
  // The source is retained locally until the controller verifies its own durable switch.
  expect((await repository.snapshotData()).attempts).toHaveLength(1);
  await sync.handoverGuest(otherOwner, imported);
  expect(imported).toHaveBeenCalledTimes(2);
  await expect(sync.handoverGuest(uuid(77), imported)).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
});

it('does not discard another phone writing between handover copy and conditional reset', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  imported.mockImplementationOnce(async () => {
    const page = await remote.transport.read({ collection: 'guest' });
    await remote.transport.write({
      collection: 'guest',
      generation: page.generation,
      records: [
        {
          id: uuid(700),
          value: JSON.stringify(completionData('guest', attempt(2))),
        },
      ],
    });
  });
  await expect(sync.handoverGuest(otherOwner, imported)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(remote.records().size).toBe(2);
  await sync.handoverGuest(otherOwner, imported);
  expect(imported.mock.calls[1]?.[0].attempts).toHaveLength(2);
  expect(remote.records().size).toBe(0);
});

it('retries an uncertain handover reset without copying or deleting the new guest generation', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  remote.loseNextResetAcknowledgement();
  await expect(sync.handoverGuest(otherOwner, imported)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  const page = await remote.transport.read({ collection: 'guest' });
  await remote.transport.write({
    collection: 'guest',
    generation: page.generation,
    records: [
      {
        id: uuid(700),
        value: JSON.stringify(completionData('guest', attempt(2))),
      },
    ],
  });
  const resumed = setup(remote, owner, 'guest', storage);
  await resumed.sync.handoverGuest(otherOwner, imported);
  expect(imported).toHaveBeenCalledTimes(1);
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
  expect(remote.records().size).toBe(1);
  expect(remote.generations.size).toBe(1);
});

it('resumes handover cleanup without repeating target adoption and retains source on target failure', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  imported.mockRejectedValueOnce(new ICloudError('UNAVAILABLE'));
  await expect(sync.handoverGuest(otherOwner, imported)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(remote.transport.reset).not.toHaveBeenCalled();
  expect((await repository.snapshotData()).attempts).toHaveLength(1);
  remote.failNextCleanup();
  await expect(sync.handoverGuest(otherOwner, imported)).rejects.toMatchObject({
    code: 'QUOTA_EXCEEDED',
  });
  await sync.handoverGuest(otherOwner, imported);
  expect(imported).toHaveBeenCalledTimes(2);
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
});

it('restarts an expired persisted handover purge cursor without repeating adoption or resetting new writing', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  jest
    .mocked(remote.transport.purge)
    .mockResolvedValueOnce({
      generation: uuid(901),
      cursor: 'old-handover-page',
      hasMore: true,
    })
    .mockRejectedValueOnce(new ICloudError('UNAVAILABLE'));
  await expect(sync.handoverGuest(otherOwner, imported)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  const page = await remote.transport.read({ collection: 'guest' });
  await remote.transport.write({
    collection: 'guest',
    generation: page.generation,
    records: [
      {
        id: uuid(700),
        value: JSON.stringify(completionData('guest', attempt(2))),
      },
    ],
  });
  jest
    .mocked(remote.transport.purge)
    .mockRejectedValueOnce(new ICloudError('CURSOR_EXPIRED'));
  const resumed = setup(remote, owner, 'guest', storage);
  await resumed.sync.handoverGuest(otherOwner, imported);
  const requests = jest.mocked(remote.transport.purge).mock.calls;
  expect(requests.slice(-2).map(([request]) => request)).toEqual([
    {
      collection: 'guest',
      generation: page.generation,
      cursor: 'old-handover-page',
    },
    { collection: 'guest', generation: page.generation },
  ]);
  expect(imported).toHaveBeenCalledTimes(1);
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
  expect([...remote.records().keys()]).toEqual([uuid(700)]);
  expect(remote.generations.size).toBe(1);
});

it('deletes previously synced data with the toggle off and keeps deletion retries stable', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  await remote.transport.setEnabled(false);
  await sync.deletePreviouslySyncedData(uuid(750));
  expect((await remote.transport.status()).enabled).toBe(false);
  expect(remote.records().size).toBe(0);
  expect((await repository.snapshotData()).attempts).toHaveLength(0);
  await sync.deletePreviouslySyncedData(uuid(750));
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
});

it('closes previously synced account data with the toggle off and skips never-used cloud', async () => {
  const { repository, sync, remote } = setup(
    cloud(),
    owner,
    `account:${owner}`,
  );
  await repository.observeDataEpoch(0);
  await repository.complete(input(), card);
  await sync.synchronize();
  await remote.transport.setEnabled(false);
  await sync.deletePreviouslySyncedAccount();
  expect(remote.transport.close).toHaveBeenCalledTimes(1);
  expect((await remote.transport.status()).enabled).toBe(false);
  const unused = setup();
  await unused.remote.transport.setEnabled(false);
  await unused.sync.deletePreviouslySyncedData(uuid(752));
  expect(unused.remote.transport.reset).not.toHaveBeenCalled();
});

it('keeps handover source writing fenced from background sync and adopts edits after cleanup failure', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Before sign-in',
  });
  await sync.synchronize();
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  remote.failNextCleanup();
  await expect(sync.handoverGuest(otherOwner, imported)).rejects.toMatchObject({
    code: 'QUOTA_EXCEEDED',
  });
  await repository.submitReflection(uuid(1), uuid(3), {
    text: 'Edited after interrupted sign-in',
  });
  await expect(sync.synchronize()).rejects.toMatchObject({
    code: 'HANDOVER_PENDING',
  });
  await sync.handoverGuest(otherOwner, imported);
  expect(imported).toHaveBeenCalledTimes(2);
  expect(imported.mock.calls[1]?.[0].journal.entries[0]?.reflection.text).toBe(
    'Edited after interrupted sign-in',
  );
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
  expect(remote.records().size).toBe(0);
});

it('keeps unavailable associated Apple copies pending and clears each without enabling sync', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  const key = `justgo:v1:${owner}:icloud-sync:guest`;
  const metadata = JSON.parse(storage.values.get(key)!);
  const otherPin = 'b'.repeat(64);
  metadata.associatedTokens = [pin, otherPin];
  await storage.setItem(key, JSON.stringify(metadata));
  const resumed = setup(remote, owner, 'guest', storage);
  await remote.transport.setEnabled(false);
  await expect(
    resumed.sync.deletePreviouslySyncedData(uuid(751)),
  ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(JSON.parse(storage.values.get(key)!).associatedTokens).toEqual([
    otherPin,
  ]);
  expect((await remote.transport.status()).enabled).toBe(false);
  remote.changeAppleAccount(otherPin);
  await resumed.sync.deletePreviouslySyncedData(uuid(751));
  expect(JSON.parse(storage.values.get(key)!).associatedTokens).toEqual([]);
  expect(remote.transport.reset).toHaveBeenCalledTimes(2);
  expect((await remote.transport.status()).enabled).toBe(false);
});

it('never touches a different Apple account when a disabled old copy needs cleanup', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  await remote.transport.setEnabled(false);
  remote.changeAppleAccount('b'.repeat(64));
  await expect(
    sync.deletePreviouslySyncedData(uuid(754)),
  ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(remote.transport.reset).not.toHaveBeenCalled();
  expect((await repository.snapshotData()).attempts).toHaveLength(1);
});

it('uses isolated handover access when ordinary sync is stopped and preserves target failures', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  sync.stop();
  const failure = { code: 'NETWORK' };
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  imported.mockRejectedValueOnce(failure);
  await expect(sync.handoverGuest(otherOwner, imported)).rejects.toBe(failure);
  expect(remote.transport.reset).not.toHaveBeenCalled();
  await sync.handoverGuest(otherOwner, imported);
  expect(imported).toHaveBeenCalledTimes(2);
  await expect(sync.synchronize()).rejects.toMatchObject({ code: 'DISABLED' });
});

it('round-trips journal-only writing through guest iCloud and adoption without creating reps', async () => {
  const { repository, sync, remote } = setup();
  const orphan = journalEntry(owner, {
    ...attempt(),
    reflection: {
      feeling: null,
      text: 'Retained journal-only writing',
      revision: 1,
    },
  });
  await repository.restoreJournal([orphan], []);
  await sync.synchronize();
  expect(remote.records().size).toBe(1);
  const second = setup(remote, uuid(78), 'guest', new MemoryStorage(), 400);
  await second.sync.synchronize();
  expect((await second.repository.snapshotData()).attempts).toEqual([]);
  expect(
    (await second.repository.snapshotData()).journal.entries[0]?.reflection
      .text,
  ).toBe('Retained journal-only writing');
  const imported = jest.fn<
    Promise<void>,
    [Awaited<ReturnType<AccountRepository['snapshotData']>>]
  >(async () => {});
  await second.sync.handoverGuest(otherOwner, imported);
  expect(imported.mock.calls[0]?.[0].attempts).toEqual([]);
  expect(imported.mock.calls[0]?.[0].journal.entries).toHaveLength(1);
  expect(remote.records().size).toBe(0);
});

it('uploads accepted local data without JustGO login and retries uncertain saves using stable immutable IDs', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Synthetic private writing',
  });
  remote.loseNextAcknowledgement();
  await expect(sync.synchronize()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(remote.records().size).toBe(2);
  expect(
    storage.values.get(`justgo:v1:${owner}:icloud-sync:guest`),
  ).not.toContain('Synthetic private writing');
  await sync.synchronize();
  expect(remote.records().size).toBe(2);
  expect(remote.transport.write).toHaveBeenCalledTimes(1);
  expect(sync.store.getState()).toEqual({ status: 'idle', error: null });
});

it('uses bounded pages and restores guest data into another phone own guest collection', async () => {
  const first = setup();
  await first.repository.mergeCompletions(
    Array.from({ length: 53 }, (_, index) => attempt(index + 1)),
  );
  await first.repository.submitReflection(uuid(1), uuid(90), {
    text: 'Guest private entry',
  });
  await first.sync.synchronize();
  const calls = (first.remote.transport.write as jest.Mock).mock.calls;
  expect(calls.map(([request]) => request.records.length)).toEqual([50, 4]);
  const second = setup(
    first.remote,
    otherOwner,
    'guest',
    new MemoryStorage(),
    300,
  );
  await second.sync.synchronize();
  expect((await second.repository.snapshotData()).attempts).toHaveLength(53);
  expect((await second.repository.listJournalEntries())[0]?.accountId).toBe(
    otherOwner,
  );
  expect(second.repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Guest private entry',
  );
  expect(first.remote.records().size).toBe(54);
});

it('delivers large valid writing in byte-bounded batches with durable IDs after a lost acknowledgement', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.restoreJournal(
    Array.from({ length: 50 }, (_, index) =>
      journalEntry(owner, {
        ...attempt(index + 1),
        instruction: '界'.repeat(10_000),
        reflection: {
          feeling: null,
          text: '界'.repeat(10_000),
          revision: 1,
        },
      }),
    ),
  );
  remote.loseNextAcknowledgement();
  await expect(sync.synchronize()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  const metadata = JSON.parse(
    storage.values.get(`justgo:v1:${owner}:icloud-sync:guest`)!,
  ) as { versions: Record<string, { id: string }> };
  const durableIds = Object.values(metadata.versions).map(({ id }) => id);
  expect(durableIds).toHaveLength(50);
  expect(remote.records().size).toBeLessThan(50);
  await sync.synchronize();
  const calls = jest.mocked(remote.transport.write).mock.calls;
  expect(calls.length).toBeGreaterThan(1);
  for (const [request] of calls) {
    expect(request.records.length).toBeLessThanOrEqual(ICLOUD_PAGE_LIMIT);
    expect(
      Buffer.byteLength(JSON.stringify(request.records), 'utf8'),
    ).toBeLessThanOrEqual(ICLOUD_WRITE_BYTE_LIMIT);
    for (const { id } of request.records) expect(durableIds).toContain(id);
  }
  const deliveredIds = calls.flatMap(([request]) =>
    request.records.map(({ id }) => id),
  );
  expect(new Set(deliveredIds).size).toBe(50);
  expect(deliveredIds).toHaveLength(50);
  expect([...remote.records().keys()].sort()).toEqual(durableIds.sort());
});

it('advances known writing to a remote descendant and preserves concurrent writing as alternatives', async () => {
  const first = setup();
  await first.repository.complete(input(), card);
  await first.repository.submitReflection(uuid(1), uuid(2), {
    text: 'Original writing',
  });
  await first.sync.synchronize();
  const second = setup(
    first.remote,
    otherOwner,
    'guest',
    new MemoryStorage(),
    300,
  );
  await second.sync.synchronize();
  await second.repository.submitReflection(uuid(1), uuid(3), {
    text: 'Second phone edit',
  });
  await second.sync.synchronize();
  await first.sync.synchronize();
  expect(first.repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Second phone edit',
  );
  await first.repository.submitReflection(uuid(1), uuid(4), {
    text: 'First phone concurrent edit',
  });
  await second.repository.submitReflection(uuid(1), uuid(5), {
    text: 'Second phone concurrent edit',
  });
  await second.sync.synchronize();
  await first.sync.synchronize();
  expect(first.repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'First phone concurrent edit',
  );
  expect(
    (await first.repository.listJournalConflicts()).map(
      (entry) => entry.reflection.text,
    ),
  ).toContain('Second phone concurrent edit');
});

it('fences known stale local data after a remote deletion before uploading again', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Before deletion',
  });
  await sync.synchronize();
  await remote.reset();
  await repository.submitReflection(uuid(1), uuid(3), {
    text: 'Offline stale edit',
  });
  await sync.synchronize();
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(await repository.listJournalEntries()).toEqual([]);
  expect(remote.records().size).toBe(0);
  await repository.complete(input(2), card);
  await sync.synchronize();
  expect(remote.records().size).toBe(1);
});

it('retains unknown local writing after a previous iCloud deletion until explicit reset acknowledgement', async () => {
  const remote = cloud();
  await remote.reset();
  const { repository, sync } = setup(remote);
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Preserve pending choice',
  });
  await expect(sync.synchronize()).rejects.toMatchObject({
    code: 'RESET_CONFIRMATION_REQUIRED',
  });
  expect(sync.store.getState().error).toBe('RESET_CONFIRMATION_REQUIRED');
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Preserve pending choice',
  );
  expect(remote.transport.write).not.toHaveBeenCalled();
  await sync.acknowledgeReset();
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(remote.records().size).toBe(0);
});

it('persists reset before erasing and resumes physical cleanup after a failure without resetting twice', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Delete this copy',
  });
  await sync.synchronize();
  remote.failNextCleanup();
  await expect(sync.deleteData()).rejects.toMatchObject({
    code: 'QUOTA_EXCEEDED',
  });
  const key = `justgo:v1:${owner}:icloud-sync:guest`;
  expect(JSON.parse(storage.values.get(key)!)).toMatchObject({
    deleting: true,
    cleanup: true,
    clearing: false,
  });
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(remote.generations.size).toBe(2);
  await sync.synchronize();
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
  expect(remote.generations.size).toBe(1);
  expect(JSON.parse(storage.values.get(key)!)).toMatchObject({
    deleting: false,
    cleanup: false,
  });
});

it.each(['data', 'account'] as const)(
  'restarts an expired persisted %s deletion cursor while retaining the original fence',
  async (kind) => {
    const collection = `account:${owner}` as const;
    const { repository, sync, remote, storage } = setup(
      undefined,
      owner,
      collection,
    );
    await repository.observeDataEpoch(0);
    await repository.complete(input(), card);
    await sync.synchronize();
    jest
      .mocked(remote.transport.purge)
      .mockResolvedValueOnce({
        generation: uuid(901),
        cursor: 'old-deletion-page',
        hasMore: true,
      })
      .mockRejectedValueOnce(new ICloudError('UNAVAILABLE'));
    const remove = (coordinator: ICloudDataCoordinator) =>
      kind === 'data'
        ? coordinator.deleteData(uuid(750))
        : coordinator.deleteAccount();
    await expect(remove(sync)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(
      JSON.parse(
        storage.values.get(`justgo:v1:${owner}:icloud-sync:${collection}`)!,
      ),
    ).toMatchObject({
      generation: uuid(901),
      cleanup: true,
      purgeCursor: 'old-deletion-page',
    });
    jest
      .mocked(remote.transport.purge)
      .mockRejectedValueOnce(new ICloudError('CURSOR_EXPIRED'));
    const resumed = setup(remote, owner, collection, storage);
    await remove(resumed.sync);
    expect(
      jest
        .mocked(remote.transport.purge)
        .mock.calls.slice(-2)
        .map(([request]) => request),
    ).toEqual([
      { collection, generation: uuid(901), cursor: 'old-deletion-page' },
      { collection, generation: uuid(901) },
    ]);
    expect(remote.transport.reset).toHaveBeenCalledTimes(
      kind === 'data' ? 1 : 0,
    );
    expect(remote.transport.close).toHaveBeenCalledTimes(
      kind === 'account' ? 1 : 0,
    );
    expect((await resumed.repository.snapshotData()).attempts).toEqual([]);
    expect(
      JSON.parse(
        storage.values.get(`justgo:v1:${owner}:icloud-sync:${collection}`)!,
      ),
    ).toMatchObject({
      generation: uuid(901),
      cleanup: false,
      purgeCursor: null,
      closed: kind === 'account',
    });
  },
);

it('bounds repeated purge cursor expiry without repeating the deletion reset', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  jest
    .mocked(remote.transport.purge)
    .mockResolvedValueOnce({
      generation: uuid(901),
      cursor: 'first-page',
      hasMore: true,
    })
    .mockRejectedValueOnce(new ICloudError('CURSOR_EXPIRED'))
    .mockResolvedValueOnce({
      generation: uuid(901),
      cursor: 'second-page',
      hasMore: true,
    })
    .mockRejectedValueOnce(new ICloudError('CURSOR_EXPIRED'));
  await expect(sync.deleteData(uuid(751))).rejects.toMatchObject({
    code: 'CURSOR_EXPIRED',
  });
  expect(remote.transport.purge).toHaveBeenCalledTimes(4);
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(storage.values.get(`justgo:v1:${owner}:icloud-sync:guest`)!),
  ).toMatchObject({
    generation: uuid(901),
    deleting: true,
    cleanup: true,
    purgeCursor: 'second-page',
  });
});

it('resumes an interrupted durable local clear before restoring/uploading anything', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  await remote.reset();
  const clear = jest
    .spyOn(repository, 'clearData')
    .mockRejectedValueOnce(new Error('synthetic device failure'));
  await expect(sync.synchronize()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(
    JSON.parse(storage.values.get(`justgo:v1:${owner}:icloud-sync:guest`)!),
  ).toMatchObject({ clearing: true });
  await sync.synchronize();
  expect(clear).toHaveBeenCalledTimes(2);
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(remote.records().size).toBe(0);
});

it('keeps account-owned content in its account collection and rejects wrong-owner input without writing locally', async () => {
  const first = setup(undefined, owner, `account:${owner}`);
  await first.repository.observeDataEpoch(0);
  await first.repository.complete(input(), card);
  await first.repository.submitReflection(uuid(1), uuid(2), {
    text: 'Account entry',
  });
  await first.sync.synchronize();
  expect((await first.repository.listJournalEntries())[0]?.accountId).toBe(
    owner,
  );
  expect(() => setup(first.remote, otherOwner, `account:${owner}`)).toThrow(
    'INVALID_DATA',
  );
  const remoteJournal = [...first.remote.records().values()].find(
    (value) => JSON.parse(value.value).kind === 'journal',
  )!;
  const tampered = JSON.parse(remoteJournal.value);
  tampered.entry.accountId = otherOwner;
  first.remote.records().set(remoteJournal.id, {
    ...remoteJournal,
    value: JSON.stringify(tampered),
  });
  await expect(first.sync.synchronize()).rejects.toMatchObject({
    code: 'INVALID_DATA',
  });
  expect(first.repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Account entry',
  );
});

it('does no upload while toggled off or stopped and fences an old read after account parking', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await remote.transport.setEnabled(false);
  await sync.synchronize();
  expect(remote.transport.write).not.toHaveBeenCalled();
  await expect(sync.deleteData()).rejects.toMatchObject({ code: 'DISABLED' });
  await remote.transport.setEnabled(true);
  let release!: (value: Awaited<ReturnType<ICloudSync['read']>>) => void;
  const reading = jest.spyOn(remote.transport, 'read').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = sync.synchronize();
  while (!reading.mock.calls.length) await Promise.resolve();
  sync.stop();
  release({
    generation: uuid(900),
    revision: null,
    wasReset: false,
    closed: false,
    records: [],
    cursor: 'last',
    hasMore: false,
  });
  await expect(pending).rejects.toMatchObject({ code: 'DISABLED' });
  expect(remote.transport.write).not.toHaveBeenCalled();
  expect((await repository.snapshotData()).attempts).toHaveLength(1);
});

it('replaces an old iCloud copy after authenticated server deletion without importing it or erasing current writing', async () => {
  const { repository, sync, remote } = setup(
    undefined,
    owner,
    `account:${owner}`,
  );
  await repository.observeDataEpoch(0);
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Old deleted account writing',
  });
  await sync.synchronize();
  await repository.clearData();
  await repository.observeDataEpoch(1);
  await repository.complete(input(2), card);
  await repository.submitReflection(uuid(2), uuid(3), {
    text: 'New writing after deletion',
  });
  repository.setDataMode('cloud');
  await sync.synchronize();
  expect(repository.getAttempt(uuid(1))).toBeUndefined();
  expect(repository.getAttempt(uuid(2))?.reflection?.text).toBe(
    'New writing after deletion',
  );
  const current = [...remote.records().values()].map((value) =>
    JSON.parse(value.value),
  );
  expect(current.every((value) => value.accountEpoch === 1)).toBe(true);
  expect(current.some((value) => value.kind === 'epoch')).toBe(true);
  expect(JSON.stringify(current)).not.toContain('Old deleted account writing');
  expect(remote.generations.size).toBe(1);
});

it.each([
  'lost-reset-acknowledgement',
  'concurrent-reset-during-cleanup',
] as const)(
  'preserves current-generation writing when stale-copy replacement retries after %s',
  async (failure) => {
    const { repository, sync, remote, storage } = setup(
      undefined,
      owner,
      `account:${owner}`,
    );
    await repository.observeDataEpoch(1);
    await repository.complete(input(2), card);
    remote.records().set(uuid(501), {
      id: uuid(501),
      value: JSON.stringify(completionData(`account:${owner}`, attempt(1), 0)),
    });
    if (failure === 'lost-reset-acknowledgement')
      remote.loseNextResetAcknowledgement();
    else remote.failNextCleanup();
    await expect(sync.synchronize()).rejects.toMatchObject({
      code:
        failure === 'lost-reset-acknowledgement'
          ? 'UNAVAILABLE'
          : 'QUOTA_EXCEEDED',
    });
    // Recreate the coordinator to prove the original reset source was durable.
    sync.stop();
    let serial = 700;
    const retry = new ICloudDataCoordinator(
      repository,
      storage,
      remote.transport,
      `account:${owner}`,
      {
        fingerprint,
        id: () => uuid(serial++),
      },
    );
    owned.push({ repository, sync: retry });
    if (failure === 'concurrent-reset-during-cleanup') await remote.reset();
    const newer = {
      id: uuid(503),
      value: JSON.stringify(completionData(`account:${owner}`, attempt(3), 1)),
    };
    remote.records().set(newer.id, newer);
    const resets = jest.mocked(remote.transport.reset).mock.calls.length;
    await retry.synchronize();
    expect(remote.transport.reset).toHaveBeenCalledTimes(resets);
    expect(remote.records().get(newer.id)).toEqual(newer);
    expect(repository.getAttempt(uuid(1))).toBeUndefined();
    expect(repository.getAttempt(uuid(2))).toBeDefined();
    expect(repository.getAttempt(uuid(3))).toBeDefined();
    expect(
      [...remote.records().values()]
        .map((record) => JSON.parse(record.value))
        .filter((record) => record.kind === 'completion')
        .map((record) => record.attempt.id)
        .sort(),
    ).toEqual([uuid(2), uuid(3)]);
  },
);

it('persists a higher iCloud account epoch while signed out and prevents an old server copy from restoring deleted data', async () => {
  const first = setup(undefined, owner, `account:${owner}`);
  await first.repository.observeDataEpoch(0);
  await first.repository.complete(input(), card);
  await first.sync.synchronize();
  const second = setup(
    first.remote,
    owner,
    `account:${owner}`,
    new MemoryStorage(),
    300,
  );
  await second.repository.observeDataEpoch(0);
  await second.repository.complete(input(2), card);
  await second.sync.synchronize();
  await first.repository.clearData();
  await first.repository.observeDataEpoch(1);
  await first.sync.deleteData();
  await second.sync.synchronize();
  expect((await second.repository.snapshotData()).attempts).toEqual([]);
  expect(second.repository.store.getState().dataEpoch).toBe(1);
  expect(second.storage.values.get(`justgo:v1:${owner}:data-epoch`)).toBe('1');
  const transport: DataSyncTransport = {
    completions: jest.fn(async () => ({
      dataEpoch: 0,
      attempts: [],
      nextCursor: null,
    })),
    versions: jest.fn(async () => ({
      dataEpoch: 0,
      versions: [],
      nextCursor: null,
    })),
    putCompletions: jest.fn(),
    putVersions: jest.fn(),
    deleteData: jest.fn(),
  };
  second.repository.setDataMode('cloud');
  const accountSync = new CloudDataCoordinator(
    second.repository,
    second.storage,
    transport,
  );
  await expect(accountSync.synchronize()).rejects.toMatchObject({
    code: 'DATA_EPOCH_CHANGED',
  });
  expect(transport.putCompletions).not.toHaveBeenCalled();
  expect(transport.putVersions).not.toHaveBeenCalled();
  expect((await second.repository.snapshotData()).attempts).toEqual([]);
  accountSync.stop();
});

it('fails closed for an unexpected iCloud epoch ahead of authenticated server state', async () => {
  const first = setup(undefined, owner, `account:${owner}`);
  await first.repository.observeDataEpoch(2);
  await first.sync.synchronize();
  const second = setup(
    first.remote,
    owner,
    `account:${owner}`,
    new MemoryStorage(),
    300,
  );
  await second.repository.observeDataEpoch(1);
  await second.repository.complete(input(), card);
  second.repository.setDataMode('cloud');
  await expect(second.sync.synchronize()).rejects.toMatchObject({
    code: 'STALE_GENERATION',
  });
  expect((await second.repository.snapshotData()).attempts).toHaveLength(1);
});

it('retains current writing if a stale-copy reset acknowledgement is lost and cleanup resumes', async () => {
  const { repository, sync, remote } = setup(
    undefined,
    owner,
    `account:${owner}`,
  );
  await repository.observeDataEpoch(0);
  await repository.complete(input(), card);
  await sync.synchronize();
  await repository.clearData();
  await repository.observeDataEpoch(1);
  await repository.complete(input(2), card);
  const original = remote.transport.reset;
  jest
    .spyOn(remote.transport, 'reset')
    .mockImplementationOnce(async (request) => {
      await original(request);
      throw new ICloudError('UNAVAILABLE');
    });
  await expect(sync.synchronize()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(
    (await repository.snapshotData()).attempts.map((value) => value.id),
  ).toEqual([uuid(2)]);
  await sync.synchronize();
  expect(
    (await repository.snapshotData()).attempts.map((value) => value.id),
  ).toEqual([uuid(2)]);
  expect(remote.generations.size).toBe(1);
});

it('does not advance an account deletion floor until the durable local clear succeeds', async () => {
  const first = setup(undefined, owner, `account:${owner}`);
  await first.repository.observeDataEpoch(1);
  await first.sync.synchronize();
  const second = setup(
    first.remote,
    owner,
    `account:${owner}`,
    new MemoryStorage(),
    300,
  );
  await second.repository.observeDataEpoch(0);
  await second.repository.complete(input(), card);
  jest
    .spyOn(second.repository, 'clearData')
    .mockRejectedValueOnce(new Error('synthetic device failure'));
  await expect(second.sync.synchronize()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(second.repository.store.getState().dataEpoch).toBe(0);
  expect((await second.repository.snapshotData()).attempts).toHaveLength(1);
  const metadata = JSON.parse(
    second.storage.values.get(
      `justgo:v1:${owner}:icloud-sync:account:${owner}`,
    )!,
  );
  expect(metadata).toMatchObject({ clearing: true, accountEpochFloor: 1 });
  await second.sync.synchronize();
  expect(second.repository.store.getState().dataEpoch).toBe(1);
  expect((await second.repository.snapshotData()).attempts).toEqual([]);
});

it('permanently closes a deleted account iCloud collection so another signed-out phone cannot resurrect it', async () => {
  const first = setup(undefined, owner, `account:${owner}`);
  await first.repository.observeDataEpoch(0);
  await first.repository.complete(input(), card);
  await first.repository.submitReflection(uuid(1), uuid(2), {
    text: 'Account to close',
  });
  await first.sync.synchronize();
  const second = setup(
    first.remote,
    owner,
    `account:${owner}`,
    new MemoryStorage(),
    300,
  );
  await second.repository.observeDataEpoch(0);
  await second.sync.synchronize();
  await second.repository.submitReflection(uuid(1), uuid(3), {
    text: 'Stale signed-out edit',
  });
  await first.sync.deleteAccount();
  expect(first.remote.records().size).toBe(0);
  expect(first.remote.generations.size).toBe(1);
  await expect(second.sync.synchronize()).rejects.toMatchObject({
    code: 'COLLECTION_DELETED',
  });
  expect((await second.repository.snapshotData()).attempts).toEqual([]);
  const writesAfterClosure = (first.remote.transport.write as jest.Mock).mock
    .calls.length;
  await second.repository.complete(input(2), card);
  await expect(second.sync.synchronize()).rejects.toMatchObject({
    code: 'COLLECTION_DELETED',
  });
  expect((first.remote.transport.write as jest.Mock).mock.calls).toHaveLength(
    writesAfterClosure,
  );
  expect((await second.repository.snapshotData()).attempts).toHaveLength(1);
  await first.sync.deleteAccount();
  expect(first.remote.transport.close).toHaveBeenCalledTimes(1);
});

it('retries an uncertain permanent closure and interrupted physical cleanup without reopening the collection', async () => {
  const { repository, sync, remote } = setup(
    undefined,
    owner,
    `account:${owner}`,
  );
  await repository.observeDataEpoch(0);
  await repository.complete(input(), card);
  await sync.synchronize();
  const close = remote.transport.close;
  jest
    .spyOn(remote.transport, 'close')
    .mockImplementationOnce(async (request) => {
      await close(request);
      throw new ICloudError('UNAVAILABLE');
    });
  await expect(sync.deleteAccount()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  remote.failNextCleanup();
  await expect(sync.deleteAccount()).rejects.toMatchObject({
    code: 'QUOTA_EXCEEDED',
  });
  await sync.deleteAccount();
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(remote.generations.size).toBe(1);
  expect(remote.records().size).toBe(0);
  await expect(
    remote.transport.reset({
      collection: `account:${owner}`,
      generation: uuid(901),
    }),
  ).rejects.toMatchObject({ code: 'COLLECTION_DELETED' });
});

it('returns the receipt for a repeated delete intent without deleting another phone new data', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  const intent = uuid(700);
  await sync.deleteData(intent);
  const page = await remote.transport.read({ collection: 'guest' });
  await remote.transport.write({
    collection: 'guest',
    generation: page.generation,
    records: [
      {
        id: uuid(701),
        value: JSON.stringify(completionData('guest', attempt(2))),
      },
    ],
  });
  await sync.deleteData(intent);
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
  expect(remote.records().size).toBe(1);
  expect(JSON.parse([...remote.records().values()][0]!.value).attempt.id).toBe(
    uuid(2),
  );
});

it('pins the original deletion generation before an uncertain reset so retry preserves post-reset data', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  const intent = uuid(700);
  const reset = jest.mocked(remote.transport.reset).getMockImplementation();
  if (!reset) throw new Error('Missing synthetic CloudKit reset');
  jest
    .spyOn(remote.transport, 'reset')
    .mockImplementationOnce(async (request) => {
      await reset(request);
      throw new ICloudError('UNAVAILABLE');
    });
  await expect(sync.deleteData(intent)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  const page = await remote.transport.read({ collection: 'guest' });
  await remote.transport.write({
    collection: 'guest',
    generation: page.generation,
    records: [
      {
        id: uuid(701),
        value: JSON.stringify(completionData('guest', attempt(2))),
      },
    ],
  });
  await sync.deleteData(intent);
  expect(remote.transport.reset).toHaveBeenCalledTimes(1);
  expect(remote.records().size).toBe(1);
  expect((await repository.snapshotData()).attempts).toEqual([]);
});
