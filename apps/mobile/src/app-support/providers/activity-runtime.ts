import { createStore } from 'zustand/vanilla';
import { randomUUID } from 'expo-crypto';
import {
  AccountClient,
  type AccountSession,
} from '../../lib/network/account-client';
import { AccountRepositories } from '../../data/activity/accounts';
import { AccountRepository } from '../../data/activity/repository';
import {
  systemClock,
  type JournalClock,
  type JournalStorage,
} from '../../data/activity/model';
import { createJournalTransport } from '../../data/activity/sync/transport';
import { clearExportFiles } from '../../platform/export/export-file';
import { clearBackupFiles } from '../../platform/backup/backup-file';
import { CloudDataCoordinator } from '../../data/cloud/coordinator';
import { createDataSyncTransport } from '../../data/cloud/transport';
import { createHttpClient, ApiError } from '../../lib/network/http';
import { iCloudSync } from '../../platform/icloud/icloud-sync';
import type { ICloudCollection } from '../../platform/icloud/model';
import { ICloudDataCoordinator } from '../../data/cloud/icloud-coordinator';
import type { RestorableData } from '../../data/backup/data-backup';

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
  private readonly cloud = new Map<string, CloudDataCoordinator>();
  private readonly apple = new Map<string, ICloudDataCoordinator>();
  private mode: 'legacy' | 'local' | 'cloud' = 'legacy';
  private collectionKind: 'guest' | 'account' = 'account';
  private adopting = false;
  private pendingGuestId: string | null = null;
  setPendingGuestAdoption(id: string | null) {
    this.pendingGuestId = id;
  }
  constructor(
    private readonly client: AccountClient,
    private readonly storage: JournalStorage,
    private readonly options: {
      clock?: JournalClock;
      timeZone?: () => string;
      managed?: boolean;
      url?: string | undefined;
    } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    // Interrupted private temporary files are never needed for account recovery.
    void Promise.all([
      Promise.resolve().then(clearExportFiles),
      Promise.resolve().then(clearBackupFiles),
    ]).catch(() => {});
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
          dataMode: options.managed ? 'local' : 'legacy',
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
        if (this.options.managed && this.environment.online)
          void repository.synchronize().catch(() => {});
      },
      60_000 - (this.clock.now() % 60_000),
    );
    this.periodTimer = timer;
  }
  changeAccount(
    accountId: string | null,
    mode: 'legacy' | 'local' | 'cloud' = 'legacy',
    kind: 'guest' | 'account' = 'account',
  ) {
    if (this.disposed) return;
    if (accountId !== this.getRepository()?.accountId || mode !== this.mode) {
      for (const sync of this.cloud.values()) sync.stop();
      for (const sync of this.apple.values()) sync.stop();
    }
    this.mode = mode;
    this.collectionKind = kind;
    const repository = this.accounts.activate(accountId, this.environment);
    if (repository && this.options.managed) {
      const cloud =
        this.cloud.get(repository.accountId) ??
        new CloudDataCoordinator(
          repository,
          this.storage,
          createDataSyncTransport(this.client, repository.accountId),
        );
      this.cloud.set(repository.accountId, cloud);
      if (mode === 'cloud') cloud.start();
      else cloud.stop();
      const collection: ICloudCollection =
        kind === 'guest' ? 'guest' : `account:${repository.accountId}`;
      const apple =
        this.apple.get(repository.accountId) ??
        new ICloudDataCoordinator(
          repository,
          this.storage,
          iCloudSync,
          collection,
        );
      this.apple.set(repository.accountId, apple);
      apple.start();
      repository.setDataSynchronizer(() =>
        this.synchronizeData(repository, cloud, apple),
      );
      repository.setDataMode(mode);
    }
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
  private async synchronizeData(
    repository: AccountRepository,
    cloud: CloudDataCoordinator,
    apple: ICloudDataCoordinator,
  ) {
    if (this.adopting || this.pendingGuestId === repository.accountId) return;
    if (
      await this.storage.getItem(
        `justgo:v1:${repository.accountId}:delete-all-pending`,
      )
    )
      return;
    if (repository.store.getState().dataMode === 'cloud')
      await cloud.synchronize();
    if ((await iCloudSync.status()).enabled) await apple.synchronize();
  }
  getICloudCoordinator = () => {
    const owner = this.getRepository()?.accountId;
    return owner ? (this.apple.get(owner) ?? null) : null;
  };
  mergeGuestData = async (
    guestId: string,
    accountId: string,
    session: AccountSession,
  ) => {
    if (session.userId !== accountId) throw new ApiError('ACCOUNT_CHANGED');
    const selectedAtStart = this.getRepository();
    const guest = this.accounts.get(guestId);
    this.pendingGuestId = guestId;
    await guest.hydrate();
    if (guest.store.getState().hydrationError) throw new ApiError('STORAGE');
    if (guest.store.getState().dataDeletionPending)
      throw new ApiError('UNAVAILABLE');
    const sourceApple =
      this.apple.get(guestId) ??
      new ICloudDataCoordinator(guest, this.storage, iCloudSync, 'guest');
    sourceApple.stop();
    guest.setAccountCurrent(true);
    const target = this.accounts.get(accountId);
    const previousCloud = this.cloud.get(accountId);
    const previousApple = this.apple.get(accountId);
    previousCloud?.stop();
    previousApple?.stop();
    const client = new AccountClient(createHttpClient(this.options.url), {
      current: () => session,
      renew: () => Promise.reject(new ApiError('UNAUTHORIZED')),
      reject: () => {},
    });
    client.changeAccount(accountId);
    target.setDataSynchronizer(null);
    target.setAccountCurrent(true);
    target.setDataMode('cloud');
    const sync = new CloudDataCoordinator(
      target,
      this.storage,
      createDataSyncTransport(client, accountId),
    );
    this.adopting = true;
    let copied = false;
    try {
      // An already accepted sync can still finish a durable clear after stop.
      // Drain it before copying, then discard its cached pre-adoption metadata.
      await Promise.all([
        sourceApple.settled(),
        previousCloud?.settled(),
        previousApple?.settled(),
      ]);
      this.cloud.delete(accountId);
      this.apple.delete(accountId);
      guest.setEnvironment({ active: true, online: true });
      target.setEnvironment({ active: true, online: true });
      await guest.withDataMigration(async () => {
        await sourceApple.handoverGuest(accountId, async (snapshot) => {
          if (this.getRepository() !== selectedAtStart)
            throw new ApiError('ACCOUNT_CHANGED');
          await sync.adoptData({
            attempts: snapshot.attempts,
            journal: {
              entries: snapshot.journal.entries.map((entry) => ({
                ...entry,
                accountId,
              })),
              alternatives: snapshot.journal.alternatives.map((entry) => ({
                ...entry,
                accountId,
              })),
            },
          });
          if (this.getRepository() !== selectedAtStart)
            throw new ApiError('ACCOUNT_CHANGED');
        });
        if (this.getRepository() !== selectedAtStart)
          throw new ApiError('ACCOUNT_CHANGED');
        // Keep the old source fenced through the controller's durable switch.
        // A failed identity write reconciles/reactivates it for a safe retry.
        guest.setAccountCurrent(false);
        copied = true;
      });
    } finally {
      this.adopting = false;
      sync.stop();
      client.changeAccount(null);
      target.setDataMode('local');
      target.setAccountCurrent(false);
      target.setEnvironment({ active: false, online: false });
      const selected = this.getRepository();
      if ((selected === guest && !copied) || selected === target) {
        selected.setAccountCurrent(true);
        selected.setEnvironment(this.environment);
      }
      if (selected !== guest) {
        guest.setAccountCurrent(false);
        guest.setEnvironment({ active: false, online: false });
      }
    }
  };
  retireGuestData = async (guestId: string) => {
    const cloud = this.cloud.get(guestId);
    const apple = this.apple.get(guestId);
    cloud?.stop();
    apple?.stop();
    await Promise.all([cloud?.settled(), apple?.settled()]);
    await this.accounts.erase(guestId);
    this.cloud.delete(guestId);
    this.apple.delete(guestId);
  };
  async deleteAllData() {
    const repository = this.getRepository();
    if (!repository) throw new ApiError('UNAUTHORIZED');
    if (this.collectionKind === 'account' && this.mode !== 'cloud')
      throw new ApiError('UNAUTHORIZED');
    const key = `justgo:v1:${repository.accountId}:delete-all-pending`;
    const savedIntent = await this.storage.getItem(key);
    const intentId =
      savedIntent && savedIntent !== 'true' ? savedIntent : randomUUID();
    await this.storage.setItem(key, intentId);
    repository.store.setState({ dataDeletionPending: true });
    this.cloud.get(repository.accountId)?.stop();
    this.apple.get(repository.accountId)?.stop();
    if (this.mode === 'cloud')
      await this.cloud.get(repository.accountId)?.deleteData(intentId);
    const apple = this.apple.get(repository.accountId);
    apple?.start();
    await apple?.deletePreviouslySyncedData(intentId);
    await repository.clearData();
    await this.storage.removeItem(key);
    repository.store.setState({ dataDeletionPending: false });
    this.client.queries.clear();
    if (this.mode === 'cloud') this.cloud.get(repository.accountId)?.start();
    this.apple.get(repository.accountId)?.start();
  }
  async importData(data: RestorableData) {
    const repository = this.getRepository();
    if (
      !repository ||
      data.owner.id !== repository.accountId ||
      !this.client.ownsCollection(repository.accountId)
    )
      throw new ApiError('ACCOUNT_CHANGED');
    if (this.collectionKind === 'account' && this.mode !== 'cloud')
      throw new ApiError('UNAUTHORIZED');
    if (
      await this.storage.getItem(
        `justgo:v1:${repository.accountId}:delete-all-pending`,
      )
    )
      throw new ApiError('UNAVAILABLE');
    const apple = this.apple.get(repository.accountId);
    apple?.stop();
    try {
      if (this.mode === 'cloud') {
        const cloud = this.cloud.get(repository.accountId);
        if (!cloud) throw new ApiError('UNAVAILABLE');
        await cloud.importData(data);
      } else {
        await repository.mergeCompletions(data.attempts);
        await repository.restoreJournal(
          data.journal.entries,
          data.journal.alternatives,
        );
      }
      if (this.getRepository() !== repository)
        throw new ApiError('ACCOUNT_CHANGED');
    } finally {
      if (this.getRepository() === repository) apple?.start();
    }
  }
  setEnvironment(environment: { active: boolean; online: boolean }) {
    if (this.disposed) return;
    this.environment = environment;
    const owner = this.getRepository()?.accountId;
    if (owner) {
      if (!environment.active || !environment.online) {
        this.cloud.get(owner)?.stop();
        this.apple.get(owner)?.stop();
      } else {
        if (this.mode === 'cloud') this.cloud.get(owner)?.start();
        this.apple.get(owner)?.start();
      }
    }
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
  deleteAccount = async (accountId: string) => {
    this.cloud.get(accountId)?.stop();
    const apple = this.apple.get(accountId);
    if (apple) {
      apple.start();
      await apple.deletePreviouslySyncedAccount();
    }
    apple?.stop();
    this.apple.delete(accountId);
    this.cloud.delete(accountId);
    if (this.getRepository()?.accountId === accountId) {
      this.clearPeriodTimer();
      this.authenticationPending = null;
      this.store.setState({ repository: null });
    }
    await this.accounts.erase(accountId);
    await clearExportFiles();
    clearBackupFiles();
  };
  dispose() {
    this.disposed = true;
    this.clearPeriodTimer();
    this.accounts.dispose();
    for (const sync of this.cloud.values()) sync.stop();
    for (const sync of this.apple.values()) sync.stop();
    this.authenticationPending = null;
    this.store.setState({ repository: null });
  }
}
