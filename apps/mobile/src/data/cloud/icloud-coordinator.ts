import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from 'expo-crypto';
import { createStore } from 'zustand/vanilla';
import { z } from 'zod';
import type { AccountRepository } from '../activity/repository';
import type { JournalStorage } from '../activity/model';
import type { LocalJournalEntry } from '../journal/model';
import {
  ICLOUD_PAGE_LIMIT,
  ICloudError,
  iCloudError,
  type ICloudCollection,
  type ICloudErrorCode,
  type ICloudPurgePage,
  type ICloudSync,
  type ICloudValue,
} from '../../platform/icloud/model';
import {
  completionData,
  epochData,
  journalData,
  iCloudDataIdentity,
  parseICloudData,
  sameCompletionContext,
  cloudVersion,
  type ICloudData,
} from './icloud-records';
import { isAncestor, versionHeads } from './versions';
import { handoverGuestCopy } from './icloud-handover';
import { iCloudWriteBatches } from './icloud-batches';

const LIMIT = 50_000;
const metadataSchema = z
  .object({
    version: z.literal(1),
    accountToken: z
      .string()
      .regex(/^[a-f\d]{64}$/)
      .nullable(),
    generation: z.uuid().nullable(),
    associatedTokens: z
      .array(z.string().regex(/^[a-f\d]{64}$/))
      .max(20)
      .default([]),
    accountEpochFloor: z.number().int().nonnegative().nullable().default(null),
    clearing: z.boolean(),
    deleting: z.boolean(),
    pendingDeletionId: z.uuid().nullable().default(null),
    completedDeletionId: z.uuid().nullable().default(null),
    deletionExpectedGeneration: z.uuid().nullable().default(null),
    closing: z.boolean().default(false),
    closed: z.boolean().default(false),
    replacing: z.boolean().default(false),
    replacementExpectedGeneration: z.uuid().nullable().default(null),
    cleanup: z.boolean(),
    purgeCursor: z.string().max(32_768).nullable(),
    versions: z.record(
      z.string().regex(/^[a-f\d]{64}$/),
      z.object({ id: z.uuid(), parents: z.array(z.uuid()).max(50) }).strict(),
    ),
    heads: z.record(z.uuid(), z.array(z.uuid()).max(50)),
  })
  .strict();
type Metadata = z.infer<typeof metadataSchema>;
const emptyMetadata = (
  accountToken: string | null = null,
  generation: string | null = null,
  associatedTokens: string[] = accountToken ? [accountToken] : [],
): Metadata => ({
  version: 1,
  accountToken,
  generation,
  associatedTokens,
  accountEpochFloor: null,
  clearing: false,
  deleting: false,
  pendingDeletionId: null,
  completedDeletionId: null,
  deletionExpectedGeneration: null,
  closing: false,
  closed: false,
  replacing: false,
  replacementExpectedGeneration: null,
  cleanup: false,
  purgeCursor: null,
  versions: {},
  heads: {},
});

/** Optional additional copy; never depends on JustGO authentication or transport. */
export class ICloudDataCoordinator {
  readonly store = createStore<{
    status: 'idle' | 'syncing' | 'error';
    error: ICloudErrorCode | null;
  }>(() => ({ status: 'idle', error: null }));
  private metadata: Metadata | null = null;
  private work: Promise<void> | null = null;
  private enabled = true;
  private epoch = 0;
  private readonly key: string;
  private readonly fingerprint: (data: ICloudData) => Promise<string>;
  private readonly id: () => string;
  constructor(
    private readonly repository: AccountRepository,
    private readonly storage: JournalStorage,
    private readonly cloud: ICloudSync,
    private readonly collection: ICloudCollection,
    options: {
      fingerprint?: (data: ICloudData) => Promise<string>;
      id?: () => string;
    } = {},
  ) {
    if (
      collection !== 'guest' &&
      collection !== `account:${repository.accountId}`
    )
      throw new ICloudError('INVALID_DATA');
    this.key = `justgo:v1:${repository.accountId}:icloud-sync:${collection}`;
    this.fingerprint =
      options.fingerprint ??
      ((data) =>
        digestStringAsync(
          CryptoDigestAlgorithm.SHA256,
          iCloudDataIdentity(data),
        ));
    this.id = options.id ?? randomUUID;
  }
  stop() {
    this.enabled = false;
    this.epoch++;
    this.store.setState({ status: 'idle', error: null });
  }
  start() {
    this.enabled = true;
  }
  async settled(): Promise<void> {
    await this.work?.catch(() => {});
  }
  private check(epoch: number) {
    const state = this.repository.store.getState();
    if (!this.enabled || this.epoch !== epoch || !state.active || !state.online)
      throw new ICloudError('DISABLED');
  }
  private async load() {
    if (this.metadata) return metadataSchema.parse(this.metadata);
    try {
      const raw = await this.storage.getItem(this.key);
      const parsed = raw
        ? metadataSchema.parse(JSON.parse(raw))
        : emptyMetadata();
      // Upgrade earlier metadata without forgetting its previously used Apple account.
      if (
        raw &&
        !('associatedTokens' in JSON.parse(raw)) &&
        parsed.accountToken
      )
        parsed.associatedTokens = [parsed.accountToken];
      this.metadata = parsed;
      return metadataSchema.parse(parsed);
    } catch {
      throw new ICloudError('UNAVAILABLE');
    }
  }
  private async save(metadata: Metadata) {
    const parsed = metadataSchema.parse(metadata);
    if (Object.keys(parsed.versions).length > LIMIT)
      throw new ICloudError('INVALID_DATA');
    try {
      await this.storage.setItem(this.key, JSON.stringify(parsed));
    } catch {
      throw new ICloudError('UNAVAILABLE');
    }
    this.metadata = metadataSchema.parse(parsed);
  }
  private async remote(epoch: number) {
    const records: ICloudValue[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let generation: string | undefined;
    let revision: string | null | undefined;
    let wasReset = false;
    let closed = false;
    while (true) {
      this.check(epoch);
      const page = await this.cloud.read({
        collection: this.collection,
        ...(cursor ? { cursor } : {}),
      });
      this.check(epoch);
      if (generation && generation !== page.generation)
        throw new ICloudError('STALE_GENERATION');
      if (revision !== undefined && revision !== page.revision)
        throw new ICloudError('CONFLICT');
      generation = page.generation;
      revision = page.revision;
      wasReset ||= page.wasReset;
      closed ||= page.closed;
      records.push(...page.records);
      if (
        records.length > LIMIT ||
        cursors.size > Math.ceil(LIMIT / ICLOUD_PAGE_LIMIT) + 2 ||
        cursors.has(page.cursor)
      )
        throw new ICloudError('INVALID_DATA');
      cursors.add(page.cursor);
      if (!page.hasMore) break;
      cursor = page.cursor;
    }
    return {
      ...parseICloudData(records, this.collection, this.repository.accountId),
      generation,
      revision: revision ?? null,
      wasReset,
      closed,
    };
  }
  private execute(action: (epoch: number) => Promise<void>): Promise<void> {
    if (this.work) return this.work;
    const epoch = this.epoch;
    const work = action(epoch).then(
      () => {
        if (epoch === this.epoch)
          this.store.setState({ status: 'idle', error: null });
      },
      (error: unknown) => {
        const safe = iCloudError(error);
        if (epoch === this.epoch)
          this.store.setState({ status: 'error', error: safe.code });
        throw safe;
      },
    );
    this.work = work;
    void work
      .finally(() => {
        if (this.work === work) this.work = null;
      })
      .catch(() => {});
    return work;
  }
  synchronize = (): Promise<void> => this.execute((epoch) => this.run(epoch));

  private async run(
    epoch: number,
    acknowledgeReset = false,
    replacementPass = 0,
    consume?: (
      remote: Awaited<ReturnType<ICloudDataCoordinator['remote']>>,
    ) => Promise<void>,
  ): Promise<void> {
    if (replacementPass > 2) throw new ICloudError('CONFLICT');
    await this.repository.hydrate();
    this.check(epoch);
    const status = await this.cloud.status();
    this.check(epoch);
    if (!status.enabled || !status.accountToken) return;
    this.store.setState({ status: 'syncing', error: null });
    let metadata = await this.load();
    // New Apple identity was explicitly enabled by the user. Its collection
    // metadata cannot inherit a previous Apple account's generation or versions.
    if (metadata.accountToken !== status.accountToken)
      metadata = emptyMetadata(status.accountToken, null, [
        ...new Set([...metadata.associatedTokens, status.accountToken]),
      ]);
    if (!metadata.associatedTokens.includes(status.accountToken)) {
      metadata.associatedTokens.push(status.accountToken);
    }
    if (
      !consume &&
      !metadata.deleting &&
      !metadata.closing &&
      (await this.storage.getItem(
        `justgo:v1:${this.repository.accountId}:icloud-handover`,
      ))
    )
      throw new ICloudError('HANDOVER_PENDING');
    let remote = await this.remote(epoch);
    if (metadata.closing) {
      await this.erase(metadata, remote.generation, epoch);
      return;
    }
    if (remote.closed || metadata.closed) {
      if (this.collection === 'guest') throw new ICloudError('INVALID_DATA');
      if (!metadata.closed || metadata.clearing) {
        metadata = {
          ...emptyMetadata(
            status.accountToken,
            remote.generation,
            metadata.associatedTokens,
          ),
          closed: true,
          clearing: true,
        };
        await this.save(metadata);
        this.check(epoch);
        await this.repository.clearData();
        this.check(epoch);
        metadata.clearing = false;
        await this.save(metadata);
      }
      throw new ICloudError('COLLECTION_DELETED');
    }
    if (metadata.deleting) {
      await this.erase(metadata, remote.generation, epoch);
      return;
    }
    if (metadata.replacing && !metadata.cleanup) {
      await this.replaceStaleCopy(metadata, remote.generation, epoch);
      metadata = await this.load();
      remote = await this.remote(epoch);
    }
    if (metadata.cleanup) {
      await this.erase(metadata, remote.generation, epoch);
      metadata = await this.load();
      remote = await this.remote(epoch);
    }
    if (metadata.clearing) {
      this.check(epoch);
      await this.repository.clearData();
      this.check(epoch);
      if (metadata.accountEpochFloor !== null)
        await this.repository.observeDataEpoch(metadata.accountEpochFloor);
      metadata.clearing = false;
      await this.save(metadata);
    }
    const account = this.collection !== 'guest';
    let accountEpoch = account
      ? (this.repository.store.getState().dataEpoch ?? null)
      : null;
    if (
      account &&
      metadata.accountEpochFloor !== null &&
      (accountEpoch === null || accountEpoch < metadata.accountEpochFloor)
    ) {
      await this.repository.observeDataEpoch(metadata.accountEpochFloor);
      accountEpoch = metadata.accountEpochFloor;
    }
    if (
      account &&
      this.repository.store.getState().dataMode === 'cloud' &&
      accountEpoch === null
    )
      throw new ICloudError('UNAVAILABLE');
    if (
      account &&
      remote.accountEpoch !== null &&
      accountEpoch !== null &&
      remote.accountEpoch > accountEpoch &&
      this.repository.store.getState().dataMode === 'cloud'
    )
      throw new ICloudError('STALE_GENERATION');
    if (
      account &&
      accountEpoch !== null &&
      remote.accountEpoch !== null &&
      remote.accountEpoch < accountEpoch
    ) {
      // JustGO's authenticated deletion epoch is authoritative. Replace only
      // the stale additional iCloud copy, retaining current local/server data.
      await this.replaceStaleCopy(metadata, remote.generation, epoch);
      return this.run(epoch, false, replacementPass + 1, consume);
    }
    const advanceFloor =
      account &&
      remote.accountEpoch !== null &&
      (accountEpoch === null || remote.accountEpoch > accountEpoch);
    const changed =
      metadata.generation !== null && metadata.generation !== remote.generation;
    if (
      !metadata.generation &&
      remote.wasReset &&
      !acknowledgeReset &&
      (!account || accountEpoch === null)
    )
      throw new ICloudError('RESET_CONFIRMATION_REQUIRED');
    const adoptUnknownReset =
      acknowledgeReset && !metadata.generation && remote.wasReset;
    if (
      metadata.clearing ||
      (!account && changed) ||
      adoptUnknownReset ||
      (advanceFloor && remote.accountEpoch !== 0)
    ) {
      metadata = {
        ...emptyMetadata(
          status.accountToken,
          remote.generation,
          metadata.associatedTokens,
        ),
        clearing: true,
        accountEpochFloor: account
          ? (remote.accountEpoch ?? accountEpoch)
          : null,
      };
      await this.save(metadata);
      this.check(epoch);
      await this.repository.clearData();
      this.check(epoch);
      if (metadata.accountEpochFloor !== null)
        await this.repository.observeDataEpoch(metadata.accountEpochFloor);
      metadata.clearing = false;
      await this.save(metadata);
    }
    if (advanceFloor && remote.accountEpoch !== null) {
      metadata.accountEpochFloor = remote.accountEpoch;
      await this.save(metadata);
      await this.repository.observeDataEpoch(remote.accountEpoch);
      accountEpoch = remote.accountEpoch;
    }
    if (account && accountEpoch === null) throw new ICloudError('UNAVAILABLE');
    if (account) metadata.accountEpochFloor = accountEpoch;
    metadata.generation = remote.generation;
    this.check(epoch);
    const localBefore = await this.repository.snapshotData();
    const contexts = new Map(
      localBefore.attempts.map((attempt) => [attempt.id, attempt]),
    );
    for (const attempt of remote.attempts) {
      const old = contexts.get(attempt.id);
      if (
        old &&
        (!sameCompletionContext(old, attempt) ||
          old.instruction !== attempt.instruction)
      )
        throw new ICloudError('CONFLICT');
    }
    await this.repository.mergeCompletions(remote.attempts);
    this.check(epoch);
    const versions = remote.versions.map(cloudVersion);
    const byId = new Map(
      versions.map((version) => [version.versionId, version]),
    );
    const heads = versionHeads(versions);
    for (const [id, data] of remote.values) {
      const fingerprint = await this.fingerprint(data);
      const old = metadata.versions[fingerprint];
      if (!old || !remote.values.has(old.id) || id < old.id)
        metadata.versions[fingerprint] = {
          id,
          parents: data.kind === 'journal' ? data.parents : [],
        };
    }
    const replacements: LocalJournalEntry[] = [];
    for (const entry of localBefore.journal.entries) {
      const known =
        metadata.versions[
          await this.fingerprint(
            journalData(this.collection, entry, [], accountEpoch),
          )
        ];
      const latest = heads.get(entry.id);
      const latestVersion = latest?.[0];
      if (
        known &&
        latest?.length === 1 &&
        latestVersion &&
        isAncestor(known.id, latestVersion, byId)
      )
        replacements.push(entry);
    }
    const entriesByVersion = new Map(
      remote.versions.map((version) => [version.id, version.entry]),
    );
    const preferred = [...heads.values()].map((versions) => {
      const first = versions[0];
      const entry = first && entriesByVersion.get(first.versionId);
      if (!entry) throw new ICloudError('INVALID_DATA');
      return entry;
    });
    this.check(epoch);
    await this.repository.mergeSyncedJournal(
      preferred,
      remote.versions.map((version) => version.entry),
      replacements,
    );
    this.check(epoch);
    if (account && remote.hasOlderEpoch) {
      await this.replaceStaleCopy(metadata, remote.generation, epoch);
      return this.run(epoch, false, replacementPass + 1, consume);
    }
    if (consume) {
      await this.save(metadata);
      this.check(epoch);
      await consume(remote);
      this.check(epoch);
      return;
    }
    const snapshot = await this.repository.snapshotData();
    const upload: ICloudValue[] = [];
    const scheduled = new Set<string>();
    const prepare = async (data: ICloudData, parents: string[] = []) => {
      const fingerprint = await this.fingerprint(data);
      let known = metadata.versions[fingerprint];
      if (!known) {
        known = { id: this.id(), parents };
        metadata.versions[fingerprint] = known;
      }
      if (remote.values.has(known.id) || scheduled.has(known.id)) return;
      scheduled.add(known.id);
      const value =
        data.kind === 'journal' ? { ...data, parents: known.parents } : data;
      upload.push({ id: known.id, value: JSON.stringify(value) });
    };
    if (account && accountEpoch !== null)
      await prepare(epochData(this.collection, accountEpoch));
    for (const attempt of snapshot.attempts)
      await prepare(completionData(this.collection, attempt, accountEpoch));
    for (const entry of [
      ...snapshot.journal.entries,
      ...snapshot.journal.alternatives,
    ]) {
      const parents = (metadata.heads[entry.id] ?? []).filter((id) =>
        byId.has(id),
      );
      await prepare(
        journalData(this.collection, entry, [], accountEpoch),
        parents,
      );
    }
    if (remote.values.size + upload.length > LIMIT)
      throw new ICloudError('INVALID_DATA');
    // Version IDs and original ancestry are durable before any uncertain save.
    await this.save(metadata);
    for (const records of iCloudWriteBatches(upload)) {
      this.check(epoch);
      const response = await this.cloud.write({
        collection: this.collection,
        generation: remote.generation,
        records,
      });
      this.check(epoch);
      if (response.generation !== remote.generation)
        throw new ICloudError('STALE_GENERATION');
    }
    const uploaded = parseICloudData(
      [...remote.values]
        .map(([id, data]) => ({ id, value: JSON.stringify(data) }))
        .concat(upload),
      this.collection,
      this.repository.accountId,
    );
    const latestHeads = versionHeads(uploaded.versions.map(cloudVersion));
    metadata.heads = Object.fromEntries(
      [...latestHeads].map(([id, versions]) => [
        id,
        versions.map((version) => version.versionId),
      ]),
    );
    this.check(epoch);
    await this.save(metadata);
  }

  private async erase(metadata: Metadata, generation: string, epoch: number) {
    this.check(epoch);
    if (
      metadata.deleting &&
      !metadata.closing &&
      !metadata.deletionExpectedGeneration
    ) {
      metadata.deletionExpectedGeneration = generation;
      await this.save(metadata);
      this.check(epoch);
    }
    if (!metadata.cleanup || metadata.generation !== generation) {
      const closing = metadata.closing;
      const deleteLocal = metadata.deleting || metadata.clearing || closing;
      const expectedGeneration =
        metadata.deletionExpectedGeneration ??
        metadata.replacementExpectedGeneration ??
        generation;
      // A lost reset acknowledgement must not reset the newer generation a
      // second time. Any later generation already fences this intent's source.
      const reset =
        !closing &&
        (metadata.deleting || metadata.replacing) &&
        generation !== expectedGeneration
          ? { generation }
          : await this.cloud[closing ? 'close' : 'reset']({
              collection: this.collection,
              generation: closing ? generation : expectedGeneration,
            });
      this.check(epoch);
      metadata = {
        ...emptyMetadata(
          metadata.accountToken,
          reset.generation,
          metadata.associatedTokens,
        ),
        deleting: deleteLocal,
        pendingDeletionId: metadata.pendingDeletionId,
        completedDeletionId: metadata.completedDeletionId,
        deletionExpectedGeneration: metadata.deletionExpectedGeneration,
        replacementExpectedGeneration: metadata.replacementExpectedGeneration,
        closing,
        closed: closing,
        clearing: deleteLocal,
        replacing: !deleteLocal,
        cleanup: true,
        accountEpochFloor:
          this.repository.store.getState().dataEpoch ??
          metadata.accountEpochFloor,
      };
      await this.save(metadata);
    }
    if (metadata.clearing) {
      this.check(epoch);
      await this.repository.clearData();
      this.check(epoch);
      metadata.clearing = false;
      await this.save(metadata);
    }
    const cursors = new Set<string>();
    const purgeGeneration = metadata.generation;
    if (!purgeGeneration) throw new ICloudError('INVALID_DATA');
    let restartedCursor = false;
    while (true) {
      this.check(epoch);
      let page: ICloudPurgePage;
      try {
        page = await this.cloud.purge({
          collection: this.collection,
          generation: purgeGeneration,
          ...(metadata.purgeCursor ? { cursor: metadata.purgeCursor } : {}),
        });
      } catch (error) {
        this.check(epoch);
        if (
          iCloudError(error).code !== 'CURSOR_EXPIRED' ||
          !metadata.purgeCursor ||
          restartedCursor
        )
          throw error;
        // The reset/closure is already durable. Restart only physical cleanup,
        // retaining that generation and bounding cursor recovery to one retry.
        metadata.purgeCursor = null;
        await this.save(metadata);
        restartedCursor = true;
        cursors.clear();
        continue;
      }
      this.check(epoch);
      if (page.generation !== metadata.generation || cursors.has(page.cursor))
        throw new ICloudError('INVALID_DATA');
      cursors.add(page.cursor);
      metadata.purgeCursor = page.cursor;
      await this.save(metadata);
      if (!page.hasMore) {
        if (!metadata.closed) await this.publishEpochMarker(metadata, epoch);
        metadata.deleting = false;
        if (metadata.pendingDeletionId)
          metadata.completedDeletionId = metadata.pendingDeletionId;
        metadata.pendingDeletionId = null;
        metadata.deletionExpectedGeneration = null;
        metadata.closing = false;
        metadata.replacing = false;
        metadata.replacementExpectedGeneration = null;
        metadata.cleanup = false;
        metadata.purgeCursor = null;
        await this.save(metadata);
        return;
      }
      if (cursors.size > 2 * Math.ceil(LIMIT / ICLOUD_PAGE_LIMIT) + 10)
        throw new ICloudError('INVALID_DATA');
    }
  }
  private async publishEpochMarker(metadata: Metadata, epoch: number) {
    if (this.collection === 'guest') return;
    const accountEpoch =
      this.repository.store.getState().dataEpoch ?? metadata.accountEpochFloor;
    if (accountEpoch === null || !metadata.generation)
      throw new ICloudError('UNAVAILABLE');
    const data = epochData(this.collection, accountEpoch);
    const fingerprint = await this.fingerprint(data);
    const known = metadata.versions[fingerprint] ?? {
      id: this.id(),
      parents: [],
    };
    metadata.versions[fingerprint] = known;
    metadata.accountEpochFloor = accountEpoch;
    await this.save(metadata);
    this.check(epoch);
    await this.cloud.write({
      collection: this.collection,
      generation: metadata.generation,
      records: [{ id: known.id, value: JSON.stringify(data) }],
    });
    this.check(epoch);
  }
  private async replaceStaleCopy(
    metadata: Metadata,
    generation: string,
    epoch: number,
  ) {
    this.check(epoch);
    const expectedGeneration =
      metadata.replacementExpectedGeneration ?? generation;
    await this.save({
      ...metadata,
      replacing: true,
      replacementExpectedGeneration: expectedGeneration,
    });
    this.check(epoch);
    // A newer root already fences the stale source. Reuse it after a lost
    // acknowledgement rather than erasing post-reset writing from another phone.
    const reset =
      generation === expectedGeneration
        ? await this.cloud.reset({
            collection: this.collection,
            generation: expectedGeneration,
          })
        : { generation };
    this.check(epoch);
    const replacement = {
      ...emptyMetadata(
        metadata.accountToken,
        reset.generation,
        metadata.associatedTokens,
      ),
      replacing: true,
      replacementExpectedGeneration: expectedGeneration,
      cleanup: true,
      accountEpochFloor:
        this.repository.store.getState().dataEpoch ??
        metadata.accountEpochFloor,
    };
    await this.save(replacement);
    // Replacing a stale additional copy must preserve the current local data
    // and must never invoke the JustGO account deletion endpoint.
    await this.erase(replacement, reset.generation, epoch);
  }
  private async maintenance(
    action: (coordinator: ICloudDataCoordinator) => Promise<void>,
    retireCopy = false,
  ) {
    await this.work?.catch(() => {});
    const metadata = await this.load();
    const status = await this.cloud.status();
    const tokens = metadata.associatedTokens.length
      ? metadata.associatedTokens
      : !metadata.accountToken && status.enabled && status.accountToken
        ? [status.accountToken]
        : [];
    // Never-used iCloud has no additional copy to remove or adopt.
    if (!tokens.length) return false;
    const token = status.accountToken;
    if (!token || !tokens.includes(token))
      throw new ICloudError('ACCOUNT_CHANGED');
    const execute = async (coordinator: ICloudDataCoordinator) => {
      await action(coordinator);
      if (!retireCopy) return;
      const updated = await coordinator.load();
      await coordinator.save({
        ...updated,
        associatedTokens: tokens.filter((item) => item !== token),
      });
    };
    const accessWork = async (access: ICloudSync) => {
      // The runtime stops ordinary coordinators before migration/deletion. Use
      // an isolated lease without restarting that background synchronizer.
      const coordinator = new ICloudDataCoordinator(
        this.repository,
        this.storage,
        access,
        this.collection,
        { fingerprint: this.fingerprint, id: this.id },
      );
      try {
        await execute(coordinator);
      } finally {
        coordinator.stop();
        this.metadata = null;
      }
    };
    if (this.cloud.withMaintenance)
      await this.cloud.withMaintenance(token, accessWork);
    else if (status.enabled) await accessWork(this.cloud);
    else throw new ICloudError('DISABLED');
    // Each previously used Apple account must be cleaned; unavailable copies
    // keep the owning deletion intent pending until that Apple account returns.
    if (retireCopy && tokens.some((item) => item !== token))
      throw new ICloudError('ACCOUNT_CHANGED');
    return true;
  }

  async handoverGuest(
    targetOwnerId: string,
    importVerified: (
      snapshot: Awaited<ReturnType<AccountRepository['snapshotData']>>,
    ) => Promise<void>,
  ): Promise<void> {
    if (
      this.collection !== 'guest' ||
      !z.uuid().safeParse(targetOwnerId).success ||
      targetOwnerId === this.repository.accountId
    )
      throw new ICloudError('INVALID_DATA');
    const destination = await this.storage.getItem(
      `justgo:v1:${this.repository.accountId}:icloud-handover`,
    );
    if (destination) {
      let owner: string;
      try {
        owner = z
          .object({ targetOwnerId: z.uuid() })
          .strict()
          .parse(JSON.parse(destination)).targetOwnerId;
      } catch {
        throw new ICloudError('INVALID_DATA');
      }
      if (owner !== targetOwnerId) throw new ICloudError('ACCOUNT_CHANGED');
    }
    let importFailure: { error: unknown } | undefined;
    const verified = async (
      snapshot: Awaited<ReturnType<AccountRepository['snapshotData']>>,
    ) => {
      try {
        await importVerified(snapshot);
      } catch (error) {
        importFailure = { error };
        throw error;
      }
    };
    let handled: boolean;
    try {
      handled = await this.maintenance(async (coordinator) => {
        const generation = await handoverGuestCopy({
          targetOwnerId,
          sourceId: this.repository.accountId,
          storage: this.storage,
          cloud: coordinator.cloud,
          read: () => coordinator.remote(coordinator.epoch),
          download: (consume) =>
            coordinator.execute((epoch) =>
              coordinator.run(epoch, false, 0, consume),
            ),
          snapshot: () => this.repository.snapshotData(),
          identity: async (snapshot) => {
            const identities: string[] = [];
            for (const attempt of snapshot.attempts)
              identities.push(
                await this.fingerprint(completionData('guest', attempt)),
              );
            for (const entry of [
              ...snapshot.journal.entries,
              ...snapshot.journal.alternatives,
            ])
              identities.push(
                await this.fingerprint(journalData('guest', entry)),
              );
            return identities.sort();
          },
          importVerified: verified,
        });
        const metadata = await coordinator.load();
        await coordinator.save({ ...metadata, generation });
      }, true);
    } catch (error) {
      if (importFailure) throw importFailure.error;
      throw error;
    }
    if (!handled) await importVerified(await this.repository.snapshotData());
  }

  async deletePreviouslySyncedData(intentId?: string): Promise<void> {
    await this.maintenance(
      (coordinator) => coordinator.deleteData(intentId),
      true,
    );
  }

  async deletePreviouslySyncedAccount(): Promise<void> {
    await this.maintenance((coordinator) => coordinator.deleteAccount(), true);
  }

  async deleteData(intentId?: string): Promise<void> {
    await this.work?.catch(() => {});
    const stored = await this.load();
    const deletionId = intentId ?? stored.pendingDeletionId ?? this.id();
    if (!z.uuid().safeParse(deletionId).success)
      throw new ICloudError('INVALID_DATA');
    if (stored.pendingDeletionId && stored.pendingDeletionId !== deletionId)
      throw new ICloudError('CONFLICT');
    const status = await this.cloud.status();
    if (!status.enabled || !status.accountToken)
      throw new ICloudError('DISABLED');
    if (
      stored.completedDeletionId === deletionId &&
      stored.accountToken === status.accountToken
    )
      return;
    if (
      stored.pendingDeletionId === deletionId &&
      stored.accountToken &&
      stored.accountToken !== status.accountToken
    )
      throw new ICloudError('ACCOUNT_CHANGED');
    const metadata =
      stored.accountToken === status.accountToken
        ? stored
        : emptyMetadata(status.accountToken, null, stored.associatedTokens);
    await this.save({
      ...metadata,
      deleting: true,
      pendingDeletionId: deletionId,
    });
    await this.synchronize();
    if (this.metadata?.deleting || this.metadata?.cleanup)
      throw new ICloudError('DISABLED');
  }
  async deleteAccount(): Promise<void> {
    if (this.collection === 'guest') throw new ICloudError('INVALID_DATA');
    await this.work?.catch(() => {});
    const status = await this.cloud.status();
    if (!status.enabled || !status.accountToken)
      throw new ICloudError('DISABLED');
    const stored = await this.load();
    const metadata =
      stored.accountToken === status.accountToken
        ? stored
        : emptyMetadata(status.accountToken, null, stored.associatedTokens);
    if (metadata.closed && !metadata.closing && !metadata.cleanup) return;
    await this.save({ ...metadata, closing: true });
    await this.synchronize();
    if (
      !this.metadata?.closed ||
      this.metadata.closing ||
      this.metadata.cleanup
    )
      throw new ICloudError('UNAVAILABLE');
  }
  async acknowledgeReset(): Promise<void> {
    await this.work?.catch(() => {});
    await this.execute((epoch) => this.run(epoch, true));
  }
}
