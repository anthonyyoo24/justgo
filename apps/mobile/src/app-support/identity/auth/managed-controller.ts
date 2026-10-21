import { randomUUID } from 'expo-crypto';
import { z } from 'zod';
import {
  accountDeletionResponseSchema,
  managedSessionResponseSchema,
  okSchema,
  type ManagedSessionResponse,
} from '@justgo/contracts';
import { ApiError } from '../../../lib/network/http';
import type { SecureStorageDriver } from '../../../platform/auth/secure-storage';
import type { IdentityApi } from '../api';
import type { CredentialVault } from '../storage';
import { removeDeletedCredentials } from '../deletion/cleanup';
import { IdentityController } from '../controller';
import {
  ProviderAuthError,
  type ManagedAuth,
  type ProviderSession,
  type SignInProvider,
} from './types';
import type {
  ManagedIdentityState,
  ManagedIdentityStorage,
} from './managed-state';
import { legacyLinkProof } from './legacy-link-proof';

type LegacySnapshot = ReturnType<IdentityController['getSnapshot']>;
export type ManagedIdentitySnapshot = Omit<LegacySnapshot, 'account'> & {
  account: ManagedSessionResponse | null;
  mode: ManagedIdentityState['mode'];
  collectionId: string | null;
  guestId: string | null;
  collectionKind: 'guest' | 'account' | null;
  provider: SignInProvider | null;
  linkedProviders: readonly SignInProvider[];
  pendingGuestId: string | null;
};
type Options = {
  auth: ManagedAuth;
  storage: ManagedIdentityStorage;
  secureStorage: SecureStorageDriver;
  legacyVault: CredentialVault;
  api: IdentityApi;
  randomId?: () => string;
};
const deletionProofKey = 'justgo.auth.deletion-proof.v1';
const legacyProofKey = 'justgo.auth.legacy-link-proof.v1';
const legacyProofSchema = z
  .object({
    ownerId: z.uuid(),
    authUserId: z.uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const errorMessage = (error: unknown) =>
  error instanceof ProviderAuthError && error.code === 'LAST_PROVIDER'
    ? 'Keep one login method connected. Use Log out to sign out on this phone.'
    : error instanceof ProviderAuthError && error.code === 'CONFIGURATION'
      ? 'Sign-in isn’t configured in this build yet. You can continue on this phone.'
      : error instanceof ProviderAuthError && error.code === 'STORAGE'
        ? 'Account storage is unavailable. Unlock your phone and retry. Your saved writing was kept.'
        : error instanceof ApiError && error.code === 'CONFLICT'
          ? 'This sign-in is already linked to a different account. Your saved accounts were kept separate.'
          : error instanceof ApiError && error.code === 'DELETION_UNAVAILABLE'
            ? 'Account deletion is unavailable right now. Your account has not been deleted.'
            : error instanceof ApiError && error.code === 'DELETION_REJECTED'
              ? 'The deletion request could not be accepted. Your account has not been deleted.'
              : 'Couldn’t finish connecting. Please try again. Your saved data was kept.';

export class ManagedIdentityController {
  private data: ManagedIdentityState | null = null;
  private providerSession: ProviderSession | null = null;
  private running: Promise<void> | null = null;
  private disposed = false;
  private active = true;
  private networkBlocked = false;
  private verifiedOwner = false;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private removeData: ((owner: string) => Promise<void>) | null = null;
  private retireGuest: ((guest: string) => Promise<void>) | null = null;
  private mergeGuest:
    | ((
        guest: string,
        owner: string,
        session: { userId: string; token: string },
      ) => Promise<void>)
    | null = null;
  private readonly unsubscribeAuth: () => void;
  private snapshot: ManagedIdentitySnapshot = {
    busy: false,
    busyInBackground: false,
    initialized: false,
    needsWelcome: true,
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
    mode: 'welcome',
    collectionId: null,
    collectionKind: null,
    guestId: null,
    provider: null,
    linkedProviders: [],
    pendingGuestId: null,
  };
  readonly vault: CredentialVault;
  constructor(private readonly options: Options) {
    this.vault = options.legacyVault;
    this.unsubscribeAuth = options.auth.subscribe((session) => {
      this.providerSession = session;
      if (
        this.snapshot.account &&
        this.snapshot.account.authUserId !== session?.authUserId
      )
        this.publish({
          account: null,
          mode: 'signed-out',
          linkedProviders: [],
        });
      else if (this.snapshot.account)
        this.publish({ linkedProviders: session?.linkedProviders ?? [] });
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  setAccountDataRemover = (remove: (owner: string) => Promise<void>) => {
    this.removeData = remove;
  };
  setGuestDataMerger = (
    merge: (
      guest: string,
      owner: string,
      session: { userId: string; token: string },
    ) => Promise<void>,
  ) => {
    this.mergeGuest = merge;
  };
  setGuestDataRetirer = (retire: (guest: string) => Promise<void>) => {
    this.retireGuest = retire;
  };
  currentSession = () => {
    const account = this.snapshot.account;
    return this.verifiedOwner &&
      !this.networkBlocked &&
      this.snapshot.mode === 'account' &&
      account &&
      this.providerSession?.authUserId === account.authUserId &&
      !this.data?.logoutPending &&
      !this.data?.deletion
      ? { userId: account.userId, token: this.providerSession.accessToken }
      : null;
  };
  rejectSession = (token: string, code: 'SESSION_REVOKED' | 'UNAUTHORIZED') => {
    if (
      (code === 'SESSION_REVOKED' || code === 'UNAUTHORIZED') &&
      this.currentSession()?.token === token
    ) {
      this.networkBlocked = true;
      this.publish({
        account: null,
        mode: 'signed-out',
        linkedProviders: [],
        message: 'Please sign in again. Saved data remains on this phone.',
      });
      this.options.auth.setActive(false);
    }
  };
  private publish(value: Partial<ManagedIdentitySnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((listener) => listener());
  }
  private async save(data: ManagedIdentityState) {
    await this.options.storage.write(data);
    if (this.disposed) throw new ApiError('CANCELLED');
    this.data = data;
  }
  private state() {
    if (!this.data) throw new ProviderAuthError('STORAGE');
    return this.data;
  }
  private reconcile(message = '') {
    const state = this.state();
    const account =
      this.verifiedOwner &&
      !this.networkBlocked &&
      state.mode === 'account' &&
      state.account?.authUserId === this.providerSession?.authUserId &&
      !state.logoutPending &&
      !state.deletion
        ? state.account
        : null;
    this.publish({
      initialized: true,
      mode: state.mode === 'account' && !account ? 'signed-out' : state.mode,
      collectionId: state.collection.id,
      collectionKind: state.collection.kind,
      guestId: state.guestId,
      pendingGuestId:
        state.guestAdoption?.status === 'pending' ? state.guestId : null,
      account,
      linkedProviders: account
        ? (this.providerSession?.linkedProviders ?? [])
        : [],
      needsWelcome: state.mode === 'welcome',
      hasPending:
        !!state.pendingSignIn ||
        !!state.pendingLink ||
        state.guestAdoption?.status === 'copied' ||
        state.logoutPending ||
        !!state.deletion,
      deletionStatus: state.deletion
        ? state.deletion.receipt
          ? 'cleanup'
          : 'pending'
        : state.deleted
          ? 'deleted'
          : null,
      message,
    });
    this.options.auth.setActive(this.active && !!account);
  }
  private run(work: () => Promise<void>, background = false): Promise<void> {
    if (this.running) return this.running;
    if (this.disposed) return Promise.resolve();
    this.publish({ busy: true, busyInBackground: background, message: '' });
    const running = Promise.resolve()
      .then(work)
      .catch((error: unknown) => {
        if (
          error instanceof ApiError &&
          [
            'UNAUTHORIZED',
            'SESSION_REVOKED',
            'SESSION_EXPIRED',
            'ACCOUNT_CHANGED',
          ].includes(error.code)
        )
          this.networkBlocked = true;
        if (this.data)
          this.reconcile(
            this.data.deletion
              ? this.data.deletion.receipt
                ? 'Your account has been deleted. Please retry to finish clearing this phone’s account data and sign-in credentials.'
                : 'Couldn’t finish deleting your account. Please try again. Your deletion request is saved.'
              : errorMessage(error),
          );
        else
          this.publish({
            initialized: true,
            needsWelcome: true,
            message: errorMessage(error),
          });
      })
      .finally(() => {
        if (this.running === running) this.running = null;
        this.publish({ busy: false, busyInBackground: false });
      });
    this.running = running;
    return running;
  }
  private async load() {
    if (this.data) return;
    const saved = await this.options.storage.read();
    if (saved) {
      this.data = saved;
      // Older builds allowed users to leave phone data out of account uploads.
      // Re-enter the disclosed sign-in flow once before adopting that source.
      if (
        saved.mode === 'account' &&
        !saved.guestAdoption &&
        !saved.pendingSignIn &&
        !saved.deletion
      ) {
        await this.save({ ...saved, mode: 'signed-out' });
      }
      return;
    }
    // Read the previous secure schema for migration; never initialize/bootstrap
    // its controller or select credentials as a side effect of guest startup.
    let legacy = await this.vault.read();
    if (legacy?.pending?.kind === 'delete') {
      // Only an already saved deletion may invoke the legacy controller here.
      // Its exact-proof receipt workflow remains authoritative across upgrades.
      const controller = new IdentityController(this.vault, this.options.api);
      if (this.removeData) controller.setAccountDataRemover(this.removeData);
      const unsubscribe = controller.subscribe(() =>
        this.publish({
          initialized: true,
          needsWelcome: false,
          deletionStatus: controller.getSnapshot().deletionStatus,
          message: controller.getSnapshot().message,
        }),
      );
      try {
        await controller.initialize();
      } finally {
        unsubscribe();
      }
      if (controller.getSnapshot().deletionStatus !== 'deleted')
        throw new ProviderAuthError('STORAGE');
      legacy = await this.vault.read();
    }
    const id = this.options.randomId ?? randomUUID;
    const guestId = id();
    const priorOwner = legacy?.session?.info.userId;
    await this.save({
      version: 1,
      deviceId: legacy?.deviceId ?? id(),
      guestId,
      guestAdoption: null,
      collection: {
        kind: priorOwner ? 'account' : 'guest',
        id: priorOwner ?? guestId,
      },
      mode: priorOwner ? 'signed-out' : 'welcome',
      account: null,
      pendingSignIn: null,
      pendingLink: null,
      linkedLegacyOwnerIds: [],
      logoutPending: false,
      deletion: null,
      deleted: legacy?.accountDeleted === true,
    });
  }
  initialize = () =>
    this.run(async () => {
      await this.load();
      // Deletion receipts/frozen proofs and completed source copies remain
      // recoverable even when Auth has already erased the user or is offline.
      if (this.state().deletion) return this.finishDeletion();
      await this.finishGuestRetirement();
      if (this.state().logoutPending) return this.finishLogout();
      this.providerSession = await this.options.auth.initialize();
      if (this.state().pendingSignIn && this.providerSession)
        return this.adopt(this.providerSession);
      if (this.state().pendingLink && this.providerSession)
        return this.finishLink();
      if (
        this.state().mode === 'account' &&
        this.providerSession?.authUserId === this.state().account?.authUserId
      ) {
        await this.verify();
      } else {
        if (this.state().mode === 'account')
          await this.save({ ...this.state(), mode: 'signed-out' });
        this.reconcile();
      }
    });
  continueAsGuest = () =>
    this.run(async () => {
      await this.load();
      if (this.state().deletion || this.state().logoutPending)
        throw new ProviderAuthError('AUTH');
      const state = this.state();
      await this.save({
        ...state,
        mode: state.collection.kind === 'account' ? 'signed-out' : 'guest',
        deleted: false,
      });
      this.reconcile();
    });
  signIn = (
    provider: SignInProvider,
    options: { expectedOwnerId?: string } = {},
  ) =>
    this.run(async () => {
      await this.load();
      if (this.state().deletion) throw new ProviderAuthError('AUTH');
      await this.finishGuestRetirement();
      if (this.state().logoutPending) await this.finishLogout();
      const state = this.state();
      await this.save({
        ...state,
        pendingSignIn: {
          provider,
          // Retain the v1 persisted field for interrupted old sign-ins. New
          // sign-ins always adopt phone writing after the cloud disclosure.
          mergeGuest: true,
          guestId:
            state.guestAdoption?.status === 'consumed' ? null : state.guestId,
          mappedOwnerId: null,
          expectedOwnerId: options.expectedOwnerId ?? null,
        },
      });
      const session = await this.options.auth.signIn(provider);
      if (this.disposed) throw new ApiError('CANCELLED');
      if (session === 'redirecting') return;
      if (!session) {
        await this.save({ ...this.state(), pendingSignIn: null });
        this.reconcile();
        return;
      }
      this.providerSession = session;
      await this.adopt(session);
    });
  private async adopt(session: ProviderSession) {
    const intent = this.state().pendingSignIn;
    if (!intent) throw new ProviderAuthError('AUTH');
    const legacy = await this.vault.read();
    let legacySessionToken: string | undefined;
    if (
      !intent.mappedOwnerId &&
      !this.state().linkedLegacyOwnerIds.includes(this.state().collection.id) &&
      this.state().collection.kind === 'account' &&
      legacy?.session?.info.userId === this.state().collection.id &&
      !this.state().account
    ) {
      // Provider sign-in is explicit. Renew the existing legacy proof internally
      // when needed; never ask for a key/code or choose an unrelated credential.
      const frozen = await this.options.secureStorage.getItem(legacyProofKey);
      if (frozen) {
        const proof = legacyProofSchema.parse(JSON.parse(frozen));
        if (
          proof.ownerId !== this.state().collection.id ||
          proof.authUserId !== session.authUserId
        )
          throw new ApiError('CONFLICT');
        legacySessionToken = proof.token;
      } else {
        legacySessionToken = await legacyLinkProof(
          this.vault,
          this.options.api,
          this.state().collection.id,
          this.lifetime.signal,
        );
        if (legacySessionToken)
          await this.options.secureStorage.setItem(
            legacyProofKey,
            JSON.stringify({
              ownerId: this.state().collection.id,
              authUserId: session.authUserId,
              token: legacySessionToken,
            }),
          );
      }
      if (!legacySessionToken) throw new ProviderAuthError('AUTH');
    }
    const account = await this.options.api.request(
      'POST',
      '/auth/session',
      managedSessionResponseSchema,
      {
        deviceId: this.state().deviceId,
        ...(legacySessionToken ? { legacySessionToken } : {}),
      },
      session.accessToken,
      this.lifetime.signal,
    );
    if (
      this.disposed ||
      account.authUserId !== session.authUserId ||
      (intent.mappedOwnerId && intent.mappedOwnerId !== account.userId) ||
      (intent.expectedOwnerId && intent.expectedOwnerId !== account.userId)
    )
      throw new ApiError('ACCOUNT_CHANGED');
    await this.save({
      ...this.state(),
      pendingSignIn: { ...intent, mappedOwnerId: account.userId },
      linkedLegacyOwnerIds: legacySessionToken
        ? [...new Set([...this.state().linkedLegacyOwnerIds, account.userId])]
        : this.state().linkedLegacyOwnerIds,
    });
    await this.options.secureStorage.removeItem(legacyProofKey);
    const previousAdoption = this.state().guestAdoption;
    if (
      previousAdoption?.status === 'pending' &&
      previousAdoption.ownerId !== account.userId
    )
      throw new ApiError('CONFLICT');
    const adoptGuest =
      intent.mergeGuest &&
      intent.guestId &&
      previousAdoption?.status !== 'consumed' &&
      (!previousAdoption || previousAdoption.ownerId === account.userId);
    if (adoptGuest && intent.guestId) {
      if (!this.mergeGuest) throw new ProviderAuthError('STORAGE');
      await this.save({
        ...this.state(),
        guestAdoption: { ownerId: account.userId, status: 'pending' },
      });
      await this.mergeGuest(intent.guestId, account.userId, {
        userId: account.userId,
        token: session.accessToken,
      });
    }
    await this.save({
      ...this.state(),
      collection: { kind: 'account', id: account.userId },
      mode: 'account',
      account,
      guestAdoption: adoptGuest
        ? { ownerId: account.userId, status: 'copied' }
        : this.state().guestAdoption,
      pendingSignIn: null,
      deleted: false,
    });
    // Select the verified durable destination before erasing the old source.
    // A restart with unavailable Auth still displays that local journal.
    await this.finishGuestRetirement();
    this.networkBlocked = false;
    this.verifiedOwner = true;
    this.publish({ provider: intent.provider });
    this.reconcile();
  }
  private async finishGuestRetirement() {
    const adoption = this.state().guestAdoption;
    if (adoption?.status !== 'copied') return;
    if (!this.retireGuest) throw new ProviderAuthError('STORAGE');
    await this.retireGuest(this.state().guestId);
    await this.save({
      ...this.state(),
      guestAdoption: { ...adoption, status: 'consumed' },
    });
  }
  private async verify() {
    if (!this.providerSession) throw new ProviderAuthError('AUTH');
    const account = await this.options.api.request(
      'GET',
      '/auth/session',
      managedSessionResponseSchema,
      undefined,
      this.providerSession.accessToken,
      this.lifetime.signal,
    );
    if (
      account.authUserId !== this.providerSession.authUserId ||
      (this.state().account && account.userId !== this.state().account?.userId)
    )
      throw new ApiError('ACCOUNT_CHANGED');
    await this.save({ ...this.state(), account });
    this.verifiedOwner = true;
    this.reconcile();
  }
  linkProvider = (provider: SignInProvider) =>
    this.run(async () => {
      const account = this.snapshot.account;
      if (!account || !this.currentSession())
        throw new ProviderAuthError('AUTH');
      await this.verify();
      await this.save({
        ...this.state(),
        pendingLink: {
          provider,
          ownerId: account.userId,
          authUserId: account.authUserId,
        },
      });
      const session = await this.options.auth.linkIdentity(provider);
      if (this.disposed) throw new ApiError('CANCELLED');
      if (session === 'redirecting') return;
      if (session) this.providerSession = session;
      else {
        await this.save({ ...this.state(), pendingLink: null });
        this.reconcile();
        return;
      }
      await this.finishLink();
    });
  private async finishLink() {
    const pending = this.state().pendingLink;
    if (
      !pending ||
      pending.ownerId !== this.state().collection.id ||
      pending.authUserId !== this.providerSession?.authUserId
    )
      throw new ApiError('ACCOUNT_CHANGED');
    if (!this.providerSession.linkedProviders?.includes(pending.provider))
      throw new ProviderAuthError('AUTH');
    await this.verify();
    await this.save({ ...this.state(), pendingLink: null });
    this.reconcile();
  }
  unlinkProvider = (provider: SignInProvider) =>
    this.run(async () => {
      const account = this.snapshot.account;
      if (!account || !this.currentSession())
        throw new ProviderAuthError('AUTH');
      await this.verify();
      const session = await this.options.auth.unlinkIdentity(provider);
      if (this.disposed) throw new ApiError('CANCELLED');
      if (session.authUserId !== account.authUserId)
        throw new ApiError('ACCOUNT_CHANGED');
      this.providerSession = session;
      await this.verify();
      this.reconcile();
    });
  retry = (options: { background?: boolean } = {}) =>
    this.run(async () => {
      await this.load();
      if (this.state().deletion) return this.finishDeletion();
      await this.finishGuestRetirement();
      if (this.state().logoutPending) return this.finishLogout();
      this.providerSession = await this.options.auth.initialize();
      if (this.state().pendingSignIn && this.providerSession)
        return this.adopt(this.providerSession);
      if (this.state().pendingLink && this.providerSession)
        return this.finishLink();
      if (this.state().mode === 'account') await this.verify();
      else this.reconcile();
    }, options.background);
  refresh = this.retry;
  renew = () => this.retry();
  refreshSession = async (failedToken: string) => {
    const owner = this.snapshot.account?.userId;
    await this.run(async () => {
      if (this.currentSession()?.token === failedToken)
        this.providerSession = await this.options.auth.refresh();
      if (!this.providerSession) throw new ProviderAuthError('AUTH');
      await this.verify();
    }, true);
    const session = this.currentSession();
    if (!session || session.userId !== owner || session.token === failedToken)
      throw new ApiError('UNAUTHORIZED');
    return session;
  };
  signOut = async () => {
    let finished = false;
    await this.run(async () => {
      await this.load();
      this.networkBlocked = true;
      this.publish({ account: null, mode: 'signed-out', linkedProviders: [] });
      this.options.auth.setActive(false);
      await this.save({
        ...this.state(),
        mode: 'signed-out',
        logoutPending: true,
        pendingSignIn: null,
        pendingLink: null,
      });
      await this.finishLogout();
      finished = true;
    });
    // A fenced local account is not proof that persistence and revocation finished.
    return finished;
  };
  private async finishLogout() {
    this.publish({ account: null, mode: 'signed-out', linkedProviders: [] });
    if (!this.providerSession)
      this.providerSession = await this.options.auth.initialize();
    if (this.providerSession) {
      try {
        await this.options.api.request(
          'POST',
          '/auth/logout',
          okSchema,
          { scope: 'session' },
          this.providerSession.accessToken,
          this.lifetime.signal,
        );
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          !['UNAUTHORIZED', 'SESSION_REVOKED', 'SESSION_EXPIRED'].includes(
            error.code,
          )
        )
          throw error;
      }
    }
    await this.options.auth.signOut();
    await this.options.secureStorage.removeItem(legacyProofKey);
    this.providerSession = null;
    await this.save({ ...this.state(), account: null, logoutPending: false });
    this.reconcile('Signed out. Your saved data remains on this phone.');
  }
  deleteAccount = () =>
    this.run(async () => {
      await this.load();
      if (this.state().deletion) return this.finishDeletion();
      await this.finishGuestRetirement();
      const session = this.currentSession();
      if (!session || !this.removeData) throw new ProviderAuthError('AUTH');
      await this.options.secureStorage.setItem(deletionProofKey, session.token);
      await this.save({
        ...this.state(),
        deletion: { userId: session.userId, receipt: null },
      });
      this.networkBlocked = true;
      this.reconcile();
      await this.finishDeletion();
    });
  private async finishDeletion() {
    const pending = this.state().deletion;
    if (!pending || !this.removeData) throw new ProviderAuthError('STORAGE');
    this.reconcile();
    this.options.auth.setActive(false);
    let receipt = pending.receipt;
    if (!receipt) {
      const proof = await this.options.secureStorage.getItem(deletionProofKey);
      if (!proof) throw new ProviderAuthError('STORAGE');
      try {
        receipt = await this.options.api.request(
          'DELETE',
          '/account',
          accountDeletionResponseSchema,
          { confirmation: 'delete-account' },
          proof,
          this.lifetime.signal,
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          [
            'UNAUTHORIZED',
            'SESSION_EXPIRED',
            'SESSION_REVOKED',
            'CREDENTIAL_REJECTED',
            'NOT_FOUND',
            'INVALID_REQUEST',
          ].includes(error.code)
        ) {
          // A definitive rejection did not accept this deletion. Keep the
          // collection and allow another explicit attempt with a valid session.
          await this.save({ ...this.state(), deletion: null });
          this.networkBlocked = !['NOT_FOUND', 'INVALID_REQUEST'].includes(
            error.code,
          );
          await this.options.secureStorage.removeItem(deletionProofKey);
          if (error.code === 'NOT_FOUND')
            throw new ApiError('DELETION_UNAVAILABLE', error.requestId);
          if (error.code === 'INVALID_REQUEST')
            throw new ApiError('DELETION_REJECTED', error.requestId);
        }
        throw error;
      }
      if (receipt.userId !== pending.userId)
        throw new ApiError('ACCOUNT_CHANGED');
      await this.save({ ...this.state(), deletion: { ...pending, receipt } });
      this.reconcile();
    }
    await this.removeData(pending.userId);
    await removeDeletedCredentials(this.vault, receipt.credentialDigests);
    await this.options.auth.signOut();
    await this.options.secureStorage.removeItem(deletionProofKey);
    this.providerSession = null;
    const guestId = (this.options.randomId ?? randomUUID)();
    await this.save({
      ...this.state(),
      mode: 'welcome',
      account: null,
      // Never reopen a previously adopted guest source after account deletion.
      guestId,
      guestAdoption: null,
      collection: { kind: 'guest', id: guestId },
      deletion: null,
      pendingSignIn: null,
      pendingLink: null,
      logoutPending: false,
      deleted: true,
    });
    this.reconcile('Your account has been deleted.');
  }
  setActive = (active: boolean) => {
    this.active = active;
    this.options.auth.setActive(
      active &&
        this.snapshot.mode === 'account' &&
        !this.data?.deletion &&
        !this.data?.logoutPending,
    );
  };
  dispose = () => {
    this.disposed = true;
    this.lifetime.abort();
    this.unsubscribeAuth();
    this.options.auth.dispose();
    this.listeners.clear();
  };
}
