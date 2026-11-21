import { ChallengeController } from '../../features/challenges/controller';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { listenToConnectivity } from '../../platform/connectivity/connectivity';
import { asyncStorageJournalStorage } from '../../data/activity/persistence/storage';
import type { JournalStorage } from '../../data/activity/model';
import { ActivityRuntime } from './activity-runtime';
import { useActivityStore } from './activity-hooks';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { catalogSchema } from '@justgo/contracts';
import { canStartChallenge } from '../access/admission';
import { PaidAccess } from '../access/paid-access';
import { createSuperwallBilling } from '../billing/superwall';
import { IdentityController } from '../identity/controller';
import { ManagedIdentityController } from '../identity/auth/managed-controller';
import { createManagedIdentityController } from '../identity/auth/create-managed-identity';
import {
  AccountClient,
  type GuestAccountClient,
} from '../../lib/network/account-client';
import { createHttpClient } from '../../lib/network/http';
import { createTelemetry } from '../../lib/telemetry';

export function createAppRuntime<
  T extends IdentityController | ManagedIdentityController,
>(
  identity: T,
  url = process.env.EXPO_PUBLIC_API_URL,
  storage: JournalStorage = asyncStorageJournalStorage,
  billing = process.env.EXPO_PUBLIC_BILLING_ENABLED === 'true',
) {
  const client = new AccountClient(createHttpClient(url), {
    current: identity.currentSession,
    renew: identity.refreshSession,
    reject: identity.rejectSession,
  });
  // With billing on, a managed guest has a server account under an anonymous
  // Auth user. Its bearer reaches only access, the catalog and purchase
  // verification. The collection stays local and never syncs.
  const guestAccounts =
    billing && identity instanceof ManagedIdentityController
      ? new AccountClient(createHttpClient(url), {
          current: identity.currentGuestSession,
          renew: identity.refreshGuestSession,
          reject: identity.rejectGuestSession,
        })
      : null;
  const guestSession =
    guestAccounts && identity instanceof ManagedIdentityController
      ? identity.currentGuestSession
      : null;
  const guestClient: GuestAccountClient | null = guestAccounts && {
    request: (path, schema, options) =>
      guestAccounts.request(path, schema, options),
  };
  const telemetry = createTelemetry();
  const activity = new ActivityRuntime(client, storage, { url });
  const access = billing
    ? new PaidAccess({ url, storage, client, guestClient })
    : null;
  const superwall = createSuperwallBilling(billing);
  // Saved access shares the erased namespace, so its writes finish first.
  const beforeErase = async (owner: string) => {
    if (access?.ownerId() === owner) access.changeOwner(null);
    await access?.settled();
  };
  identity.setAccountDataRemover(async (owner) => {
    await beforeErase(owner);
    await activity.deleteAccount(owner);
  });
  if (identity instanceof ManagedIdentityController) {
    identity.setGuestDataMerger(activity.mergeGuestData);
    identity.setGuestDataRetirer(async (guest) => {
      await beforeErase(guest);
      await activity.retireGuestData(guest);
    });
  }
  const challenges = new ChallengeController(client, {
    repository: activity.getRepository,
    readCatalog: (signal) =>
      identity.getSnapshot().account
        ? client.request('/v1/challenges', catalogSchema, { signal })
        : // A refused guest bearer reads the guest route until a new one exists.
          guestClient && guestSession?.()
          ? guestClient.request('/v1/challenges', catalogSchema, { signal })
          : client.requestGuest('/v1/guest/challenges', catalogSchema, signal),
  });
  let accountId: string | null = null;
  let guestAccountId: string | null = null;
  const sync = () => {
    const snapshot = identity.getSnapshot();
    const next = snapshot.account?.userId ?? null;
    const nextGuestAccount =
      guestAccounts &&
      !next &&
      'guestAccountId' in snapshot &&
      typeof snapshot.guestAccountId === 'string'
        ? snapshot.guestAccountId
        : null;
    const guestAccountChanged = guestAccountId !== nextGuestAccount;
    guestAccountId = nextGuestAccount;
    guestAccounts?.changeAccount(nextGuestAccount);
    const collection =
      'collectionId' in snapshot && typeof snapshot.collectionId === 'string'
        ? snapshot.needsWelcome
          ? null
          : snapshot.collectionId
        : next;
    const accountChanged = accountId !== next;
    if (accountChanged) {
      telemetry.setConsent('unknown');
      accountId = next;
    }
    client.changeAccount(next);
    client.changeCollection(collection);
    const accessAccount =
      next ??
      (identity instanceof ManagedIdentityController
        ? identity.offlineAccountOwner()
        : null);
    // A guest with a server account owns access by that account. Without
    // one, it has no access owner until the account is made.
    const guestOwner = guestAccounts ? guestAccountId : collection;
    // Superwall knows only the account that owns the phone, or the guest's
    // server account. A guest without one, or an account being deleted,
    // stays anonymous.
    superwall?.changeOwner(
      snapshot.deletionStatus ? null : (accessAccount ?? guestAccountId),
    );
    if (access) {
      access.changeOwner(
        snapshot.deletionStatus || !collection
          ? null
          : accessAccount
            ? { id: accessAccount, kind: 'account' }
            : guestOwner
              ? { id: guestOwner, kind: 'guest' }
              : null,
      );
      // An offline account owner can check only once its session returns.
      if (accountChanged) void access.refresh();
    }
    activity.setPendingGuestAdoption(
      'pendingGuestId' in snapshot &&
        typeof snapshot.pendingGuestId === 'string'
        ? snapshot.pendingGuestId
        : null,
    );
    activity.changeAccount(
      collection,
      next ? 'cloud' : 'local',
      'collectionKind' in snapshot && snapshot.collectionKind === 'guest'
        ? 'guest'
        : 'account',
    );
    challenges.changeAccount(collection);
    // The guest catalog moves to the guest account's route once it exists.
    if (guestAccountChanged && guestAccountId) void challenges.refresh();
  };
  sync();
  return {
    identity,
    client,
    guestClient,
    telemetry,
    challenges,
    activity,
    access,
    superwall,
    canStartChallenge: () => canStartChallenge(access),
    subscribe: () => {
      sync();
      return identity.subscribe(sync);
    },
  };
}
// The installed app uses managed accounts. The generic constructor above also
// exercises retained legacy session compatibility in boundary tests.
type Runtime = ReturnType<typeof createAppRuntime<ManagedIdentityController>>;
const Context = createContext<Runtime | null>(null);
export function AppProvider({ children }: PropsWithChildren) {
  const [runtime] = useState(() =>
    createAppRuntime(createManagedIdentityController()),
  );
  useEffect(() => {
    let active =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    let online = true;
    const updateEnvironment = () => {
      runtime.activity.setEnvironment({ active, online });
    };
    runtime.identity.setActive(active);
    updateEnvironment();
    const unsubscribe = runtime.subscribe();
    const stopSuperwall = runtime.superwall?.start();
    const unsubscribeNetwork = listenToConnectivity((nextOnline) => {
      const wasOnline = online;
      online = nextOnline;
      updateEnvironment();
      if (!wasOnline && online && active) {
        void runtime.identity.retry({
          background: !!runtime.identity.getSnapshot().account,
        });
        void runtime.challenges.refresh();
        void runtime.access?.refresh();
      }
    });
    void runtime.identity.initialize();
    void runtime.access?.refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      active = next === 'active';
      updateEnvironment();
      focusManager.setFocused(active);
      if (next !== 'active') {
        runtime.identity.setActive(false);
      } else {
        runtime.identity.setActive(true);
        void runtime.identity.retry({
          background: !!runtime.identity.getSnapshot().account,
        });
        void runtime.client.queries.invalidateQueries();
        void runtime.challenges.refresh();
        void runtime.access?.refresh();
        runtime.telemetry.track('app_foregrounded');
      }
    });
    return () => {
      runtime.identity.setActive(false);
      unsubscribe();
      stopSuperwall?.();
      subscription.remove();
      unsubscribeNetwork();
      runtime.challenges.dispose();
      // React can restart effects while retaining this state-owned runtime.
      // Parking stops its work and preserves unsaved data for reconnection.
      runtime.activity.changeAccount(null);
      runtime.client.changeAccount(null);
    };
  }, [runtime]);
  return (
    <Context.Provider value={runtime}>
      <QueryClientProvider client={runtime.client.queries}>
        {children}
      </QueryClientProvider>
    </Context.Provider>
  );
}
export function useRuntime() {
  const runtime = useContext(Context);
  if (!runtime) throw new Error('AppProvider is required');
  return runtime;
}
export function useIdentity() {
  const { identity } = useRuntime();
  return useSyncExternalStore(
    identity.subscribe,
    identity.getSnapshot,
    identity.getSnapshot,
  );
}
export function useJournal() {
  const { activity } = useRuntime();
  return useSyncExternalStore(
    activity.store.subscribe,
    activity.getRepository,
    activity.getRepository,
  );
}
export function useActivityState() {
  const { activity } = useRuntime();
  return useActivityStore(activity);
}
