import { createStore } from 'zustand/vanilla';
import type { AccountClient } from '../../lib/network/account-client';
import { AccountRepositories } from '../../data/activity/accounts';
import { AccountRepository } from '../../data/activity/repository';
import {
  systemClock,
  type JournalClock,
  type JournalStorage,
} from '../../data/activity/model';
import { createJournalTransport } from '../../data/activity/sync/transport';

export class ActivityRuntime {
  private channel = 'activity';
  get toastChannel() {
    return this.channel;
  }
  setToastChannel(channel: string) {
    this.channel = channel;
  }
  readonly store = createStore<{ repository: AccountRepository | null }>(
    () => ({ repository: null }),
  );
  getRepository = () => this.store.getState().repository;
  private readonly accounts: AccountRepositories;
  private authenticationPending: AccountRepository | null = null;
  private environment = { active: true, online: true };
  private readonly clock: JournalClock;
  private readonly timeZone: () => string;
  private periodTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  constructor(
    client: AccountClient,
    storage: JournalStorage,
    options: { clock?: JournalClock; timeZone?: () => string } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.timeZone =
      options.timeZone ??
      (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    this.accounts = new AccountRepositories(
      (accountId) =>
        new AccountRepository({
          accountId,
          storage,
          transport: createJournalTransport(client, accountId),
          ...this.currentPeriod(),
          clock: this.clock,
        }),
    );
  }
  private currentPeriod() {
    const timeZone = this.timeZone();
    return {
      today: new Intl.DateTimeFormat('en-CA', { timeZone }).format(
        this.clock.now(),
      ),
      timeZone,
    };
  }
  private clearPeriodTimer() {
    if (this.periodTimer !== undefined)
      this.clock.clearTimeout(this.periodTimer);
    this.periodTimer = undefined;
  }
  private refreshPeriod(repository: AccountRepository | null) {
    this.clearPeriodTimer();
    if (!repository || this.disposed) return;
    const next = this.currentPeriod();
    const previous = repository.store.getState().period;
    if (previous.today !== next.today || previous.timeZone !== next.timeZone)
      // Rollover owns cache invalidation/persistence; retain submissions on failure.
      void repository.rollover(next.today, next.timeZone).catch(() => {
        if (this.getRepository() === repository)
          repository.store.setState({ coordinatorError: 'UNAVAILABLE' });
      });
    if (!this.environment.active) return;
    // Align to minute boundaries, including local midnight. Re-read the clock
    // and zone so DST, travel and suspended callbacks do not accumulate drift.
    const timer = this.clock.setTimeout(
      () => {
        if (this.periodTimer !== timer || this.getRepository() !== repository)
          return;
        this.periodTimer = undefined;
        this.refreshPeriod(repository);
      },
      60_000 - (this.clock.now() % 60_000),
    );
    this.periodTimer = timer;
  }
  changeAccount(accountId: string | null) {
    if (this.disposed) return;
    const repository = this.accounts.activate(accountId, this.environment);
    if (repository !== this.getRepository()) this.authenticationPending = null;
    this.store.setState({ repository });
    this.refreshPeriod(repository);
    // Repository hydration owns read/quarantine failures and exposes them to UI.
    if (repository)
      void repository
        .hydrate()
        .then(() => {
          if (
            this.getRepository() === repository &&
            this.authenticationPending === repository
          )
            this.resumeAuthentication();
        })
        .catch(() => {});
  }
  setEnvironment(environment: { active: boolean; online: boolean }) {
    if (this.disposed) return;
    this.environment = environment;
    this.getRepository()?.setEnvironment(environment);
    this.refreshPeriod(this.getRepository());
    if (
      environment.active &&
      this.getRepository() === this.authenticationPending
    )
      this.resumeAuthentication();
  }
  resumeAuthentication() {
    const repository = this.getRepository();
    if (!repository) return;
    const state = repository.store.getState();
    if (!state.active || !state.ready) {
      this.authenticationPending = repository;
      return;
    }
    repository.resumeAuthentication();
    this.authenticationPending = null;
  }
  dispose() {
    this.disposed = true;
    this.clearPeriodTimer();
    this.accounts.dispose();
    this.authenticationPending = null;
    this.store.setState({ repository: null });
  }
}
