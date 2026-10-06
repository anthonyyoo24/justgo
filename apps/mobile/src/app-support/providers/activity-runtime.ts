import { createStore } from 'zustand/vanilla';
import type { AccountClient } from '../../lib/account-client';
import { AccountRepositories } from '../../data/activity/accounts';
import { AccountRepository } from '../../data/activity/repository';
import type { JournalStorage } from '../../data/activity/model';
import { createJournalTransport } from '../../data/activity/transport';

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
  constructor(client: AccountClient, storage: JournalStorage) {
    this.accounts = new AccountRepositories(
      (accountId) =>
        new AccountRepository({
          accountId,
          storage,
          transport: createJournalTransport(client, accountId),
          today: new Intl.DateTimeFormat('en-CA').format(new Date()),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
    );
  }
  changeAccount(accountId: string | null) {
    const repository = this.accounts.activate(accountId, this.environment);
    if (repository !== this.getRepository()) this.authenticationPending = null;
    this.store.setState({ repository });
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
    this.environment = environment;
    this.getRepository()?.setEnvironment(environment);
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
    this.accounts.dispose();
    this.authenticationPending = null;
    this.store.setState({ repository: null });
  }
}
