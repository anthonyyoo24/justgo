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
import { ProgressRefresh } from './ProgressRefresh';
import { useActivityStore } from './activity-hooks';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { catalogSchema } from '@justgo/contracts';
import { AccessStore } from '../access/verification/store';
import {
  canStartChallenge,
  useAccessState,
} from '../access/verification/useAccessState';
import { IdentityController } from '../identity/controller';
import { ManagedIdentityController } from '../identity/auth/managed-controller';
import { createManagedIdentityController } from '../identity/auth/create-managed-identity';
import { AccountClient } from '../../lib/network/account-client';
import { apiOrigin, createHttpClient } from '../../lib/network/http';
import { createTelemetry } from '../../lib/telemetry';

export function createAppRuntime<
  T extends IdentityController | ManagedIdentityController,
>(
  identity: T,
  url = process.env.EXPO_PUBLIC_API_URL,
  storage: JournalStorage = asyncStorageJournalStorage,
) {
  const client = new AccountClient(createHttpClient(url), {
    current: identity.currentSession,
    renew: identity.refreshSession,
    reject: identity.rejectSession,
  });
  const telemetry = createTelemetry();
  const access = new AccessStore(apiOrigin(url), storage);
  const managed = identity instanceof ManagedIdentityController;
  const activity = new ActivityRuntime(client, storage, { managed, url });
  identity.setAccountDataRemover(async (owner) => {
    if (access.getSnapshot().owner?.id === owner) access.changeOwner(null);
    // Permission metadata shares the erased namespace. Finish its pending writes
    // before erasing, so a late recovery record cannot recreate an old owner key.
    await access.settled();
    await activity.deleteAccount(owner);
  });
  if (identity instanceof ManagedIdentityController) {
    identity.setGuestDataMerger(activity.mergeGuestData);
    identity.setGuestDataRetirer(activity.retireGuestData);
  }
  const challenges = new ChallengeController(client, {
    repository: activity.getRepository,
    readCatalog: (signal) =>
      identity.getSnapshot().account
        ? client.request('/v1/challenges', catalogSchema, { signal })
        : client.requestGuest('/v1/guest/challenges', catalogSchema, signal),
  });
  let sessionId: string | null = null;
  let accountId: string | null = null;
  const sync = () => {
    const snapshot = identity.getSnapshot();
    const next = snapshot.account?.userId ?? null;
    const collection =
      'collectionId' in snapshot && typeof snapshot.collectionId === 'string'
        ? snapshot.needsWelcome
          ? null
          : snapshot.collectionId
        : next;
    if (accountId !== next) {
      telemetry.setConsent('unknown');
      accountId = next;
    }
    client.changeAccount(next);
    client.changeCollection(collection);
    access.setAuthenticated(!!next);
    const accessAccount =
      next ??
      (identity instanceof ManagedIdentityController
        ? identity.offlineAccountOwner()
        : null);
    access.changeOwner(
      identity.getSnapshot().deletionStatus || !collection
        ? null
        : {
            id: accessAccount ?? collection,
            kind: accessAccount ? 'account' : 'guest',
          },
    );
    activity.setPendingGuestAdoption(
      'pendingGuestId' in snapshot &&
        typeof snapshot.pendingGuestId === 'string'
        ? snapshot.pendingGuestId
        : null,
    );
    activity.changeAccount(
      collection,
      managed ? (next ? 'cloud' : 'local') : 'legacy',
      'collectionKind' in snapshot && snapshot.collectionKind === 'guest'
        ? 'guest'
        : 'account',
    );
    challenges.changeAccount(collection);
    const nextSession = identity.getSnapshot().account?.sessionId ?? null;
    if (nextSession && sessionId !== nextSession)
      activity.resumeAuthentication();
    sessionId = nextSession;
  };
  sync();
  return {
    identity,
    client,
    telemetry,
    challenges,
    activity,
    access,
    canStartChallenge: () => canStartChallenge(client, access),
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
      runtime.access.setEnvironment({ active, online });
    };
    runtime.identity.setActive(active);
    updateEnvironment();
    const unsubscribe = runtime.subscribe();
    const unsubscribeNetwork = listenToConnectivity((nextOnline) => {
      const wasOnline = online;
      online = nextOnline;
      updateEnvironment();
      if (!wasOnline && online && active) {
        void runtime.identity.retry({
          background: !!runtime.identity.getSnapshot().account,
        });
        void runtime.challenges.refresh();
      }
    });
    void runtime.identity.initialize();
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
        runtime.telemetry.track('app_foregrounded');
      }
    });
    return () => {
      runtime.identity.setActive(false);
      unsubscribe();
      subscription.remove();
      unsubscribeNetwork();
      runtime.challenges.dispose();
      runtime.access.setEnvironment({ active: false, online: false });
      // React can restart effects while retaining this state-owned runtime.
      // Parking stops its work and preserves unsaved data for reconnection.
      runtime.activity.changeAccount(null);
      runtime.client.changeAccount(null);
    };
  }, [runtime]);
  return (
    <Context.Provider value={runtime}>
      <QueryClientProvider client={runtime.client.queries}>
        <ProgressRefresh client={runtime.client} activity={runtime.activity} />
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
export function useAccess() {
  const { client, access } = useRuntime();
  return useAccessState(client, access);
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
