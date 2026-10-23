import {
  completionAttemptSchema,
  type CompletionRestoreRequest,
  type JournalSyncVersion,
} from '@justgo/contracts';
import { AccountRepository } from '../activity/repository';
import { CloudDataCoordinator } from './coordinator';
import type { DataSyncTransport } from './transport';
import { ApiError } from '../../lib/network/http';
import {
  MemoryStorage,
  backend,
  card,
  input,
  owner,
  today,
  zone,
  uuid,
  attempt,
  deferred,
} from '../../../test-support/journal';
import { memoryLocalJournal } from '../../../test-support/local-journal';
import { journalEntry } from '../activity/private-journal';
import type { RestorableData } from '../backup/data-backup';
import { journalEntryIdentity } from '../journal/model';

const owned: { repository: AccountRepository; sync: CloudDataCoordinator }[] =
  [];
function setup(storage = new MemoryStorage(), remote = server()) {
  const repository = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
    localJournal: memoryLocalJournal(owner, storage),
    dataMode: 'cloud',
  });
  let serial = 100;
  const fingerprints = new Map<string, string>();
  const sync = new CloudDataCoordinator(repository, storage, remote.transport, {
    id: () => uuid(serial++),
    fingerprint: (entry) => {
      const key = journalEntryIdentity(entry);
      if (!fingerprints.has(key))
        fingerprints.set(key, String(fingerprints.size + 1).padStart(64, '0'));
      return Promise.resolve(fingerprints.get(key)!);
    },
  });
  owned.push({ repository, sync });
  return { repository, sync, remote, storage };
}
function server() {
  let epoch = 0;
  const attempts: CompletionRestoreRequest['attempts'] = [];
  const versions: JournalSyncVersion[] = [];
  let loseAcknowledgement = false;
  const uploads: JournalSyncVersion[] = [];
  const check = (expected: number) => {
    if (expected !== epoch) throw new ApiError('DATA_EPOCH_CHANGED');
  };
  const transport: DataSyncTransport = {
    completions: async () => ({
      dataEpoch: epoch,
      attempts: [...attempts],
      nextCursor: null,
    }),
    versions: async () => ({
      dataEpoch: epoch,
      versions: [...versions],
      nextCursor: null,
    }),
    putCompletions: async (input) => {
      check(input.expectedEpoch);
      let added = 0;
      for (const attempt of input.attempts)
        if (!attempts.some((old) => old.id === attempt.id)) {
          attempts.push(attempt);
          added++;
        }
      return {
        dataEpoch: epoch,
        attempts: input.attempts,
        added,
        identical: input.attempts.length - added,
      };
    },
    putVersions: async (input) => {
      check(input.expectedEpoch);
      uploads.push(...input.versions);
      let saved = 0;
      for (const version of input.versions)
        if (!versions.some((old) => old.versionId === version.versionId)) {
          versions.push(version);
          saved++;
        }
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new ApiError('NETWORK');
      }
      return {
        dataEpoch: epoch,
        versions: input.versions,
        saved,
        identical: input.versions.length - saved,
      };
    },
    deleteData: async (expected) => {
      check(expected);
      epoch++;
      attempts.splice(0);
      versions.splice(0);
      return { dataEpoch: epoch, deletedAt: '2026-10-20T10:00:00.000Z' };
    },
  };
  return {
    transport,
    attempts,
    versions,
    uploads,
    loseNextAcknowledgement: () => {
      loseAcknowledgement = true;
    },
    reset: () => {
      epoch++;
      attempts.splice(0);
      versions.splice(0);
    },
  };
}
afterEach(() => {
  owned.splice(0).forEach(({ repository, sync }) => {
    sync.stop();
    repository.dispose();
  });
});

it('uploads durable completion and private content separately and recovers a lost version acknowledgement without duplication', async () => {
  const { repository, sync, remote, storage } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Private synthetic entry',
  });
  remote.loseNextAcknowledgement();
  await expect(sync.synchronize()).rejects.toMatchObject({ code: 'NETWORK' });
  expect(remote.attempts).toHaveLength(1);
  expect(remote.attempts[0]).not.toHaveProperty('reflection');
  expect(remote.versions).toHaveLength(1);
  expect(storage.values.get(`justgo:v1:${owner}:cloud-sync`)).not.toContain(
    'Private synthetic entry',
  );
  await sync.synchronize();
  expect(remote.versions).toHaveLength(1);
  expect(remote.uploads).toHaveLength(1);
});

it('replaces a known ancestor but preserves both concurrent edits', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), { text: 'Original' });
  await sync.synchronize();
  const original = remote.versions[0]!;
  remote.versions.push({
    ...original,
    versionId: uuid(200),
    parents: [original.versionId],
    reflection: { ...original.reflection, text: 'Other phone', revision: 2 },
  });
  await sync.synchronize();
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe('Other phone');
  await repository.submitReflection(uuid(1), uuid(3), { text: 'This phone' });
  remote.versions.push({
    ...original,
    versionId: uuid(201),
    parents: [uuid(200)],
    reflection: {
      ...original.reflection,
      text: 'Concurrent phone',
      revision: 3,
    },
  });
  await sync.synchronize();
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe('This phone');
  expect(
    (await repository.listJournalConflicts()).some(
      (entry) => entry.reflection.text === 'Concurrent phone',
    ),
  ).toBe(true);
  expect(
    remote.versions.some((version) => version.reflection.text === 'This phone'),
  ).toBe(true);
});

it('observes deletion before any stale local upload and keeps future saves usable', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await repository.submitReflection(uuid(1), uuid(2), {
    text: 'Before deletion',
  });
  await sync.synchronize();
  remote.reset();
  await repository.submitReflection(uuid(1), uuid(3), {
    text: 'Offline stale edit',
  });
  await sync.synchronize();
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(remote.attempts).toEqual([]);
  expect(remote.versions).toEqual([]);
  await repository.complete(input(2), card);
  await sync.synchronize();
  expect(remote.attempts).toHaveLength(1);
});

it('stops delivery after logout and performs complete explicit data deletion', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  sync.stop();
  repository.setDataMode('local');
  await expect(sync.synchronize()).rejects.toMatchObject({ code: 'CANCELLED' });
  expect((await repository.snapshotData()).attempts).toHaveLength(1);
  repository.setDataMode('cloud');
  sync.start();
  await sync.deleteData();
  expect(remote.attempts).toEqual([]);
  expect((await repository.snapshotData()).attempts).toEqual([]);
});

const imported = (): RestorableData => ({
  owner: { id: owner, kind: 'account' },
  exportedAt: '2026-10-20T10:00:00.000Z',
  attempts: [],
  journal: {
    entries: [
      journalEntry(owner, {
        ...attempt(),
        reflection: { feeling: null, text: 'Old journal only', revision: 1 },
      }),
    ],
    alternatives: [],
  },
  preferences: null,
  legacyJournalOnly: true,
});

it('restores orphan journal versions explicitly and retries a lost acknowledgement without manufacturing a rep', async () => {
  const { repository, sync, remote } = setup();
  remote.reset();
  const write = jest.spyOn(remote.transport, 'putVersions');
  remote.loseNextAcknowledgement();
  await expect(sync.importData(imported())).rejects.toMatchObject({
    code: 'NETWORK',
  });
  expect(write.mock.calls[0]?.[0]).toMatchObject({
    restoreDeleted: true,
    expectedEpoch: 1,
    versions: [{ context: { id: uuid(1), instruction: card.text } }],
  });
  await sync.importData(imported());
  expect(remote.versions).toHaveLength(1);
  expect(remote.attempts).toEqual([]);
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Old journal only',
  );
  await repository.submitReflection(uuid(1), uuid(400), { text: 'New edit' });
  await sync.synchronize();
  expect(write.mock.calls.at(-1)?.[0].restoreDeleted).toBeUndefined();
});

it('downloads journal-only history using frozen context without needing a current catalog or completion row', async () => {
  const { repository, sync, remote } = setup();
  const context = completionAttemptSchema.strip().parse(attempt());
  remote.versions.push({
    versionId: uuid(900),
    attemptId: uuid(1),
    parents: [],
    feelingScaleVersion: 1,
    reflection: { text: 'Historical', feeling: null, revision: 1 },
    context,
  });
  await sync.synchronize();
  expect((await repository.snapshotData()).attempts).toEqual([]);
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe('Historical');
});

it('deletes using the epoch without enumerating every old journal page', async () => {
  const { sync, remote } = setup();
  const read = jest
    .spyOn(remote.transport, 'completions')
    .mockResolvedValue({ dataEpoch: 0, attempts: [], nextCursor: uuid(1) });
  const journal = jest.spyOn(remote.transport, 'versions');
  await sync.deleteData();
  expect(read).toHaveBeenCalledTimes(1);
  expect(journal).not.toHaveBeenCalled();
});

it('reuses a deletion intent after lost acknowledgement and later cleanup retries without deleting new remote work', async () => {
  const { repository, sync, remote } = setup();
  await repository.complete(input(), card);
  await sync.synchronize();
  const remove = remote.transport.deleteData;
  const calls = jest
    .spyOn(remote.transport, 'deleteData')
    .mockImplementationOnce(async (epoch, signal) => {
      await remove(epoch, signal);
      throw new ApiError('NETWORK');
    });
  const intent = uuid(999);
  await expect(sync.deleteData(intent)).rejects.toMatchObject({
    code: 'NETWORK',
  });
  const newWork = completionAttemptSchema.strip().parse(attempt(2));
  remote.attempts.push(newWork);
  await sync.deleteData(intent);
  expect(calls).toHaveBeenCalledTimes(1);
  expect(remote.attempts).toEqual([newWork]);
  await sync.deleteData(intent);
  expect(calls).toHaveBeenCalledTimes(1);
  expect(remote.attempts).toEqual([newWork]);
});

it('rejects older server epochs before importing or uploading after a newer iCloud reset', async () => {
  const { repository, sync, remote } = setup();
  await repository.hydrate();
  await repository.observeDataEpoch(2);
  const upload = jest.spyOn(remote.transport, 'putCompletions');
  await expect(sync.synchronize()).rejects.toMatchObject({
    code: 'DATA_EPOCH_CHANGED',
  });
  expect(upload).not.toHaveBeenCalled();
});

it('fences an in-flight import after logout before local writes and later journal batches', async () => {
  const { repository, sync, remote } = setup();
  const upload =
    deferred<Awaited<ReturnType<DataSyncTransport['putCompletions']>>>();
  const started = deferred<void>();
  jest
    .spyOn(remote.transport, 'putCompletions')
    .mockImplementation(async () => {
      started.resolve();
      return upload.promise;
    });
  const versions = jest.spyOn(remote.transport, 'putVersions');
  const work = sync.importData({ ...imported(), attempts: [attempt()] });
  await started.promise;
  sync.stop();
  repository.setDataMode('local');
  const completion = completionAttemptSchema.strip().parse(attempt());
  upload.resolve({
    dataEpoch: 0,
    attempts: [completion],
    added: 1,
    identical: 0,
  });
  await expect(work).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(versions).not.toHaveBeenCalled();
  expect((await repository.snapshotData()).attempts).toEqual([]);
});
