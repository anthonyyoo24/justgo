import { getRandomValues, randomUUID } from 'expo-crypto';
import {
  credentialsResponseSchema,
  accountDeletionResponseSchema,
  devicesResponseSchema,
  okSchema,
  receivingTransferCancelResponseSchema,
  secretSchema,
  sessionResponseSchema,
  transferCodeSchema,
  transferInspectionResponseSchema,
  transferVerificationSchema,
  type TransferInspectionResponse,
  transferResponseSchema,
  type SessionProposal,
  type SessionResponse,
  type TransferResponse,
} from '@justgo/contracts';
import type { z } from 'zod';
import { IdentityClientError, type IdentityApi } from './api';
import type {
  CredentialVault,
  DeviceState,
  StoredCredential,
  TransferIntent,
} from './storage';
import { ApiError, type HttpMethod } from '../../lib/network/http';
import { Deadline } from '../../lib/network/deadline';
import { removeDeletedCredentials } from './deletion/cleanup';
import { resumeAccountDeletion } from './deletion/workflow';

type Snapshot = {
  busy: boolean;
  busyInBackground: boolean;
  initialized: boolean;
  hasPending: boolean;
  cancellationPending: boolean;
  account: SessionResponse | null;
  message: string;
  credentials: { id: string }[];
  key: string | null;
  transfer: (TransferResponse & { code: string }) | null;
  inspection: (TransferInspectionResponse & { code: string }) | null;
  devices: z.infer<typeof devicesResponseSchema>['devices'];
  recoveryKeys: z.infer<typeof credentialsResponseSchema>['credentials'];
  deletionStatus: 'pending' | 'cleanup' | 'deleted' | null;
};
type Random = { id: () => string; secret: () => string };
type OperationOptions = { background?: boolean; resumeDeletion?: boolean };
const secureRandom: Random = {
  id: randomUUID,
  secret: () =>
    Array.from(getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join(''),
};
const messages: Record<string, string> = {
  NETWORK:
    'Couldn’t connect. Retry when you’re online; your pending action is saved.',
  STORAGE: 'Secure storage is unavailable. Unlock your iPhone and retry.',
  CREDENTIAL_REJECTED:
    'This recovery credential is no longer valid. Try another recovery method.',
  SESSION_REVOKED:
    'This device session was revoked. Use a valid recovery method to continue.',
  SESSION_EXPIRED: 'Your session expired. Recover your account to continue.',
  UNAUTHORIZED:
    'Your session could not be verified. Use a recovery method to continue.',
  TRANSFER_PENDING:
    'Waiting for approval on your existing device. Enter the six digits from this device on your existing device.',
  TRANSFER_EXPIRED:
    'This transfer expired. Start a new transfer on this device.',
  RATE_LIMITED: 'Too many attempts. Wait 10 minutes before trying again.',
  CONFLICT:
    'This action no longer matches the saved request. Review your recovery options.',
  NOT_FOUND:
    'That recovery request wasn’t found. Check the code and try again.',
  INVALID_REQUEST:
    'Check the recovery key, transfer code or six verification digits and try again.',
  UNAVAILABLE: 'The account service is unavailable. Please retry shortly.',
  DELETION_UNAVAILABLE:
    'Account deletion is unavailable right now. Your account has not been deleted.',
  DELETION_REJECTED:
    'The deletion request could not be accepted. Your account has not been deleted.',
};
export class IdentityController {
  private operation: Deadline | null = null;
  private storageTail: Promise<unknown> = Promise.resolve();
  private running: Promise<void> | null = null;
  private cancellation: Promise<void> | null = null;
  private transferActive = false;
  private lastError: IdentityClientError | null = null;
  private sessionRefresh: Promise<{ userId: string; token: string }> | null =
    null;
  private data: DeviceState | null = null;
  private removeAccountData: ((userId: string) => Promise<void>) | null = null;
  setAccountDataRemover(remover: (userId: string) => Promise<void>) {
    this.removeAccountData = remover;
  }
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = {
    busy: false,
    busyInBackground: false,
    initialized: false,
    hasPending: false,
    cancellationPending: false,
    account: null,
    message: '',
    credentials: [],
    key: null,
    transfer: null,
    inspection: null,
    devices: [],
    recoveryKeys: [],
    deletionStatus: null,
  };
  constructor(
    readonly vault: CredentialVault,
    private readonly api: IdentityApi,
    private readonly random: Random = secureRandom,
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  currentSession = () => {
    const account = this.snapshot.account;
    const session = this.data?.session;
    return account && session && account.userId === session.info.userId
      ? { userId: account.userId, token: session.token }
      : null;
  };
  rejectSession = (token: string, code: 'SESSION_REVOKED' | 'UNAUTHORIZED') => {
    if (this.currentSession()?.token === token)
      this.update({
        account: null,
        devices: [],
        recoveryKeys: [],
        key: null,
        message: messages[code]!,
      });
  };
  /** Releases shared refresh waiters on timeout without abandoning saved recovery intent. */
  refreshSession = (failedToken: string) => {
    if (this.sessionRefresh) return this.sessionRefresh;
    const deadline = new Deadline();
    const userId = this.snapshot.account?.userId;
    let unsubscribe = () => {};
    const work = async () => {
      if (this.snapshot.busy)
        await deadline.wait(
          () =>
            new Promise<void>((resolve) => {
              unsubscribe = this.subscribe(() => {
                if (!this.snapshot.busy) resolve();
              });
            }),
        );
      deadline.check();
      if (this.snapshot.account?.userId !== userId)
        throw new IdentityClientError('ACCOUNT_CHANGED');
      if (this.currentSession()?.token === failedToken || this.data?.pending)
        await deadline.wait(() => this.retry({ background: true }));
      deadline.check();
      if (this.lastError) throw this.lastError;
      const session = this.currentSession();
      if (!session) throw new IdentityClientError('UNAUTHORIZED');
      return session;
    };
    const refresh = work().finally(() => {
      unsubscribe();
      deadline.dispose();
      if (this.sessionRefresh === refresh) this.sessionRefresh = null;
    });
    this.sessionRefresh = refresh;
    return refresh;
  };
  private request<T>(
    method: HttpMethod,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    token?: string,
  ) {
    const operation = this.operation!;
    return operation.wait(() =>
      this.api.request(method, path, schema, body, token, operation.signal),
    );
  }
  /** Native writes cannot be undone. Serialize storage even after the caller times out. */
  private storage<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.operation!;
    const pending = this.storageTail.then(() => {
      operation.check();
      return work();
    });
    this.storageTail = pending.catch(() => {});
    return operation.wait(() => pending);
  }
  private update(value: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((fn) => fn());
  }
  private async save(value: DeviceState) {
    try {
      await this.storage(() => this.vault.write(value));
      this.data = value;
      this.update({
        hasPending: value.pending !== null,
        cancellationPending: !!value.cancelledTransfers?.length,
      });
    } catch {
      // A timed-out native write may still finish; reread it before any later action.
      this.data = null;
      throw new IdentityClientError('STORAGE');
    }
  }
  private async credentials() {
    try {
      const values = await this.storage(() => this.vault.credentials());
      return values.filter(
        (value) => !this.data?.ignoredCredentialIds?.includes(value.id),
      );
    } catch {
      throw new IdentityClientError('STORAGE');
    }
  }
  private async add(credential: StoredCredential) {
    try {
      await this.storage(() => this.vault.add(credential));
    } catch {
      throw new IdentityClientError('STORAGE');
    }
  }
  private proposal(): SessionProposal {
    return {
      deviceId: this.data!.deviceId,
      sessionId: this.random.id(),
      sessionToken: this.random.secret(),
    };
  }
  private run(
    work: () => Promise<void>,
    options: OperationOptions = {},
    cancelling = false,
  ): Promise<void> {
    if (this.snapshot.busy || (this.cancellation && !cancelling))
      return Promise.resolve();
    const operation = new Deadline();
    this.operation = operation;
    this.lastError = null;
    const task = Promise.resolve().then(async () => {
      try {
        operation.check();
        await this.ensureData();
        if (this.data?.pending?.kind === 'delete' && !options.resumeDeletion)
          throw new IdentityClientError('CONFLICT');
        await work();
      } catch (error) {
        // Leaving a transfer preempts transport/storage waiters. Its dedicated
        // cancellation owns the outcome and any durable cleanup retry.
        if (error instanceof ApiError && error.code === 'ACCOUNT_CHANGED')
          return;
        const code =
          error instanceof IdentityClientError ? error.code : 'STORAGE';
        this.lastError = new IdentityClientError(code);
        if (
          [
            'SESSION_REVOKED',
            'SESSION_EXPIRED',
            'UNAUTHORIZED',
            'CREDENTIAL_REJECTED',
          ].includes(code) &&
          !(
            code === 'CREDENTIAL_REJECTED' &&
            this.data?.pending?.kind === 'transfer'
          )
        )
          this.update({ account: null, devices: [], recoveryKeys: [] });
        this.update({ message: messages[code] ?? messages.UNAVAILABLE! });
        if (code === 'NETWORK' && !this.data?.pending)
          this.update({
            message: 'Couldn’t connect. Check your connection and retry.',
          });
      } finally {
        operation.dispose();
        if (this.operation === operation) this.operation = null;
        if (this.running === task) this.running = null;
        this.update({
          busy: false,
          busyInBackground: false,
          initialized: true,
        });
      }
    });
    this.running = task;
    this.update({
      busy: true,
      busyInBackground: options.background === true,
      message: '',
      key: null,
    });
    return task;
  }
  private async ensureData() {
    if (this.data) return;
    try {
      this.data = await this.storage(() => this.vault.read());
      this.update({
        hasPending: this.data?.pending != null,
        deletionStatus:
          this.data?.pending?.kind === 'delete'
            ? this.data.pending.receipt
              ? 'cleanup'
              : 'pending'
            : this.data?.accountDeleted
              ? 'deleted'
              : null,
        cancellationPending: !!this.data?.cancelledTransfers?.length,
      });
    } catch {
      throw new IdentityClientError('STORAGE');
    }
    if (!this.data)
      await this.save({
        deviceId: this.random.id(),
        selectedId: null,
        session: null,
        pending: null,
        savedKey: null,
        registration: null,
      });
  }
  initialize = () =>
    this.run(
      async () => {
        await this.ensureData();
        // A deletion receipt or explicitly saved replacement proof must not be
        // overwritten by reconciliation of an unrelated abandoned transfer.
        if (
          this.data!.pending?.kind === 'delete' ||
          this.data!.accountDeleted
        ) {
          if (this.data!.pending) await this.resume();
          else {
            const credentials = await this.credentials();
            this.update({
              credentials: credentials.map((c) => ({ id: c.id })),
              message: 'Your account has been deleted.',
            });
          }
          return;
        }
        // A receiving transfer belongs to one visible app visit. A process
        // restart cancels its proposal rather than resuming the abandoned UI.
        const abandoned = this.data!.pending?.kind === 'transfer';
        const hadCancelledTransfers = !!this.data!.cancelledTransfers?.length;
        if (abandoned) await this.abandonTransfer();
        if ((await this.flushCancelledTransfers()) === 'redeemed') return;
        const credentials = await this.credentials();
        this.update({ credentials: credentials.map((c) => ({ id: c.id })) });
        if (this.data!.pending) {
          await this.resume();
          return;
        }
        if (this.data!.session) {
          await this.verify();
          return;
        }
        if (credentials.length === 1) {
          await this.prepareRecovery(credentials[0]!);
          return;
        }
        if (credentials.length > 1) {
          this.update({
            message:
              'More than one recovery credential is available. Choose the account to recover; accounts will stay separate.',
          });
          return;
        }
        if (
          abandoned ||
          hadCancelledTransfers ||
          this.data!.cancelledTransfers?.length ||
          this.data!.ignoredCredentialIds?.length
        ) {
          // Cancellation metadata is not a new installation. Keep the account
          // disconnected rather than silently replacing it.
          this.update({ message: 'Choose a recovery method to continue.' });
          return;
        }
        if (this.vault.kind === 'keychain') await this.newAccount();
      },
      { resumeDeletion: true },
    );
  private async newAccount() {
    const credential = { id: this.random.id(), secret: this.random.secret() };
    // Persist the complete pending intent first, then the synchronizing item, then call the API.
    await this.save({
      ...this.data!,
      selectedId: credential.id,
      session: null,
      savedKey: null,
      registration: null,
      pending: {
        kind: 'bootstrap',
        credentialId: credential.id,
        secret: credential.secret,
        proposal: this.proposal(),
      },
    });
    this.update({
      account: null,
      devices: [],
      recoveryKeys: [],
      transfer: null,
      inspection: null,
    });
    await this.resume();
  }
  createAccount = () =>
    this.run(async () => {
      await this.ensureData();
      await this.newAccount();
    });
  private async finish(
    info: SessionResponse,
    proposal: SessionProposal,
    credentialId: string,
  ) {
    if (
      info.deviceId !== proposal.deviceId ||
      info.sessionId !== proposal.sessionId
    )
      throw new IdentityClientError('UNAVAILABLE');
    const changingAccount = this.data!.session?.info.userId !== info.userId;
    await this.save({
      ...this.data!,
      selectedId: credentialId,
      session: { token: proposal.sessionToken, info },
      pending: null,
      accountDeleted: false,
      savedKey: changingAccount ? null : this.data!.savedKey,
      registration: changingAccount ? null : this.data!.registration,
      ignoredCredentialIds: this.data!.ignoredCredentialIds?.filter(
        (id) => id !== credentialId,
      ),
    });
    this.transferActive = false;
    this.update({
      account: info,
      deletionStatus: null,
      devices: [],
      recoveryKeys: [],
      transfer: null,
      message: this.snapshot.busyInBackground
        ? ''
        : 'Your account is connected.',
    });
    await this.loadLists();
  }
  private async resume() {
    const pending = this.data!.pending;
    if (!pending) return;
    if (pending.kind === 'delete') {
      await this.resumeDeletion();
      return;
    }
    if (pending.kind === 'transfer') {
      if (!this.transferActive) {
        await this.abandonTransfer();
        await this.flushCancelledTransfers();
        return;
      }
      const transfer = await this.request(
        'POST',
        '/transfers',
        transferResponseSchema,
        pending.input,
      );
      this.update({
        transfer: { ...transfer, code: pending.input.code },
        message:
          'Enter this transfer code on your existing device, then enter the six verification digits shown here.',
      });
      return;
    }
    if (pending.kind === 'renew') {
      const current = this.data!.session;
      if (!current) throw new IdentityClientError('UNAUTHORIZED');
      const info = await this.request(
        'POST',
        '/sessions',
        sessionResponseSchema,
        {
          kind: 'renewal',
          sessionId: pending.proposal.sessionId,
          sessionToken: pending.proposal.sessionToken,
        },
        current.token,
      );
      if (info.userId !== current.info.userId)
        throw new IdentityClientError('UNAVAILABLE');
      await this.finish(info, pending.proposal, this.data!.selectedId!);
      return;
    }
    if (pending.kind === 'bootstrap')
      await this.add({ id: pending.credentialId, secret: pending.secret });
    const credential = (await this.credentials()).find(
      (c) => c.id === pending.credentialId,
    );
    if (!credential) throw new IdentityClientError('STORAGE');
    const info = await this.request(
      'POST',
      '/sessions',
      sessionResponseSchema,
      {
        kind: pending.kind === 'bootstrap' ? 'bootstrap' : 'recovery',
        ...pending.proposal,
        credential: credential.secret,
      },
    );
    await this.finish(info, pending.proposal, credential.id);
  }
  retry = (options: OperationOptions = {}) => {
    // Foreground refresh has nothing to reconnect after completed deletion.
    // A pending replacement account must still resume with its saved proof.
    if (
      this.snapshot.deletionStatus === 'deleted' &&
      !this.data?.pending &&
      !this.data?.session
    )
      return Promise.resolve();
    return this.run(
      async () => {
        await this.ensureData();
        if (
          this.data!.pending?.kind !== 'delete' &&
          !this.data!.accountDeleted &&
          (await this.flushCancelledTransfers()) === 'redeemed'
        )
          return;
        if (this.data!.pending) await this.resume();
        else if (this.data!.session) await this.verify();
        else
          this.update({
            credentials: (await this.credentials()).map((c) => ({ id: c.id })),
            message: 'Choose a recovery method to continue.',
          });
      },
      { ...options, resumeDeletion: true },
    );
  };
  deleteAccount = () =>
    this.run(
      async () => {
        await this.ensureData();
        if (this.data!.pending?.kind === 'delete') return this.resumeDeletion();
        if (!this.data!.session || !this.snapshot.account)
          throw new IdentityClientError('UNAUTHORIZED');
        if (!this.vault.remove || !this.removeAccountData) {
          this.update({
            message: 'Update JustGO to delete your account securely.',
          });
          return;
        }
        // Refresh an expiring session before freezing the deletion proof.
        await this.verify();
        const session = this.data!.session;
        await this.save({
          ...this.data!,
          pending: {
            kind: 'delete',
            userId: session.info.userId,
            receipt: null,
          },
        });
        this.update({
          account: null,
          devices: [],
          recoveryKeys: [],
          transfer: null,
          inspection: null,
          deletionStatus: 'pending',
        });
        await this.resumeDeletion();
      },
      { resumeDeletion: true },
    );
  private async resumeDeletion() {
    try {
      await resumeAccountDeletion({
        read: () => this.data!,
        save: (value) => this.save(value),
        publish: (deletionStatus) =>
          this.update({
            account: null,
            devices: [],
            recoveryKeys: [],
            key: null,
            deletionStatus,
          }),
        request: (token) =>
          this.request(
            'DELETE',
            '/account',
            accountDeletionResponseSchema,
            { confirmation: 'delete-account' },
            token,
          ),
        clearData: (userId) => {
          if (!this.removeAccountData) throw new IdentityClientError('STORAGE');
          return this.storage(() => this.removeAccountData!(userId));
        },
        clearCredentials: (digests) =>
          this.storage(() => removeDeletedCredentials(this.vault, digests)),
      });
    } catch (error) {
      if (
        error instanceof IdentityClientError &&
        ['DELETION_UNAVAILABLE', 'DELETION_REJECTED'].includes(error.code)
      ) {
        // Only a definitive rejection releases the deletion fence. Reverify the
        // saved session before restoring account access, including after relaunch.
        try {
          await this.verify();
        } finally {
          this.update({ deletionStatus: null });
        }
      }
      throw error;
    }
    this.update({
      credentials: (await this.credentials()).map((c) => ({ id: c.id })),
      message: 'Your account has been deleted.',
    });
  }
  private async verify() {
    const session = this.data!.session!;
    try {
      const info = await this.request(
        'GET',
        '/sessions/current',
        sessionResponseSchema,
        undefined,
        session.token,
      );
      if (
        info.userId !== session.info.userId ||
        info.sessionId !== session.info.sessionId
      )
        throw new IdentityClientError('UNAVAILABLE');
      this.update({ account: info });
      if (Date.parse(info.expiresAt) - Date.now() < 24 * 60 * 60 * 1000) {
        await this.save({
          ...this.data!,
          pending: { kind: 'renew', proposal: this.proposal() },
        });
        await this.resume();
      } else await this.loadLists();
    } catch (error) {
      if (
        error instanceof IdentityClientError &&
        error.code === 'SESSION_EXPIRED'
      ) {
        const credential = (await this.credentials()).find(
          (c) => c.id === this.data!.selectedId,
        );
        if (credential) {
          await this.prepareRecovery(credential, false, true);
          return;
        }
      }
      throw error;
    }
  }
  private async prepareRecovery(
    credential: StoredCredential,
    newDevice = false,
    preserveAccount = false,
  ) {
    if (newDevice)
      await this.save({ ...this.data!, deviceId: this.random.id() });
    await this.save({
      ...this.data!,
      selectedId: credential.id,
      session: null,
      savedKey: null,
      registration: null,
      pending: {
        kind: 'recover',
        credentialId: credential.id,
        proposal: this.proposal(),
      },
    });
    if (!preserveAccount)
      this.update({
        account: null,
        devices: [],
        recoveryKeys: [],
        transfer: null,
        inspection: null,
      });
    await this.resume();
  }
  recoverCredential = (id: string) =>
    this.run(async () => {
      await this.ensureData();
      const credential = (await this.credentials()).find((c) => c.id === id);
      if (!credential) throw new IdentityClientError('STORAGE');
      await this.prepareRecovery(credential, true);
    });
  recoverKey = (value: string) =>
    this.run(async () => {
      const parsed = secretSchema.safeParse(
        value.replace(/[\s-]/g, '').toLowerCase(),
      );
      if (!parsed.success) throw new IdentityClientError('INVALID_REQUEST');
      await this.ensureData();
      const credential = { id: this.random.id(), secret: parsed.data };
      await this.add(credential);
      await this.prepareRecovery(credential, true);
      // Register a separate synchronizing credential; a saved key remains independently revocable.
      const replacement = {
        id: this.random.id(),
        secret: this.random.secret(),
      };
      await this.save({ ...this.data!, registration: replacement });
      await this.registerSync();
    });
  private async registerSync() {
    const registration = this.data!.registration;
    if (!registration) return;
    await this.add(registration);
    await this.request(
      'POST',
      '/credentials',
      okSchema,
      { id: registration.id, credential: registration.secret, kind: 'sync' },
      this.data!.session!.token,
    );
    await this.save({
      ...this.data!,
      selectedId: registration.id,
      registration: null,
    });
  }
  private async loadLists() {
    if (this.data!.registration) await this.registerSync();
    const token = this.data!.session!.token;
    const devices = await this.request(
      'GET',
      '/devices',
      devicesResponseSchema,
      undefined,
      token,
    );
    const keys = await this.request(
      'GET',
      '/credentials',
      credentialsResponseSchema,
      undefined,
      token,
    );
    const savedKey = this.data!.savedKey;
    if (
      savedKey &&
      keys.credentials.some((key) => key.id === savedKey.id && key.revokedAt)
    ) {
      await this.save({ ...this.data!, savedKey: null });
      this.update({ key: null });
    }
    this.update({
      devices: devices.devices,
      recoveryKeys: keys.credentials,
      credentials: (await this.credentials()).map((c) => ({ id: c.id })),
    });
  }
  refresh = (options: OperationOptions = {}) =>
    this.run(async () => {
      await this.verify();
    }, options);
  renew = () =>
    this.run(async () => {
      if (!this.data?.session) throw new IdentityClientError('UNAUTHORIZED');
      if (!this.data.pending)
        await this.save({
          ...this.data,
          pending: { kind: 'renew', proposal: this.proposal() },
        });
      await this.resume();
    });
  saveKey = () =>
    this.run(async () => {
      if (!this.data?.session) throw new IdentityClientError('UNAUTHORIZED');
      await this.loadLists();
      if (!this.data.savedKey)
        await this.save({
          ...this.data,
          savedKey: {
            id: this.random.id(),
            secret: this.random.secret(),
            registered: false,
          },
        });
      const key = this.data.savedKey!;
      await this.request(
        'POST',
        '/credentials',
        okSchema,
        { id: key.id, credential: key.secret, kind: 'key' },
        this.data.session.token,
      );
      await this.save({
        ...this.data,
        savedKey: { ...key, registered: true },
      });
      this.update({
        key: key.secret,
        message:
          'Keep this key somewhere private. Anyone with it can recover your account.',
      });
      await this.loadLists();
    });
  hideKey = () => this.update({ key: null });
  revokeCredential = (id: string) =>
    this.run(async () => {
      await this.request(
        'DELETE',
        `/credentials/${id}`,
        okSchema,
        undefined,
        this.data!.session!.token,
      );
      if (this.data!.savedKey?.id === id)
        await this.save({ ...this.data!, savedKey: null });
      await this.loadLists();
      this.update({
        message:
          'Recovery credential revoked. Existing device sessions remain active.',
      });
    });
  revokeDevice = (id: string) =>
    this.run(async () => {
      await this.request(
        'DELETE',
        `/devices/${id}`,
        okSchema,
        undefined,
        this.data!.session!.token,
      );
      if (id === this.data!.deviceId) {
        await this.save({ ...this.data!, session: null, pending: null });
        this.update({
          account: null,
          devices: [],
          recoveryKeys: [],
          message: 'This device has been revoked.',
        });
      } else await this.loadLists();
    });
  hasReceivingTransfer = () =>
    this.transferActive || this.data?.pending?.kind === 'transfer';
  private async abandonTransfer() {
    const pending = this.data!.pending;
    if (pending?.kind !== 'transfer') return;
    const stored = await this.storage(() => this.vault.credentials());
    const ignored = new Set(this.data!.ignoredCredentialIds);
    if (stored.some((value) => value.id === pending.credentialId))
      ignored.add(pending.credentialId);
    await this.save({
      ...this.data!,
      pending: null,
      selectedId:
        this.data!.selectedId === pending.credentialId
          ? null
          : this.data!.selectedId,
      cancelledTransfers: [...(this.data!.cancelledTransfers ?? []), pending],
      ignoredCredentialIds: [...ignored].filter((id) =>
        stored.some((value) => value.id === id),
      ),
    });
    this.update({ transfer: null });
  }
  private async flushCancelledTransfers(): Promise<
    'clear' | 'blocked' | 'redeemed'
  > {
    let completed = false;
    for (const pending of this.data!.cancelledTransfers ?? []) {
      try {
        const result = await this.request(
          'DELETE',
          `/transfers/${pending.input.id}`,
          receivingTransferCancelResponseSchema,
          pending.input,
        );
        if (result.status === 'redeemed') {
          // Completion already committed. Reconcile that exact session instead
          // of rolling back a transfer the server has actually finished.
          await this.add({
            id: pending.credentialId,
            secret: pending.input.credential,
          });
          try {
            // The ten-minute code may have expired while the app was closed;
            // verify the issued session directly rather than redeeming again.
            const info = await this.request(
              'GET',
              '/sessions/current',
              sessionResponseSchema,
              undefined,
              pending.input.sessionToken,
            );
            await this.finish(info, pending.input, pending.credentialId);
            completed = true;
          } catch (error) {
            if (
              !(error instanceof IdentityClientError) ||
              !['SESSION_EXPIRED', 'SESSION_REVOKED', 'UNAUTHORIZED'].includes(
                error.code,
              )
            )
              throw error;
            // A completed but subsequently expired/revoked session is not a
            // pending transfer. Retain its credential for explicit recovery.
            this.update({
              message:
                'That transfer completed, but its session is no longer active. Use a recovery method to reconnect.',
            });
          }
        }
        await this.save({
          ...this.data!,
          ignoredCredentialIds:
            result.status === 'redeemed'
              ? this.data!.ignoredCredentialIds?.filter(
                  (id) => id !== pending.credentialId,
                )
              : this.data!.ignoredCredentialIds,
          cancelledTransfers: this.data!.cancelledTransfers?.filter(
            (value) => value.input.id !== pending.input.id,
          ),
        });
      } catch (error) {
        this.operation!.check();
        this.update({
          message:
            'Transfer cancelled on this phone. Server confirmation is pending. Please retry when connected.',
        });
        if (error instanceof IdentityClientError && error.code === 'STORAGE')
          throw error;
        return 'blocked';
      }
    }
    return completed ? 'redeemed' : 'clear';
  }
  cancelTransfer = (): Promise<void> => {
    if (this.cancellation) return this.cancellation;
    if (!this.hasReceivingTransfer()) return Promise.resolve();
    this.transferActive = false;
    const pending: TransferIntent | null =
      this.data?.pending?.kind === 'transfer' ? this.data.pending : null;
    this.update({ transfer: null });
    this.operation?.cancel('ACCOUNT_CHANGED');
    const running = this.running;
    const task = Promise.resolve().then(async () => {
      await running;
      // A cancelled native write can still complete. Read its final state only
      // after the shared storage queue drains.
      await this.storageTail;
      await this.run(
        async () => {
          await this.ensureData();
          await this.abandonTransfer();
          if (
            pending &&
            this.data!.session?.info.sessionId === pending.input.sessionId &&
            this.data!.selectedId === pending.credentialId
          ) {
            this.update({
              account: this.data!.session.info,
              devices: [],
              recoveryKeys: [],
            });
            await this.loadLists();
          }
          await this.flushCancelledTransfers();
          this.update({
            credentials: (await this.credentials()).map((value) => ({
              id: value.id,
            })),
          });
        },
        { background: true },
        true,
      );
    });
    this.cancellation = task.finally(() => {
      this.cancellation = null;
    });
    return this.cancellation;
  };
  startTransfer = () => {
    if (this.snapshot.busy || this.cancellation) return Promise.resolve();
    this.transferActive = true;
    return this.run(async () => {
      await this.ensureData();
      await this.abandonTransfer();
      if ((await this.flushCancelledTransfers()) !== 'clear') {
        this.transferActive = false;
        return;
      }
      const credential = { id: this.random.id(), secret: this.random.secret() };
      const input = {
        ...this.proposal(),
        credential: credential.secret,
        id: this.random.id(),
        code: this.random.secret().slice(0, 16).toUpperCase(),
        claimSecret: this.random.secret(),
      };
      await this.save({
        ...this.data!,
        pending: { kind: 'transfer', credentialId: credential.id, input },
      });
      await this.resume();
    });
  };
  redeemTransfer = () =>
    this.run(async () => {
      const pending = this.data?.pending;
      if (pending?.kind !== 'transfer')
        throw new IdentityClientError('NOT_FOUND');
      const info = await this.request(
        'POST',
        '/sessions',
        sessionResponseSchema,
        {
          kind: 'transfer',
          code: pending.input.code,
          claimSecret: pending.input.claimSecret,
        },
      );
      // The full proof is already durable on this phone. Publish its sync
      // credential only once redemption succeeds, avoiding unregistered items
      // when approval is still pending or the user cancels an in-flight claim.
      await this.add({
        id: pending.credentialId,
        secret: pending.input.credential,
      });
      await this.finish(info, pending.input, pending.credentialId);
    });
  inspectTransfer = (value: string) =>
    this.run(async () => {
      this.update({ inspection: null });
      const parsed = transferCodeSchema.safeParse(
        value.replace(/[\s-]/g, '').toUpperCase(),
      );
      if (!parsed.success) throw new IdentityClientError('INVALID_REQUEST');
      const transfer = await this.request(
        'POST',
        '/transfer-inspections',
        transferInspectionResponseSchema,
        { code: parsed.data },
        this.data!.session!.token,
      );
      this.update({ inspection: { ...transfer, code: parsed.data } });
    });
  approveTransfer = (value: string) =>
    this.run(async () => {
      const transfer = this.snapshot.inspection;
      if (!transfer) throw new IdentityClientError('NOT_FOUND');
      const verification = transferVerificationSchema.safeParse(value.trim());
      if (!verification.success)
        throw new IdentityClientError('INVALID_REQUEST');
      await this.request(
        'POST',
        '/transfer-approvals',
        okSchema,
        { code: transfer.code, verification: verification.data },
        this.data!.session!.token,
      );
      this.update({
        inspection: null,
        message:
          'Transfer approved. Return to your new device and finish recovery.',
      });
    });
}
