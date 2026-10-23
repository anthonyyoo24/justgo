import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from 'expo-crypto';
import { z } from 'zod';
import {
  completionAttemptSchema,
  sameHistoricalContext,
  type Attempt,
  type JournalSyncVersion,
  type CompletionRestorePage,
  type JournalSyncPage,
} from '@justgo/contracts';
import { ApiError } from '../../lib/network/http';
import type { AccountRepository } from '../activity/repository';
import type { JournalStorage } from '../activity/model';
import { journalEntryIdentity, type LocalJournalEntry } from '../journal/model';
import type { DataSyncTransport } from './transport';
import { isAncestor, versionEntry, versionHeads } from './versions';
import type { RestorableData } from '../backup/data-backup';
import { journalAttempt } from '../activity/private-journal';

const BATCH = 50;
const LIMIT = 50_000;
const metadataSchema = z
  .object({
    version: z.literal(1),
    epoch: z.number().int().nonnegative().nullable(),
    clearing: z.boolean(),
    deleting: z.boolean(),
    deletionEpoch: z.number().int().nonnegative().nullable().default(null),
    deletionId: z.string().nullable().default(null),
    completedDeletionId: z.string().nullable().default(null),
    adoptionDeleted: z.array(z.uuid()).max(LIMIT).default([]),
    versions: z.record(
      z.string(),
      z.object({ id: z.uuid(), parents: z.array(z.uuid()).max(50) }).strict(),
    ),
    heads: z.record(z.uuid(), z.array(z.uuid()).max(50)),
  })
  .strict();
type Metadata = z.infer<typeof metadataSchema>;
const emptyMetadata = (): Metadata => ({
  version: 1,
  epoch: null,
  clearing: false,
  deleting: false,
  deletionEpoch: null,
  deletionId: null,
  completedDeletionId: null,
  adoptionDeleted: [],
  versions: {},
  heads: {},
});

/** Local commits precede delivery; every upload is fenced by the server deletion epoch. */
export class CloudDataCoordinator {
  private metadata: Metadata | null = null;
  private work: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private enabled = true;
  private again = false;
  private readonly key: string;
  private readonly fingerprint: (entry: LocalJournalEntry) => Promise<string>;
  private readonly id: () => string;
  constructor(
    private readonly repository: AccountRepository,
    private readonly storage: JournalStorage,
    private readonly transport: DataSyncTransport,
    options: {
      fingerprint?: (entry: LocalJournalEntry) => Promise<string>;
      id?: () => string;
    } = {},
  ) {
    this.key = `justgo:v1:${repository.accountId}:cloud-sync`;
    this.fingerprint =
      options.fingerprint ??
      ((entry) =>
        digestStringAsync(
          CryptoDigestAlgorithm.SHA256,
          journalEntryIdentity(entry),
        ));
    this.id = options.id ?? randomUUID;
  }
  stop() {
    this.enabled = false;
    this.again = false;
    this.abort?.abort();
  }
  start() {
    this.enabled = true;
  }
  async settled() {
    await this.work?.catch(() => {});
  }
  private check(signal: AbortSignal) {
    const state = this.repository.store.getState();
    if (
      !this.enabled ||
      signal.aborted ||
      !state.active ||
      !state.online ||
      state.dataMode !== 'cloud'
    )
      throw new ApiError('CANCELLED');
  }
  private async load() {
    if (this.metadata) return metadataSchema.parse(this.metadata);
    const raw = await this.storage.getItem(this.key);
    try {
      this.metadata = raw
        ? metadataSchema.parse(JSON.parse(raw))
        : emptyMetadata();
    } catch {
      throw new ApiError('STORAGE');
    }
    return metadataSchema.parse(this.metadata);
  }
  private async save(metadata: Metadata) {
    await this.storage.setItem(
      this.key,
      JSON.stringify(metadataSchema.parse(metadata)),
    );
    this.metadata = metadataSchema.parse(metadata);
  }
  synchronize = (): Promise<void> => {
    if (this.work) {
      this.again = true;
      return this.work;
    }
    return this.launch((signal) => this.run(signal));
  };
  private launch(
    operation: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    const abort = new AbortController();
    this.abort = abort;
    const work = operation(abort.signal).then(
      () => {
        this.repository.store.setState({ syncStatus: 'idle' });
      },
      (error: unknown) => {
        if (!abort.signal.aborted)
          this.repository.store.setState({ syncStatus: 'error' });
        throw error;
      },
    );
    this.work = work;
    // A stopped pass cannot clear a newer pass's handle.
    void work
      .finally(() => {
        if (this.work !== work) return;
        this.work = null;
        this.abort = null;
        if (this.again && this.enabled) {
          this.again = false;
          void this.synchronize().catch(() => {});
        }
      })
      .catch(() => {});
    return work;
  }
  private version(
    entry: LocalJournalEntry,
    known: Metadata['versions'][string],
  ): JournalSyncVersion {
    const context = completionAttemptSchema
      .strip()
      .parse(journalAttempt(entry));
    return {
      versionId: known.id,
      attemptId: entry.id,
      parents: known.parents,
      feelingScaleVersion: 1,
      reflection: entry.reflection,
      context,
    };
  }
  private async remote(signal: AbortSignal) {
    const attempts: Attempt[] = [];
    const versions: JournalSyncVersion[] = [];
    let epoch: number | undefined;
    for (const kind of ['completions', 'versions'] as const) {
      let cursor: string | null = null;
      const cursors = new Set<string>();
      do {
        this.check(signal);
        const page: CompletionRestorePage | JournalSyncPage =
          kind === 'completions'
            ? await this.transport.completions(cursor, signal)
            : await this.transport.versions(cursor, signal);
        this.check(signal);
        epoch ??= page.dataEpoch;
        if (epoch !== page.dataEpoch) throw new ApiError('DATA_EPOCH_CHANGED');
        if ('attempts' in page)
          attempts.push(
            ...page.attempts.map((attempt) => ({
              ...attempt,
              reflection: null,
            })),
          );
        else versions.push(...page.versions);
        if (attempts.length + versions.length > LIMIT)
          throw new ApiError('INVALID_RESPONSE');
        cursor = page.nextCursor;
        if (cursor) {
          if (cursors.has(cursor)) throw new ApiError('INVALID_RESPONSE');
          cursors.add(cursor);
        }
      } while (cursor);
    }
    if (epoch === undefined) throw new ApiError('INVALID_RESPONSE');
    return { attempts, versions, epoch };
  }
  private async run(signal: AbortSignal) {
    await this.repository.hydrate();
    this.check(signal);
    this.repository.store.setState({ syncStatus: 'syncing' });
    let metadata = await this.load();
    if (metadata.deleting) {
      const page = await this.transport.completions(null, signal);
      this.check(signal);
      if (metadata.deletionEpoch === null) {
        metadata.deletionEpoch = page.dataEpoch;
        await this.save(metadata);
      }
      if (page.dataEpoch < metadata.deletionEpoch)
        throw new ApiError('DATA_EPOCH_CHANGED');
      // A lost acknowledgement must never turn a retry into another deletion.
      const epoch =
        page.dataEpoch > metadata.deletionEpoch
          ? page.dataEpoch
          : (await this.transport.deleteData(metadata.deletionEpoch, signal))
              .dataEpoch;
      this.check(signal);
      const cleared = {
        ...emptyMetadata(),
        epoch,
        completedDeletionId: metadata.deletionId,
      };
      await this.save({ ...metadata, epoch, clearing: true });
      await this.repository.observeDataEpoch(epoch);
      await this.repository.clearData();
      await this.save(cleared);
      return;
    }
    const remote = await this.remote(signal);
    const floor = this.repository.store.getState().dataEpoch;
    if (floor !== undefined && floor !== null && floor > remote.epoch)
      throw new ApiError('DATA_EPOCH_CHANGED');
    // A never-synchronized old collection also cannot resurrect a deleted account's activity.
    if (
      metadata.clearing ||
      (metadata.epoch !== remote.epoch &&
        (metadata.epoch !== null ||
          (remote.epoch > 0 && floor !== remote.epoch)))
    ) {
      metadata = { ...emptyMetadata(), epoch: remote.epoch, clearing: true };
      await this.save(metadata);
      await this.repository.observeDataEpoch(remote.epoch);
      await this.repository.clearData();
      metadata.clearing = false;
      await this.save(metadata);
    }
    await this.repository.observeDataEpoch(remote.epoch);
    metadata.epoch = remote.epoch;
    this.check(signal);
    await this.repository.mergeCompletions(remote.attempts);
    const localBefore = await this.repository.snapshotJournal();
    const attempts = new Map(
      (await this.repository.snapshotData()).attempts.map((attempt) => [
        attempt.id,
        attempt,
      ]),
    );
    const remoteById = new Map(
      remote.versions.map((version) => [version.versionId, version]),
    );
    const remoteHeads = versionHeads(remote.versions);
    const remoteEntries = new Map<string, LocalJournalEntry>();
    for (const version of remote.versions) {
      const entry = versionEntry(this.repository.accountId, version, attempts);
      remoteEntries.set(version.versionId, entry);
      const fingerprint = await this.fingerprint(entry);
      // Prefer the actual server identity after a lost acknowledgement or import.
      metadata.versions[fingerprint] = {
        id: version.versionId,
        parents: version.parents,
      };
    }
    const replacements: LocalJournalEntry[] = [];
    for (const entry of localBefore.entries) {
      const known = metadata.versions[await this.fingerprint(entry)];
      const heads = remoteHeads.get(entry.id);
      if (
        known &&
        heads?.length === 1 &&
        isAncestor(known.id, heads[0]!, remoteById)
      )
        replacements.push(entry);
    }
    const preferred = [...remoteHeads.values()].map((heads) =>
      remoteEntries.get(heads[0]!.versionId)!,
    );
    await this.repository.mergeSyncedJournal(
      preferred,
      [...remoteEntries.values()],
      replacements,
    );
    this.check(signal);
    const snapshot = await this.repository.snapshotData();
    const remoteAttemptIds = new Set(
      remote.attempts.map((attempt) => attempt.id),
    );
    const missing = snapshot.attempts.filter(
      (attempt) => !remoteAttemptIds.has(attempt.id),
    );
    for (let index = 0; index < missing.length; index += BATCH) {
      this.check(signal);
      const response = await this.transport.putCompletions(
        {
          expectedEpoch: remote.epoch,
          attempts: missing
            .slice(index, index + BATCH)
            .map((attempt) => completionAttemptSchema.strip().parse(attempt)),
        },
        signal,
      );
      if (response.dataEpoch !== remote.epoch)
        throw new ApiError('DATA_EPOCH_CHANGED');
    }
    const upload: JournalSyncVersion[] = [];
    const scheduled = new Set<string>();
    for (const entry of [
      ...snapshot.journal.entries,
      ...snapshot.journal.alternatives,
    ]) {
      const fingerprint = await this.fingerprint(entry);
      let known = metadata.versions[fingerprint];
      if (!known) {
        known = {
          id: this.id(),
          parents: (metadata.heads[entry.id] ?? []).filter((id) =>
            remoteById.has(id),
          ),
        };
        metadata.versions[fingerprint] = known;
      }
      if (remoteById.has(known.id) || scheduled.has(known.id)) continue;
      scheduled.add(known.id);
      upload.push(this.version(entry, known));
    }
    // Stable version IDs reach durable storage before an uncertain network outcome.
    await this.save(metadata);
    for (let index = 0; index < upload.length; index += BATCH) {
      this.check(signal);
      const response = await this.transport.putVersions(
        {
          expectedEpoch: remote.epoch,
          versions: upload.slice(index, index + BATCH),
        },
        signal,
      );
      if (response.dataEpoch !== remote.epoch)
        throw new ApiError('DATA_EPOCH_CHANGED');
    }
    this.check(signal);
    const heads = versionHeads([...remote.versions, ...upload]);
    metadata.heads = Object.fromEntries(
      [...heads].map(([id, values]) => [
        id,
        values.map((value) => value.versionId),
      ]),
    );
    await this.save(metadata);
  }
  async deleteData(intentId = this.id()): Promise<void> {
    this.stop();
    await this.work?.catch(() => {});
    this.start();
    const metadata = await this.load();
    if (metadata.completedDeletionId === intentId && !metadata.clearing) return;
    await this.save({
      ...metadata,
      deleting: true,
      deletionId: metadata.deletionId ?? intentId,
    });
    await this.synchronize();
  }
  /** First sign-in adopts phone writing without overriding earlier account deletions. */
  async adoptData(
    data: Awaited<ReturnType<AccountRepository['snapshotData']>>,
  ) {
    if (
      [...data.journal.entries, ...data.journal.alternatives].some(
        (entry) => entry.accountId !== this.repository.accountId,
      )
    )
      throw new ApiError('ACCOUNT_CHANGED');
    await this.synchronize();
    this.stop();
    await this.settled();
    this.start();
    const accepted: Awaited<ReturnType<AccountRepository['snapshotData']>> = {
      attempts: [],
      journal: { entries: [], alternatives: [] },
    };
    await this.launch(async (signal) => {
      const metadata = await this.load();
      if (metadata.epoch === null || metadata.deleting || metadata.clearing)
        throw new ApiError('UNAVAILABLE');
      const epoch = metadata.epoch;
      const confirmed = await this.remote(signal);
      if (confirmed.epoch !== epoch) throw new ApiError('DATA_EPOCH_CHANGED');
      const existingAttempts = new Map(
        confirmed.attempts.map((record) => [record.id, record]),
      );
      const existingVersions = new Set(
        confirmed.versions.map((record) => record.versionId),
      );
      const liveIds = new Set([
        ...existingAttempts.keys(),
        ...confirmed.versions.map((record) => record.attemptId),
      ]);
      const deleted = new Set(
        metadata.adoptionDeleted.filter((id) => !liveIds.has(id)),
      );
      const acceptedAttempts = new Set<string>();
      // A DATA_DELETED response is transactional but intentionally contains no
      // private record IDs. Split only that failure to isolate rejected IDs;
      // network, ownership and epoch errors must remain retryable failures.
      const deliver = async <T>(
        batch: T[],
        recordId: (record: T) => string,
        write: (records: T[]) => Promise<{ dataEpoch: number }>,
      ): Promise<T[]> => {
        this.check(signal);
        batch = batch.filter((record) => !deleted.has(recordId(record)));
        if (!batch.length) return [];
        try {
          const result = await write(batch);
          this.check(signal);
          if (result.dataEpoch !== epoch)
            throw new ApiError('DATA_EPOCH_CHANGED');
          return batch;
        } catch (error) {
          this.check(signal);
          if (!(error instanceof ApiError) || error.code !== 'DATA_DELETED')
            throw error;
          const single = batch[0];
          if (batch.length === 1 && single !== undefined) {
            deleted.add(recordId(single));
            // Persist progress at this epoch so a rate-limited or interrupted
            // retry does not repeatedly spend requests on the same old IDs.
            metadata.adoptionDeleted = [...deleted];
            await this.save(metadata);
            return [];
          }
          const middle = Math.floor(batch.length / 2);
          const left = await deliver(batch.slice(0, middle), recordId, write);
          const right = await deliver(batch.slice(middle), recordId, write);
          return [...left, ...right];
        }
      };
      for (let index = 0; index < data.attempts.length; index += BATCH) {
        const batch = data.attempts.slice(index, index + BATCH);
        for (const record of batch) {
          const existing = existingAttempts.get(record.id);
          if (!existing) continue;
          if (
            !sameHistoricalContext(record, existing) ||
            record.instruction !== existing.instruction
          )
            throw new ApiError('CONFLICT');
          acceptedAttempts.add(record.id);
        }
        const delivered = await deliver(
          batch.filter((record) => !existingAttempts.has(record.id)),
          (record) => record.id,
          (records) =>
            this.transport.putCompletions(
              {
                expectedEpoch: epoch,
                attempts: records.map((record) =>
                  completionAttemptSchema.strip().parse(record),
                ),
              },
              signal,
            ),
        );
        for (const record of delivered) acceptedAttempts.add(record.id);
      }
      const versions = new Map<string, JournalSyncVersion>();
      const identities = new Map<LocalJournalEntry, string>();
      for (const entry of [
        ...data.journal.entries,
        ...data.journal.alternatives,
      ]) {
        this.check(signal);
        if (deleted.has(entry.id)) continue;
        const fingerprint = await this.fingerprint(entry);
        const known = metadata.versions[fingerprint] ?? {
          id: this.id(),
          parents: [],
        };
        metadata.versions[fingerprint] = known;
        identities.set(entry, known.id);
        versions.set(known.id, this.version(entry, known));
      }
      // Retried adoption reuses each version even after an uncertain response.
      this.check(signal);
      await this.save(metadata);
      const upload = [...versions.values()].filter(
        (version) => !existingVersions.has(version.versionId),
      );
      const acceptedVersions = new Set(existingVersions);
      for (let index = 0; index < upload.length; index += BATCH) {
        const delivered = await deliver(
          upload.slice(index, index + BATCH),
          (record) => record.attemptId,
          (records) =>
            this.transport.putVersions(
              { expectedEpoch: epoch, versions: records },
              signal,
            ),
        );
        for (const version of delivered)
          acceptedVersions.add(version.versionId);
      }
      const retained = (entry: LocalJournalEntry) => {
        const id = identities.get(entry);
        return (
          !deleted.has(entry.id) && id !== undefined && acceptedVersions.has(id)
        );
      };
      accepted.attempts = data.attempts.filter(
        (record) => acceptedAttempts.has(record.id) && !deleted.has(record.id),
      );
      accepted.journal.entries = data.journal.entries.filter(retained);
      accepted.journal.alternatives =
        data.journal.alternatives.filter(retained);
      this.check(signal);
      await this.repository.mergeCompletions(accepted.attempts);
      this.check(signal);
      await this.repository.restoreJournal(
        accepted.journal.entries,
        accepted.journal.alternatives,
      );
      this.check(signal);
    });
    await this.synchronize();
    return accepted;
  }
  async importData(data: RestorableData) {
    await this.synchronize();
    this.stop();
    await this.settled();
    this.start();
    await this.launch(async (signal) => {
      const metadata = await this.load();
      if (metadata.epoch === null) throw new ApiError('UNAVAILABLE');
      for (let index = 0; index < data.attempts.length; index += BATCH) {
        this.check(signal);
        const result = await this.transport.putCompletions(
          {
            expectedEpoch: metadata.epoch,
            restoreDeleted: true,
            attempts: data.attempts
              .slice(index, index + BATCH)
              .map((attempt) => completionAttemptSchema.strip().parse(attempt)),
          },
          signal,
        );
        if (result.dataEpoch !== metadata.epoch)
          throw new ApiError('DATA_EPOCH_CHANGED');
      }
      // An explicit import may restore journal-only IDs without inventing completed reps.
      // Persist identities first so retrying an uncertain import cannot multiply versions.
      const versions = new Map<string, JournalSyncVersion>();
      for (const entry of [
        ...data.journal.entries,
        ...data.journal.alternatives,
      ]) {
        const fingerprint = await this.fingerprint(entry);
        const known = metadata.versions[fingerprint] ?? {
          id: this.id(),
          parents: [],
        };
        metadata.versions[fingerprint] = known;
        versions.set(known.id, this.version(entry, known));
      }
      this.check(signal);
      await this.save(metadata);
      const upload = [...versions.values()];
      for (let index = 0; index < upload.length; index += BATCH) {
        this.check(signal);
        const result = await this.transport.putVersions(
          {
            expectedEpoch: metadata.epoch,
            restoreDeleted: true,
            versions: upload.slice(index, index + BATCH),
          },
          signal,
        );
        if (result.dataEpoch !== metadata.epoch)
          throw new ApiError('DATA_EPOCH_CHANGED');
      }
      this.check(signal);
      await this.repository.mergeCompletions(data.attempts);
      await this.repository.restoreJournal(
        data.journal.entries,
        data.journal.alternatives,
      );
      this.check(signal);
    });
    await this.synchronize();
  }
}
