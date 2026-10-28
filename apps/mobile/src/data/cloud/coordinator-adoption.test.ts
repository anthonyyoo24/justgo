import { createHash } from 'node:crypto';
import {
  completionAttemptSchema,
  type CompletionRestoreRequest,
  type JournalSyncVersion,
} from '@justgo/contracts';
import { AccountRepository } from '../activity/repository';
import { journalEntry } from '../activity/private-journal';
import { journalEntryIdentity } from '../journal/model';
import { CloudDataCoordinator } from './coordinator';
import type { DataSyncTransport } from './transport';
import { ApiError } from '../../lib/network/http';
import {
  MemoryStorage,
  backend,
  today,
  zone,
  owner,
  otherOwner,
  uuid,
  attempt,
  deferred,
} from '../../../test-support/journal';
import { memoryLocalJournal } from '../../../test-support/local-journal';

type Snapshot = Awaited<ReturnType<AccountRepository['snapshotData']>>;
const entry = (id: number, text = `Phone writing ${id}`) =>
  journalEntry(owner, {
    ...attempt(id),
    reflection: { feeling: null, text, revision: 1 },
  });
const source = (ids = [1, 2]): Snapshot => ({
  attempts: ids.map((id) => attempt(id)),
  journal: { entries: ids.map((id) => entry(id)), alternatives: [] },
});
function server(epoch = 0) {
  const attempts = new Map<
    string,
    CompletionRestoreRequest['attempts'][number]
  >();
  const versions = new Map<string, JournalSyncVersion>();
  const tombstones = new Set<string>();
  const check = (expected: number, ids: string[], restoreDeleted?: boolean) => {
    if (expected !== epoch) throw new ApiError('DATA_EPOCH_CHANGED');
    if (!restoreDeleted && ids.some((id) => tombstones.has(id)))
      throw new ApiError('DATA_DELETED');
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
    putCompletions: jest.fn(async (input) => {
      check(
        input.expectedEpoch!,
        input.attempts.map((record) => record.id),
        input.restoreDeleted,
      );
      let added = 0;
      for (const record of input.attempts) {
        if (attempts.has(record.id)) continue;
        attempts.set(record.id, record);
        added++;
      }
      return {
        dataEpoch: epoch,
        attempts: input.attempts,
        added,
        identical: input.attempts.length - added,
      };
    }),
    putVersions: jest.fn(async (input) => {
      check(
        input.expectedEpoch,
        input.versions.map((record) => record.attemptId),
        input.restoreDeleted,
      );
      let saved = 0;
      for (const version of input.versions) {
        if (versions.has(version.versionId)) continue;
        versions.set(version.versionId, version);
        saved++;
      }
      return {
        dataEpoch: epoch,
        versions: input.versions,
        saved,
        identical: input.versions.length - saved,
      };
    }),
    deleteData: jest.fn(async () => {
      throw new Error('Unexpected deletion');
    }),
  };
  return {
    transport,
    attempts,
    versions,
    tombstones,
    advance: () => {
      epoch++;
      attempts.clear();
      versions.clear();
    },
  };
}
const owned: { repository: AccountRepository; sync: CloudDataCoordinator }[] =
  [];
function setup(remote = server(), storage = new MemoryStorage(), serial = 100) {
  const repository = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
    localJournal: memoryLocalJournal(owner, storage),
    dataMode: 'cloud',
  });
  const sync = new CloudDataCoordinator(repository, storage, remote.transport, {
    id: () => uuid(serial++),
    fingerprint: async (value) =>
      createHash('sha256').update(journalEntryIdentity(value)).digest('hex'),
  });
  owned.push({ repository, sync });
  return { repository, sync, remote, storage };
}
afterEach(async () => {
  for (const { repository, sync } of owned.splice(0)) {
    sync.stop();
    await sync.settled();
    repository.dispose();
  }
});

it('adopts only acknowledged records and writing, filtering completion and orphan tombstones without restoring deleted data', async () => {
  const { repository, sync, remote } = setup(server(2));
  remote.tombstones.add(uuid(2));
  remote.tombstones.add(uuid(4));
  const data = source([1, 2, 3]);
  data.journal.entries.push(entry(4), entry(5));
  data.journal.alternatives.push(
    entry(2, 'Deleted alternative'),
    entry(4, 'Deleted orphan alternative'),
    entry(1, 'Preserved alternative'),
  );
  const original = structuredClone(data);
  const accepted = await sync.adoptData(data);
  expect(accepted.attempts.map((record) => record.id)).toEqual([
    uuid(1),
    uuid(3),
  ]);
  expect(accepted.journal.entries.map((record) => record.id)).toEqual([
    uuid(1),
    uuid(3),
    uuid(5),
  ]);
  expect(
    accepted.journal.alternatives.map((record) => record.reflection.text),
  ).toEqual(['Preserved alternative']);
  expect(
    (await repository.snapshotData()).attempts
      .map((record) => record.id)
      .sort(),
  ).toEqual([uuid(1), uuid(3)]);
  expect([...remote.attempts.keys()]).toEqual([uuid(1), uuid(3)]);
  expect(
    [...remote.versions.values()].some((version) =>
      remote.tombstones.has(version.attemptId),
    ),
  ).toBe(false);
  for (const [input] of jest.mocked(remote.transport.putCompletions).mock.calls)
    expect(input.restoreDeleted).toBeUndefined();
  for (const [input] of jest.mocked(remote.transport.putVersions).mock.calls)
    expect(input.restoreDeleted).toBeUndefined();
  expect(data).toEqual(original);
  await sync.adoptData(data);
  expect(remote.attempts.size).toBe(2);
  expect(remote.versions.size).toBe(4);
});

it('preserves concurrent account and phone writing under the same completion instead of duplicating the rep', async () => {
  const { repository, sync, remote } = setup();
  const completion = completionAttemptSchema.strip().parse(attempt(1));
  remote.attempts.set(completion.id, completion);
  remote.versions.set(uuid(99), {
    versionId: uuid(99),
    attemptId: completion.id,
    parents: [],
    feelingScaleVersion: 1,
    reflection: { feeling: null, text: 'Account writing', revision: 1 },
    context: completion,
  });
  await sync.adoptData(source([1]));
  const journal = await repository.snapshotJournal();
  expect(
    new Set(
      [...journal.entries, ...journal.alternatives].map(
        (record) => record.reflection.text,
      ),
    ),
  ).toEqual(new Set(['Account writing', 'Phone writing 1']));
  expect(remote.attempts.size).toBe(1);
  expect(remote.versions.size).toBe(2);
});

it.each([false, true])(
  'persists version IDs before network and replays a lost acknowledgement across relaunch (committed: %s)',
  async (committed) => {
    const first = setup();
    const data = source([1]);
    const write = first.remote.transport.putVersions;
    let originalId: string | undefined;
    jest
      .spyOn(first.remote.transport, 'putVersions')
      .mockImplementationOnce(async (input, signal) => {
        originalId = input.versions[0]!.versionId;
        expect(
          first.storage.values.get(`justgo:v1:${owner}:cloud-sync`),
        ).toContain(originalId);
        expect(
          first.storage.values.get(`justgo:v1:${owner}:cloud-sync`),
        ).not.toContain('Phone writing');
        if (committed) await write(input, signal);
        throw new ApiError('NETWORK');
      });
    await expect(first.sync.adoptData(data)).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect((await first.repository.snapshotData()).attempts).toEqual([]);
    first.sync.stop();
    first.repository.dispose();
    const next = setup(first.remote, first.storage, 900);
    await next.sync.adoptData(data);
    expect([...next.remote.versions.keys()]).toEqual([originalId]);
    expect(next.remote.attempts.size).toBe(1);
    expect((await next.repository.snapshotData()).attempts).toHaveLength(1);
  },
);

it.each(['NETWORK', 'CONFLICT', 'DATA_EPOCH_CHANGED'] as const)(
  'does not split or locally merge a %s completion failure',
  async (code) => {
    const { repository, sync, remote } = setup();
    jest
      .mocked(remote.transport.putCompletions)
      .mockRejectedValueOnce(new ApiError(code));
    await expect(sync.adoptData(source())).rejects.toMatchObject({ code });
    expect(remote.transport.putCompletions).toHaveBeenCalledTimes(1);
    expect(remote.transport.putVersions).not.toHaveBeenCalled();
    expect((await repository.snapshotData()).attempts).toEqual([]);
  },
);

it('rejects an advanced response epoch before private delivery or local adoption', async () => {
  const { repository, sync, remote } = setup();
  jest.mocked(remote.transport.putCompletions).mockResolvedValueOnce({
    dataEpoch: 1,
    attempts: [],
    added: 0,
    identical: 0,
  });
  await expect(sync.adoptData(source())).rejects.toMatchObject({
    code: 'DATA_EPOCH_CHANGED',
  });
  expect(remote.transport.putVersions).not.toHaveBeenCalled();
  expect((await repository.snapshotData()).attempts).toEqual([]);
});

it('fences delayed completion delivery after logout before merging any source locally', async () => {
  const { repository, sync, remote } = setup();
  const pending =
    deferred<Awaited<ReturnType<DataSyncTransport['putCompletions']>>>();
  const requested = deferred<void>();
  jest.mocked(remote.transport.putCompletions).mockImplementationOnce(() => {
    requested.resolve();
    return pending.promise;
  });
  const adopting = sync.adoptData(source());
  await requested.promise;
  sync.stop();
  repository.setDataMode('local');
  pending.resolve({ dataEpoch: 0, attempts: [], added: 0, identical: 0 });
  await expect(adopting).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(remote.transport.putVersions).not.toHaveBeenCalled();
  expect((await repository.snapshotData()).attempts).toEqual([]);
});

it('rejects a different journal owner before any network or local work', async () => {
  const { sync, remote } = setup();
  const data = source();
  data.journal.entries[0]!.accountId = otherOwner;
  await expect(sync.adoptData(data)).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
  expect(remote.transport.completions).not.toHaveBeenCalled();
});

it('keeps request batches bounded and preserves journal-only records without inventing completions', async () => {
  const { repository, sync, remote } = setup();
  const data = source(Array.from({ length: 52 }, (_, index) => index + 1));
  data.journal.entries.push(entry(53));
  await sync.adoptData(data);
  expect(remote.attempts.size).toBe(52);
  expect(remote.versions.size).toBe(53);
  expect((await repository.snapshotData()).attempts).toHaveLength(52);
  expect(
    jest
      .mocked(remote.transport.putCompletions)
      .mock.calls.every(([input]) => input.attempts.length <= 50),
  ).toBe(true);
  expect(
    jest
      .mocked(remote.transport.putVersions)
      .mock.calls.every(([input]) => input.versions.length <= 50),
  ).toBe(true);
});

it('resumes after a rate limit without repeating confirmed records or tombstone probes from the same epoch', async () => {
  const first = setup();
  first.remote.tombstones.add(uuid(3));
  first.remote.tombstones.add(uuid(4));
  const write = jest
    .mocked(first.remote.transport.putCompletions)
    .getMockImplementation()!;
  let requests = 0;
  let limited = true;
  jest
    .spyOn(first.remote.transport, 'putCompletions')
    .mockImplementation(async (input, signal) => {
      if (limited && ++requests > 4) throw new ApiError('RATE_LIMITED');
      return write(input, signal);
    });
  const data = source([1, 2, 3, 4]);
  await expect(first.sync.adoptData(data)).rejects.toMatchObject({
    code: 'RATE_LIMITED',
  });
  expect([...first.remote.attempts.keys()]).toEqual([uuid(1), uuid(2)]);
  expect(
    JSON.parse(first.storage.values.get(`justgo:v1:${owner}:cloud-sync`)!)
      .adoptionDeleted,
  ).toEqual([uuid(3)]);
  first.sync.stop();
  first.repository.dispose();
  limited = false;
  jest.mocked(first.remote.transport.putCompletions).mockClear();
  const next = setup(first.remote, first.storage, 900);
  const accepted = await next.sync.adoptData(data);
  expect(accepted.attempts.map((record) => record.id)).toEqual([
    uuid(1),
    uuid(2),
  ]);
  expect(
    jest
      .mocked(first.remote.transport.putCompletions)
      .mock.calls.map(([input]) => input.attempts.map((record) => record.id)),
  ).toEqual([[uuid(4)]]);
  expect(next.remote.versions.size).toBe(2);
});

it('rechecks saved tombstone receipts after an epoch change without resurrecting deleted writing', async () => {
  const { sync, remote, storage } = setup();
  remote.tombstones.add(uuid(1));
  await sync.adoptData(source([1]));
  expect(
    JSON.parse(storage.values.get(`justgo:v1:${owner}:cloud-sync`)!)
      .adoptionDeleted,
  ).toEqual([uuid(1)]);
  remote.advance();
  jest.mocked(remote.transport.putCompletions).mockClear();
  await sync.adoptData(source([1]));
  expect(
    jest.mocked(remote.transport.putCompletions).mock.calls[0]?.[0],
  ).toMatchObject({ expectedEpoch: 1, attempts: [{ id: uuid(1) }] });
  expect(remote.attempts.size).toBe(0);
  expect(remote.versions.size).toBe(0);
});

it('does not send private versions until their retry IDs have committed to durable storage', async () => {
  const { sync, remote, storage, repository } = setup();
  const save = storage.setItem.bind(storage);
  jest.spyOn(storage, 'setItem').mockImplementation(async (key, value) => {
    if (
      key.endsWith(':cloud-sync') &&
      Object.keys(JSON.parse(value).versions).length
    )
      throw new Error('Synthetic receipt failure');
    await save(key, value);
  });
  await expect(sync.adoptData(source([1]))).rejects.toThrow(
    'Synthetic receipt failure',
  );
  expect(remote.transport.putVersions).not.toHaveBeenCalled();
  expect((await repository.snapshotData()).attempts).toEqual([]);
});
