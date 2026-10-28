import { createStore } from 'zustand/vanilla';
import {
  attemptSchema,
  catalogSchema,
  createAttemptSchema,
  patchAttemptSchema,
  progressSummarySchema,
  progressCalendarSchema,
  progressDayResponseSchema,
  type Attempt,
  type Catalog,
  type ChallengeCard,
  type CreateAttempt,
  type PatchAttempt,
  type ProgressSummary,
  type ProgressCalendar,
  type ProgressDayResponse,
  challengeCardSchema,
  normalizeReflectionText,
  sameHistoricalContext,
} from '@justgo/contracts';
import { ApiError } from '../../lib/network/http';
import {
  cloneJournal,
  emptyJournal,
  endangered,
  journalSchema,
  systemClock,
  type Journal,
  type JournalClock,
  type JournalState,
  type JournalStorage,
  catalogEnvelopeSchema,
  periodSchema,
} from './model';
import { JournalSender } from './sync/sender';
import { JournalPersistence } from './persistence/persistence';
import { DeckPreferencesStorage } from './persistence/deck-preferences';
import { addCompletion } from './submissions';
import { createLocalJournal } from '../journal';
import type { LocalJournalRepository } from '../journal/repository';
import { LocalJournalError, type LocalJournalEntry } from '../journal/model';
import {
  completionJournal,
  journalAttempt,
  journalEntry,
  preserveActivityJournal,
} from './private-journal';
import type { JournalTransport } from './sync/transport';
import { preserveNewerReflection } from './progress/progress';

export type AccountRepositoryOptions = {
  accountId: string;
  storage: JournalStorage;
  transport: JournalTransport;
  today: string;
  timeZone: string;
  clock?: JournalClock;
  random?: () => number;
  localJournal?: LocalJournalRepository;
  dataMode?: 'legacy' | 'local' | 'cloud';
};

export class AccountRepository {
  readonly store;
  readonly accountId: string;
  readonly deckPreferences: DeckPreferencesStorage;
  private readonly key: string;
  private readonly clock: JournalClock;
  private readonly sender: JournalSender;
  private readonly persistence: JournalPersistence;
  private disposed = false;
  private accountCurrent = true;
  private migrating = false;
  private accountGeneration = 0;
  private hydration: Promise<void> | null = null;
  private catalogWrites: Promise<void> = Promise.resolve();

  private episode = 0;
  private readonly localJournal: LocalJournalRepository;
  private legacyJournalSource: Journal | null = null;
  private privatePreservationFailed = false;
  private protectionBeforePrivateFailure = false;
  private localPreparation: Promise<void> | null = null;
  private readonly reflectionSubmissions = new Map<
    string,
    { attemptId: string; input: string; work: Promise<Attempt> }
  >();

  private saving = new Map<string, Promise<Attempt>>();
  private syncData: (() => Promise<void>) | null = null;
  private clearing = false;
  constructor(private readonly options: AccountRepositoryOptions) {
    journalSchema.parse(emptyJournal(options.accountId));
    periodSchema.parse({ today: options.today, timeZone: options.timeZone });
    this.accountId = options.accountId;
    this.localJournal =
      options.localJournal ?? createLocalJournal(options.accountId);
    this.key = `justgo:v1:${options.accountId}`;
    this.deckPreferences = new DeckPreferencesStorage(
      options.accountId,
      options.storage,
    );
    this.clock = options.clock ?? systemClock;
    this.store = createStore<JournalState>(() => ({
      dataMode: options.dataMode ?? 'legacy',
      syncStatus: 'idle',
      dataEpoch: null,
      ready: false,
      localEntries: {},
      localJournalReady: false,
      hydrationError: null,
      journal: emptyJournal(options.accountId),
      catalog: null,
      online: true,
      active: true,
      warning: null,
      recoverySequence: 0,
      remoteRefreshSequence: 0,
      coordinatorError: null,
      flowAttemptId: null,
      period: { today: options.today, timeZone: options.timeZone },
    }));
    this.persistence = new JournalPersistence(
      `${this.key}:journal`,
      options.storage,
      this.store,
      () => this.updateWarning(),
    );
    this.sender = new JournalSender(
      {
        read: () => this.store.getState(),
        update: (work) => this.update(work),
        persist: () => this.persist(),
        needsPersistence: () => this.persistence.dirty,
        failed: () => this.store.setState({ coordinatorError: 'UNAVAILABLE' }),
        settled: () => {
          this.store.setState((state) => ({
            remoteRefreshSequence: state.remoteRefreshSequence + 1,
          }));
          this.updateWarning();
        },
      },
      options.transport,
      this.clock,
      options.random ?? Math.random,
    );
  }
  hydrate(): Promise<void> {
    if (this.disposed) return Promise.reject(new ApiError('ACCOUNT_CHANGED'));
    if (this.hydration) return this.hydration;
    this.hydration = this.readStored();
    return this.hydration;
  }
  private async readStored() {
    try {
      if (this.store.getState().dataMode !== 'legacy')
        this.store.setState({
          dataDeletionPending:
            (await this.options.storage.getItem(
              `${this.key}:delete-all-pending`,
            )) !== null,
        });
      const epoch =
        this.store.getState().dataMode === 'legacy'
          ? null
          : await this.options.storage.getItem(`${this.key}:data-epoch`);
      if (epoch !== null) {
        const value: unknown = JSON.parse(epoch);
        if (
          typeof value !== 'number' ||
          !Number.isSafeInteger(value) ||
          value < 0
        )
          throw new ApiError('STORAGE');
        this.store.setState({ dataEpoch: value });
      }
    } catch {
      this.persistence.protected = true;
      this.store.setState({ hydrationError: 'unreadable' });
    }
    try {
      const raw = await this.options.storage.getItem(`${this.key}:journal`);
      if (raw) {
        let parsed: ReturnType<typeof journalSchema.safeParse>;
        try {
          parsed = journalSchema.safeParse(JSON.parse(raw));
        } catch {
          parsed = { success: false } as ReturnType<
            typeof journalSchema.safeParse
          >;
        }
        if (parsed.success && parsed.data.accountId === this.accountId) {
          parsed.data.calendarBaseline ??= parsed.data.calendar;
          // Rollover, pruning and completion acknowledgements may change live
          // caches while a failed private-store migration waits for retry.
          // Keep their original private content until every source is durable.
          this.legacyJournalSource = cloneJournal(parsed.data);
          this.store.setState({ journal: parsed.data });
        } else {
          this.store.setState({ hydrationError: 'unreadable' });
          this.persistence.protected = true;
          // Never overwrite unvalidated pending bytes without a durable copy.
          try {
            await this.options.storage.setItem(
              `${this.key}:quarantine:${this.clock.now()}`,
              raw,
            );
            this.persistence.protected = false;
          } catch {
            /* Retain original key; new submissions remain in memory. */
          }
        }
      }
    } catch {
      this.persistence.protected = true;
      this.store.setState({ hydrationError: 'unreadable' });
    }
    try {
      const raw = await this.options.storage.getItem(`${this.key}:catalog`);
      if (raw) {
        const parsed = catalogEnvelopeSchema.parse(JSON.parse(raw));
        if (parsed.accountId === this.accountId)
          this.store.setState({ catalog: parsed.catalog });
      }
    } catch {
      /* Disposable download can be refreshed without touching the journal. */
    }
    try {
      await this.prepareLocalJournal();
    } catch {
      // Keep the old bytes and stop persistence until preservation can retry.
    }
    this.store.setState({ ready: true });
    await this.rollover(
      this.store.getState().period.today,
      this.store.getState().period.timeZone,
    );
    if (!this.disposed) this.kickSync();
  }
  private prepareLocalJournal(): Promise<void> {
    if (this.localPreparation) return this.localPreparation;
    const work = (async () => {
      if (
        this.store.getState().hydrationError &&
        !this.privatePreservationFailed
      )
        throw new ApiError('STORAGE');
      try {
        if (this.legacyJournalSource)
          await preserveActivityJournal(
            this.localJournal,
            this.legacyJournalSource,
          );
        await preserveActivityJournal(
          this.localJournal,
          this.store.getState().journal,
        );
        await this.refreshLocalJournal();
        this.store.setState({
          journal: completionJournal(this.store.getState().journal),
          localJournalReady: true,
          hydrationError: null,
        });
        if (this.privatePreservationFailed)
          this.persistence.protected = this.protectionBeforePrivateFailure;
        this.privatePreservationFailed = false;
        await this.persist();
        this.legacyJournalSource = null;
      } catch (error) {
        if (!this.privatePreservationFailed)
          this.protectionBeforePrivateFailure = this.persistence.protected;
        this.privatePreservationFailed = true;
        this.persistence.protected = true;
        this.store.setState({
          hydrationError: 'unreadable',
          localJournalReady: false,
        });
        throw error;
      }
    })();
    this.localPreparation = work;
    void work
      .finally(() => {
        if (this.localPreparation === work) this.localPreparation = null;
      })
      .catch(() => {});
    return work;
  }
  private async ensureLocalJournal() {
    if (
      !this.store.getState().localJournalReady &&
      this.privatePreservationFailed
    )
      await this.prepareLocalJournal().catch(() => {
        throw new ApiError('STORAGE');
      });
    if (
      !this.store.getState().localJournalReady ||
      this.store.getState().hydrationError
    )
      throw new ApiError('STORAGE');
  }
  async cacheCatalog(catalog: Catalog): Promise<void> {
    await this.hydrate();
    this.checkActiveAccount();
    const parsed = catalogSchema.parse(catalog);
    this.store.setState({ catalog: parsed });
    const write = async () => {
      try {
        await this.options.storage.setItem(
          `${this.key}:catalog`,
          JSON.stringify({
            version: 1,
            accountId: this.accountId,
            catalog: parsed,
          }),
        );
      } catch {
        /* The downloaded live catalog remains usable. */
      }
    };
    this.catalogWrites = this.catalogWrites.then(write);
    await this.catalogWrites;
  }
  getAttempt(id: string): Attempt | undefined {
    const state = this.store.getState();
    const value =
      state.localEntries?.[id] ?? state.journal.records[id]?.attempt;
    return value ? attemptSchema.parse(value) : undefined;
  }
  async synchronize(): Promise<void> {
    await this.hydrate();
    if (this.store.getState().dataMode === 'legacy') await this.sender.flush();
    else await this.syncData?.();
  }
  setDataMode(mode: 'legacy' | 'local' | 'cloud') {
    if (this.store.getState().dataMode === mode) return;
    this.sender.stop();
    this.store.setState({ dataMode: mode });
    this.kickSync();
  }
  setDataSynchronizer(sync: (() => Promise<void>) | null) {
    this.syncData = sync;
  }
  private kickSync() {
    const state = this.store.getState();
    if (
      this.disposed ||
      !this.accountCurrent ||
      this.clearing ||
      !state.ready ||
      !state.active ||
      !state.online
    )
      return;
    if (state.dataMode === 'legacy') this.sender.kick();
    else if (this.syncData)
      // The coordinator retains durable work and exposes its retry state.
      void this.syncData().catch(() => {});
  }
  hasCurrentAttempt(attempt: Attempt): boolean {
    const state = this.store.getState();
    if (!state.ready || !state.active) return false;
    const parsed = attemptSchema.parse(attempt);
    if (state.localEntries?.[parsed.id])
      return (
        JSON.stringify(this.getAttempt(parsed.id)) === JSON.stringify(parsed)
      );
    const existing = state.journal.records[parsed.id];
    return !!(
      existing?.created &&
      !existing.rejected &&
      existing.phoneVersion === existing.version &&
      existing.serverVersion === existing.version &&
      JSON.stringify(existing.attempt) === JSON.stringify(parsed)
    );
  }
  async adoptAttempt(attempt: Attempt): Promise<void> {
    if (!this.store.getState().ready) await this.hydrate();
    this.checkActiveAccount();
    let parsed = attemptSchema.parse(attempt);
    if (parsed.reflection) {
      await this.localJournal.mergeLegacy([
        journalEntry(this.accountId, parsed),
      ]);
      this.checkActiveAccount();
      await this.refreshLocalJournal();
      parsed = { ...parsed, reflection: null };
    }
    // Opening a current, durable row is a read. Avoid cloning/notifying/writing
    // the entire journal before mounting its editor. Newer or unsaved content
    // still goes through the adoption/persistence rules below.
    if (this.hasCurrentAttempt(parsed)) return;
    this.update((journal) => {
      const old = journal.records[parsed.id];
      if (
        old &&
        (old.serverVersion < old.version ||
          (old.attempt.reflection?.revision ?? 0) >
            (parsed.reflection?.revision ?? 0))
      )
        return;
      journal.records[parsed.id] = {
        attempt: parsed,
        version: old?.version ?? 1,
        phoneVersion: old?.phoneVersion ?? 0,
        serverVersion: old?.version ?? 1,
        serverRevision: parsed.reflection?.revision ?? 0,
        created: true,
        rejected: null,
      };
    });
    await this.persist();
    this.kickSync();
  }
  async complete(input: CreateAttempt, card: ChallengeCard): Promise<Attempt> {
    await this.hydrate();
    this.checkActiveAccount();
    if (this.migrating || this.store.getState().dataDeletionPending)
      throw new ApiError('UNAVAILABLE');
    const parsed = createAttemptSchema.parse(input);
    card = challengeCardSchema.parse(card);
    if (card.challengeId !== parsed.challengeId || card.venue !== parsed.venue)
      return Promise.reject(new ApiError('INVALID_REQUEST'));
    const prior = this.getAttempt(parsed.id);
    if (prior) {
      if (
        prior.challengeId !== parsed.challengeId ||
        prior.venue !== parsed.venue ||
        prior.startedAt !== parsed.startedAt ||
        prior.startTimeZone !== parsed.startTimeZone
      )
        return Promise.reject(new ApiError('CONFLICT'));
      return this.saving.get(parsed.id) ?? prior;
    }
    if (this.store.getState().journal.submissions[parsed.id])
      throw new ApiError('CONFLICT');
    this.update((journal) => {
      addCompletion(journal, parsed, card);
    });
    return this.saveSubmission(parsed.id, parsed.id);
  }
  async submitReflection(
    attemptId: string,
    submissionId: string,
    reflection: PatchAttempt['reflection'],
  ): Promise<Attempt> {
    await this.hydrate();
    this.checkActiveAccount();
    if (this.migrating || this.store.getState().dataDeletionPending)
      throw new ApiError('UNAVAILABLE');
    await this.ensureLocalJournal();
    const requested = patchAttemptSchema.parse({
      submissionId,
      expectedReflectionRevision: 0,
      reflection,
    }).reflection;
    if (requested.text !== undefined)
      requested.text = normalizeReflectionText(requested.text);
    const input = JSON.stringify(requested);
    const prior = this.reflectionSubmissions.get(submissionId);
    if (prior) {
      if (prior.attemptId !== attemptId || prior.input !== input)
        throw new ApiError('CONFLICT');
      return prior.work;
    }
    const attempt = this.getAttempt(attemptId);
    if (!attempt) throw new ApiError('NOT_FOUND');
    const work = (async () => {
      try {
        const entry = await this.localJournal.update(attempt, requested);
        this.checkCurrentAccount();
        const saved = journalAttempt(entry);
        this.store.setState((state) => ({
          localEntries: { ...state.localEntries, [entry.id]: saved },
        }));
        this.kickSync();
        return saved;
      } catch (error) {
        this.reflectionSubmissions.delete(submissionId);
        if (error instanceof ApiError) throw error;
        if (error instanceof LocalJournalError) {
          if (error.code === 'INVALID_ENTRY')
            throw new ApiError('INVALID_REQUEST');
          if (error.code === 'CONFLICT') throw new ApiError('CONFLICT');
          if (error.code === 'STOPPED' || error.code === 'WRONG_ACCOUNT')
            throw new ApiError('ACCOUNT_CHANGED');
        }
        throw new ApiError('STORAGE');
      }
    })();
    this.reflectionSubmissions.set(submissionId, { attemptId, input, work });
    return work;
  }
  async snapshotJournal() {
    await this.hydrate();
    await this.ensureLocalJournal();
    return this.localJournal.snapshot();
  }
  async listJournalEntries() {
    await this.hydrate();
    await this.ensureLocalJournal();
    return this.localJournal.list();
  }
  async listJournalConflicts() {
    await this.hydrate();
    await this.ensureLocalJournal();
    return this.localJournal.listConflicts();
  }
  async restoreJournal(
    entries: LocalJournalEntry[],
    alternatives: LocalJournalEntry[] = [],
  ) {
    await this.hydrate();
    this.checkActiveAccount();
    await this.ensureLocalJournal();
    for (const entry of [...entries, ...alternatives]) {
      const completion =
        this.store.getState().journal.records[entry.id]?.attempt;
      if (completion && !sameHistoricalContext(completion, entry))
        throw new ApiError('INVALID_REQUEST');
    }
    const result = await this.localJournal.merge(entries, alternatives);
    this.checkCurrentAccount();
    await this.refreshLocalJournal();
    this.kickSync();
    return result;
  }
  /** Data-only history is durable in guest and managed-account collections. */
  async withDataMigration<T>(work: () => Promise<T>): Promise<T> {
    if (this.migrating) throw new ApiError('UNAVAILABLE');
    this.migrating = true;
    try {
      await this.hydrate();
      this.checkActiveAccount();
      // Finish already accepted input before reading or retiring its source.
      // A failed save keeps the source and its retryable in-memory input intact.
      await Promise.all([
        ...this.saving.values(),
        ...[...this.reflectionSubmissions.values()].map((item) => item.work),
      ]);
      if (this.store.getState().dataDeletionPending)
        throw new ApiError('UNAVAILABLE');
      return await work();
    } finally {
      this.migrating = false;
    }
  }
  async snapshotData() {
    await this.hydrate();
    await this.ensureLocalJournal();
    this.checkCurrentAccount();
    const attempts = Object.values(this.store.getState().journal.records)
      .filter((record) => !record.rejected)
      .map((record) =>
        attemptSchema.parse({ ...record.attempt, reflection: null }),
      );
    return { attempts, journal: await this.localJournal.snapshot() };
  }
  async observeDataEpoch(epoch: number) {
    if (!Number.isSafeInteger(epoch) || epoch < 0)
      throw new ApiError('INVALID_RESPONSE');
    this.checkCurrentAccount();
    if ((this.store.getState().dataEpoch ?? -1) > epoch)
      throw new ApiError('DATA_EPOCH_CHANGED');
    await this.options.storage.setItem(
      `${this.key}:data-epoch`,
      JSON.stringify(epoch),
    );
    this.checkCurrentAccount();
    this.store.setState({ dataEpoch: epoch });
  }
  async mergeCompletions(candidates: Attempt[]) {
    await this.hydrate();
    this.checkActiveAccount();
    const attempts = candidates.map((candidate) =>
      attemptSchema.parse({ ...candidate, reflection: null }),
    );
    const current = this.store.getState().journal.records;
    for (const attempt of attempts) {
      const old = current[attempt.id]?.attempt;
      if (
        old &&
        (!sameHistoricalContext(old, attempt) ||
          old.instruction !== attempt.instruction)
      )
        throw new ApiError('CONFLICT');
    }
    this.update((journal) => {
      for (const attempt of attempts) {
        if (journal.records[attempt.id]) continue;
        journal.records[attempt.id] = {
          attempt,
          version: 1,
          phoneVersion: 0,
          serverVersion: 0,
          serverRevision: 0,
          created: false,
          rejected: null,
        };
      }
      journal.generation++;
    });
    if (!(await this.persist())) throw new ApiError('STORAGE');
  }
  async mergeSyncedJournal(
    entries: LocalJournalEntry[],
    alternatives: LocalJournalEntry[],
    replacements: LocalJournalEntry[] = [],
  ) {
    await this.hydrate();
    await this.ensureLocalJournal();
    this.checkActiveAccount();
    await this.localJournal.mergeSynced(entries, alternatives, replacements);
    this.checkCurrentAccount();
    await this.refreshLocalJournal();
  }
  async clearData() {
    await this.hydrate();
    this.checkActiveAccount();
    this.clearing = true;
    this.sender.stop();
    try {
      await Promise.allSettled([
        ...this.saving.values(),
        ...[...this.reflectionSubmissions.values()].map((item) => item.work),
      ]);
      await this.localJournal.clear();
      this.legacyJournalSource = null;
      this.reflectionSubmissions.clear();
      this.update((journal) =>
        Object.assign(journal, emptyJournal(this.accountId)),
      );
      this.store.setState({
        localEntries: {},
        warning: null,
        flowAttemptId: null,
      });
      if (!(await this.persist())) throw new ApiError('STORAGE');
    } finally {
      this.clearing = false;
    }
  }
  private async refreshLocalJournal() {
    const entries = await this.localJournal.list();
    if (!this.disposed && this.accountCurrent)
      this.store.setState({
        localEntries: Object.fromEntries(
          entries.map((entry) => [entry.id, journalAttempt(entry)]),
        ),
      });
  }
  private saveSubmission(attemptId: string, id: string): Promise<Attempt> {
    const work = (async () => {
      const saved = await this.persist();
      this.checkActiveAccount();
      if (!saved) {
        if (this.store.getState().dataMode !== 'legacy')
          throw new ApiError('STORAGE');
        // Exceptional path uses the same ordered sender and stable identities.
        await this.sender.flush(attemptId);
        this.updateWarning();
      }
      this.kickSync();
      this.checkActiveAccount();
      return this.getAttempt(attemptId)!;
    })();
    this.saving.set(id, work);
    // The caller receives failures; cleanup owns no independent rejection.
    void work.finally(() => this.saving.delete(id)).catch(() => {});
    return work;
  }
  async correctReflection(
    failedSubmissionId: string,
    newSubmissionId: string,
    reflection: PatchAttempt['reflection'],
  ): Promise<Attempt> {
    const receipt =
      this.store.getState().journal.submissions[failedSubmissionId];
    if (!receipt) throw new ApiError('INVALID_REQUEST');
    return this.submitReflection(
      receipt.attemptId,
      newSubmissionId,
      reflection,
    );
  }
  setAccountCurrent(current: boolean): void {
    if (this.accountCurrent === current) return;
    this.accountCurrent = current;
    const generation = ++this.accountGeneration;
    this.localJournal.setActive(current);
    if (current) {
      // A native commit can finish in its original partition after that account
      // was parked. Re-read on ownership return so accepted writing becomes
      // visible without a process restart. Foreground alone does not reread it.
      void this.reloadReturnedJournal(generation);
    }
  }
  private async reloadReturnedJournal(generation: number): Promise<void> {
    const isCurrent = () =>
      !this.disposed &&
      this.accountCurrent &&
      this.accountGeneration === generation;
    try {
      await this.hydrate();
      if (!isCurrent()) return;
      await this.ensureLocalJournal();
      const entries = await this.localJournal.list();
      if (isCurrent())
        this.store.setState({
          localEntries: Object.fromEntries(
            entries.map((entry) => [entry.id, journalAttempt(entry)]),
          ),
        });
    } catch {
      if (!isCurrent()) return;
      // Keep the previous visible records. A later explicit private operation
      // retries preparation, but an unreadable original envelope must never be
      // reclassified as a safe empty source merely because this read failed.
      if (!this.store.getState().hydrationError) {
        this.protectionBeforePrivateFailure = this.persistence.protected;
        this.privatePreservationFailed = true;
        this.persistence.protected = true;
      }
      this.store.setState({
        hydrationError: 'unreadable',
        localJournalReady: false,
      });
    }
  }
  setEnvironment(environment: { online: boolean; active: boolean }): void {
    if (this.disposed) return;
    const previous = this.store.getState();
    this.store.setState(environment);

    if (
      (previous.active && !environment.active) ||
      (previous.online && !environment.online)
    ) {
      this.sender.stop();
    }
    this.updateWarningCause();
    this.kickSync();
  }
  resumeAuthentication(): void {
    this.checkActiveAccount();
    this.update((journal) => {
      for (const operation of journal.operations)
        if (operation.state === 'auth') operation.state = 'pending';
    });
    this.kickSync();
  }
  dismissWarning(): void {
    this.store.setState((state) => ({
      warning: state.warning
        ? { ...state.warning, visible: false, dismissed: true }
        : null,
    }));
  }
  dispose(): void {
    this.disposed = true;
    this.store.setState({ active: false });
    this.sender.stop();
    this.localJournal.stop();
  }
  async erase(): Promise<void> {
    this.dispose();
    // Drain accepted writes before removal, including hydration's quarantine copy.
    if (this.hydration) await this.hydration;
    await Promise.allSettled([...this.saving.values()]);
    await Promise.allSettled(
      [...this.reflectionSubmissions.values()].map((item) => item.work),
    );
    await this.localJournal.deleteOwned();
    await this.persistence.stopWrites();
    await this.catalogWrites;
    await this.deckPreferences.stop();
    const keys = this.options.storage.getAllKeys;
    if (!keys) throw new ApiError('STORAGE');
    for (const key of await keys.call(this.options.storage))
      if (key.startsWith(`${this.key}:`))
        await this.options.storage.removeItem(key);
    this.legacyJournalSource = null;
    this.store.setState({
      journal: emptyJournal(this.accountId),
      localEntries: {},
      catalog: null,
      warning: null,
      flowAttemptId: null,
    });
  }
  captureAggregateFence(): number | null {
    const journal = this.store.getState().journal;
    return journal.operations.some(
      (operation) =>
        operation.kind === 'create' &&
        operation.state !== 'acknowledged' &&
        !journal.records[operation.attemptId]?.rejected,
    )
      ? null
      : journal.generation;
  }
  async acceptSummary(data: ProgressSummary, fence: number): Promise<boolean> {
    const parsed = progressSummarySchema.parse(data);
    if (
      this.disposed ||
      !this.store.getState().active ||
      this.captureAggregateFence() !== fence ||
      parsed.today !== this.store.getState().period.today ||
      parsed.timeZone !== this.store.getState().period.timeZone
    )
      return false;
    this.update((journal) => {
      journal.summary = parsed;
      journal.summaryAdditions = [];
      journal.calendarAdditions = journal.calendarAdditions.filter(
        (id) =>
          journal.records[id]!.attempt.activityDate.slice(0, 7) ===
          this.store.getState().period.today.slice(0, 7),
      );
    });
    await this.persist();
    await this.prune();
    return true;
  }
  async acceptCalendar(
    data: ProgressCalendar,
    timeZone: string,
    fence: number,
  ): Promise<boolean> {
    const parsed = progressCalendarSchema.parse(data);
    if (
      this.disposed ||
      !this.store.getState().active ||
      this.captureAggregateFence() !== fence
    )
      return false;
    const period = this.store.getState().period;
    if (
      parsed.month !== period.today.slice(0, 7) ||
      timeZone !== period.timeZone
    )
      return true;
    this.update((journal) => {
      journal.calendar = { data: parsed, timeZone };
      journal.calendarBaseline = journal.calendar;
      journal.calendarAdditions = journal.calendarAdditions.filter(
        (id) =>
          journal.records[id]!.attempt.activityDate.slice(0, 7) !==
          parsed.month,
      );
    });
    await this.persist();
    await this.prune();
    return true;
  }
  async acceptTodayPage(
    data: ProgressDayResponse,
    timeZone: string,
    append = false,
  ): Promise<void> {
    let parsed = progressDayResponseSchema.parse(data);
    const period = this.store.getState().period;
    if (
      this.disposed ||
      !this.store.getState().active ||
      parsed.date !== period.today ||
      timeZone !== period.timeZone
    )
      return;
    const privateEntries = parsed.entries.filter((entry) => entry.reflection);
    if (privateEntries.length) {
      await this.localJournal.mergeLegacy(
        privateEntries.map((entry) => journalEntry(this.accountId, entry)),
      );
      this.checkActiveAccount();
      await this.refreshLocalJournal();
    }
    parsed = {
      ...parsed,
      entries: parsed.entries.map((entry) => ({ ...entry, reflection: null })),
    };
    this.update((journal) => {
      const previous =
        append &&
        journal.today?.data.date === parsed.date &&
        journal.today.timeZone === timeZone
          ? journal.today.data.entries
          : [];
      const entries = new Map(previous.map((entry) => [entry.id, entry]));
      for (const entry of parsed.entries) {
        entries.set(
          entry.id,
          preserveNewerReflection(entry, entries.get(entry.id)),
        );
      }
      // A first-page refresh must retain downloaded later pages and newer
      // reflection revisions. Local pending versions are overlaid by selectors.
      const cached = journal.today;
      if (cached?.data.date === parsed.date && cached.timeZone === timeZone)
        for (const entry of cached.data.entries) {
          const fresh = entries.get(entry.id);
          entries.set(
            entry.id,
            fresh ? preserveNewerReflection(fresh, entry) : entry,
          );
        }
      journal.today = {
        timeZone,
        data: {
          ...parsed,
          entries: [...entries.values()].sort(
            (a, b) =>
              a.startedAt.localeCompare(b.startedAt) ||
              a.id.localeCompare(b.id),
          ),
          nextCursor:
            !append &&
            cached?.data.entries.length &&
            cached.data.entries.length > parsed.entries.length
              ? cached.data.nextCursor
              : parsed.nextCursor,
        },
      };
    });
    await this.persist();
  }
  async rollover(today: string, timeZone: string): Promise<void> {
    periodSchema.parse({ today, timeZone });
    this.store.setState({ period: { today, timeZone } });
    const journal = this.store.getState().journal;
    if (
      (journal.today &&
        (journal.today.data.date !== today ||
          journal.today.timeZone !== timeZone)) ||
      (journal.calendarBaseline &&
        (journal.calendarBaseline.data.month !== today.slice(0, 7) ||
          journal.calendarBaseline.timeZone !== timeZone)) ||
      (journal.calendar &&
        (journal.calendar.data.month !== today.slice(0, 7) ||
          journal.calendar.timeZone !== timeZone))
    ) {
      this.update((value) => {
        if (
          value.today?.data.date !== today ||
          value.today.timeZone !== timeZone
        )
          value.today = null;
        if (
          value.calendar?.data.month !== today.slice(0, 7) ||
          value.calendar.timeZone !== timeZone
        )
          value.calendar = null;
        if (
          value.calendarBaseline?.data.month !== today.slice(0, 7) ||
          value.calendarBaseline.timeZone !== timeZone
        )
          value.calendarBaseline = null;
      });
      await this.persist();
    }
    await this.prune();
  }
  async setFlowAttempt(id: string | null): Promise<void> {
    this.store.setState({ flowAttemptId: id });
    await this.prune();
  }
  private async prune() {
    const state = this.store.getState();
    if (state.dataMode !== 'legacy') return;
    const ids = Object.entries(state.journal.records)
      .filter(
        ([id, record]) =>
          record.created &&
          !record.rejected &&
          record.serverVersion === record.version &&
          record.phoneVersion === record.version &&
          record.attempt.activityDate !== state.period.today &&
          id !== state.flowAttemptId &&
          !state.journal.operations.some(
            (operation) => operation.attemptId === id,
          ) &&
          !state.journal.summaryAdditions.includes(id) &&
          !state.journal.calendarAdditions.includes(id),
      )
      .map(([id]) => id);
    if (!ids.length) return;
    this.update((journal) => {
      for (const id of ids) delete journal.records[id];
      for (const [id, receipt] of Object.entries(journal.submissions))
        if (ids.includes(receipt.attemptId)) delete journal.submissions[id];
    });
    await this.persist();
  }
  private update(work: (journal: Journal) => void): void {
    const journal = cloneJournal(this.store.getState().journal);
    work(journal);
    this.persistence.dirty = true;
    this.store.setState({ journal });
  }
  private persist(): Promise<boolean> {
    return this.persistence.persist();
  }
  private checkCurrentAccount(): void {
    if (this.disposed || !this.accountCurrent)
      throw new ApiError('ACCOUNT_CHANGED');
  }
  private checkActiveAccount(): void {
    this.checkCurrentAccount();
    if (this.clearing || !this.store.getState().active)
      throw new ApiError('ACCOUNT_CHANGED');
  }
  private updateWarningCause(): void {
    const state = this.store.getState();
    if (state.warning)
      this.store.setState({
        warning: {
          ...state.warning,
          storageFull: this.persistence.storageFull,
          online: state.online,
        },
      });
  }
  private updateWarning(): void {
    const state = this.store.getState();
    if (endangered(state.journal)) {
      if (!state.warning)
        this.store.setState({
          warning: {
            visible: true,
            dismissed: false,
            episode: ++this.episode,
            storageFull: this.persistence.storageFull,
            online: state.online,
          },
        });
    } else if (state.warning) {
      this.store.setState({
        warning: null,
        recoverySequence: state.recoverySequence + 1,
      });
    }
    this.updateWarningCause();
  }
}
