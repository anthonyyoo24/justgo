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
} from '@justgo/contracts';
import { ApiError } from '../../lib/http';
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
import { addCompletion, addReflection, correctReflection } from './submissions';
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
};

export class AccountRepository {
  readonly store;
  readonly accountId: string;
  private readonly key: string;
  private readonly clock: JournalClock;
  private readonly sender: JournalSender;
  private readonly persistence: JournalPersistence;
  private disposed = false;
  private hydration: Promise<void> | null = null;
  private catalogWrites: Promise<void> = Promise.resolve();

  private episode = 0;

  private saving = new Map<string, Promise<Attempt>>();
  constructor(private readonly options: AccountRepositoryOptions) {
    journalSchema.parse(emptyJournal(options.accountId));
    periodSchema.parse({ today: options.today, timeZone: options.timeZone });
    this.accountId = options.accountId;
    this.key = `justgo:v1:${options.accountId}`;
    this.clock = options.clock ?? systemClock;
    this.store = createStore<JournalState>(() => ({
      ready: false,
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
    this.store.setState({ ready: true });
    await this.rollover(
      this.store.getState().period.today,
      this.store.getState().period.timeZone,
    );
    if (!this.disposed) this.sender.kick();
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
    const value = this.store.getState().journal.records[id]?.attempt;
    return value ? attemptSchema.parse(value) : undefined;
  }
  async synchronize(): Promise<void> {
    await this.hydrate();
    await this.sender.flush();
  }
  hasCurrentAttempt(attempt: Attempt): boolean {
    const state = this.store.getState();
    if (!state.ready || !state.active) return false;
    const parsed = attemptSchema.parse(attempt);
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
    const parsed = attemptSchema.parse(attempt);
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
    this.sender.kick();
  }
  async complete(input: CreateAttempt, card: ChallengeCard): Promise<Attempt> {
    await this.hydrate();
    this.checkActiveAccount();
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
    const requested = patchAttemptSchema.parse({
      submissionId,
      expectedReflectionRevision: 0,
      reflection,
    }).reflection;
    if (requested.text !== undefined)
      requested.text = normalizeReflectionText(requested.text);
    const current = this.store.getState().journal.records[attemptId];
    if (!current) return Promise.reject(new ApiError('NOT_FOUND'));
    const duplicate = this.store.getState().journal.submissions[submissionId];
    if (duplicate) {
      if (
        duplicate.attemptId !== attemptId ||
        JSON.stringify(duplicate.reflection) !== JSON.stringify(requested)
      )
        throw new ApiError('CONFLICT');
      return this.saving.get(submissionId) ?? current.attempt;
    }
    if (this.store.getState().journal.records[submissionId])
      throw new ApiError('CONFLICT');
    this.update((journal) =>
      addReflection(journal, attemptId, submissionId, requested),
    );
    return this.saveSubmission(attemptId, submissionId);
  }
  private saveSubmission(attemptId: string, id: string): Promise<Attempt> {
    const work = (async () => {
      const saved = await this.persist();
      this.checkActiveAccount();
      if (!saved) {
        // Exceptional path uses the same ordered sender and stable identities.
        await this.sender.flush(attemptId);
        this.updateWarning();
      }
      this.sender.kick();
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
    await this.hydrate();
    this.checkActiveAccount();
    const requested = patchAttemptSchema.parse({
      submissionId: newSubmissionId,
      expectedReflectionRevision: 0,
      reflection,
    }).reflection;
    if (requested.text !== undefined)
      requested.text = normalizeReflectionText(requested.text);
    const journal = this.store.getState().journal;
    const duplicate = journal.submissions[newSubmissionId];
    if (duplicate) {
      if (
        journal.submissions[failedSubmissionId]?.attemptId !==
          duplicate.attemptId ||
        JSON.stringify(duplicate.reflection) !== JSON.stringify(requested)
      )
        throw new ApiError('CONFLICT');
      return (
        this.saving.get(newSubmissionId) ??
        this.getAttempt(duplicate.attemptId)!
      );
    }
    let attemptId = '';
    this.update((journal) => {
      attemptId = correctReflection(
        journal,
        failedSubmissionId,
        newSubmissionId,
        requested,
      );
    });
    return this.saveSubmission(attemptId, newSubmissionId);
  }
  setEnvironment(environment: { online: boolean; active: boolean }): void {
    if (this.disposed) return;
    const previous = this.store.getState();
    this.store.setState(environment);
    if (
      (previous.active && !environment.active) ||
      (previous.online && !environment.online)
    )
      this.sender.stop();
    this.updateWarningCause();
    this.sender.kick();
  }
  resumeAuthentication(): void {
    this.checkActiveAccount();
    this.update((journal) => {
      for (const operation of journal.operations)
        if (operation.state === 'auth') operation.state = 'pending';
    });
    this.sender.kick();
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
    const parsed = progressDayResponseSchema.parse(data);
    const period = this.store.getState().period;
    if (
      this.disposed ||
      !this.store.getState().active ||
      parsed.date !== period.today ||
      timeZone !== period.timeZone
    )
      return;
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
  private checkActiveAccount(): void {
    if (this.disposed || !this.store.getState().active)
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
