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
import { listenToConnectivity } from '../../platform/connectivity';
import { asyncStorageJournalStorage } from '../../data/activity/storage';
import type { JournalStorage } from '../../data/activity/model';
import { ActivityRuntime } from './activity-runtime';
import { ProgressRefresh } from './ProgressRefresh';
import { useActivityStore } from './activity-hooks';
import {
  QueryClientProvider,
  focusManager,
  useQuery,
} from '@tanstack/react-query';
import { accessResponseSchema, hasVerifiedAccess } from '@justgo/contracts';
import { IdentityController } from '../identity/controller';
import { createIdentityApi } from '../identity/api';
import { createVault } from '../identity/vault';
import { AccountClient, accountKey } from '../../lib/account-client';
import { createHttpClient } from '../../lib/http';
import { createTelemetry } from '../../lib/telemetry';

export function createAppRuntime(
  identity: IdentityController,
  url = process.env.EXPO_PUBLIC_API_URL,
  storage: JournalStorage = asyncStorageJournalStorage,
) {
  const client = new AccountClient(createHttpClient(url), {
    current: identity.currentSession,
    renew: identity.refreshSession,
    reject: identity.rejectSession,
  });
  const telemetry = createTelemetry();
  const activity = new ActivityRuntime(client, storage);
  const challenges = new ChallengeController(client, {
    repository: activity.getRepository,
  });
  let sessionId: string | null = null;
  let accountId: string | null = null;
  const sync = () => {
    const next = identity.getSnapshot().account?.userId ?? null;
    if (accountId !== next) {
      telemetry.setConsent('unknown');
      accountId = next;
    }
    client.changeAccount(next);
    activity.changeAccount(next);
    challenges.changeAccount(next);
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
    subscribe: () => {
      sync();
      return identity.subscribe(sync);
    },
  };
}
type Runtime = ReturnType<typeof createAppRuntime>;
const Context = createContext<Runtime | null>(null);
export function AppProvider({ children }: PropsWithChildren) {
  const [runtime] = useState(() =>
    createAppRuntime(
      new IdentityController(
        createVault(),
        createIdentityApi(process.env.EXPO_PUBLIC_API_URL),
      ),
    ),
  );
  useEffect(() => {
    let active =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    let online = true;
    const updateEnvironment = () =>
      runtime.activity.setEnvironment({ active, online });
    updateEnvironment();
    const unsubscribe = runtime.subscribe();
    const unsubscribeNetwork = listenToConnectivity((nextOnline) => {
      const wasOnline = online;
      online = nextOnline;
      updateEnvironment();
      if (!wasOnline && online && active) void runtime.challenges.refresh();
    });
    void runtime.identity.initialize();
    const subscription = AppState.addEventListener('change', (next) => {
      active = next === 'active';
      updateEnvironment();
      focusManager.setFocused(active);
      if (next !== 'active') runtime.identity.hideKey();
      else {
        void runtime.identity.retry();
        void runtime.client.queries.invalidateQueries();
        void runtime.challenges.refresh();
        runtime.telemetry.track('app_foregrounded');
      }
    });
    return () => {
      unsubscribe();
      subscription.remove();
      unsubscribeNetwork();
      runtime.challenges.dispose();
      runtime.activity.dispose();
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
  const { client } = useRuntime();
  const { account } = useIdentity();
  const query = useQuery({
    queryKey: accountKey(account?.userId ?? 'disconnected', 'access'),
    enabled: !!account,
    queryFn: ({ signal }) =>
      client.request('/v1/access', accessResponseSchema, { signal }),
    refetchInterval: 30_000,
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (query.data?.status !== 'verified') return;
    // Expiry/freshness closes the route even if a recheck is unavailable.
    const expires = Math.min(
      Date.parse(query.data.expiresAt),
      Date.parse(query.data.checkedAt) + 60_000,
    );
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(expires - Date.now(), 60_000)),
    );
    return () => clearTimeout(timer);
  }, [query.data]);
  return {
    ...query,
    verified:
      !!account &&
      !query.isError &&
      hasVerifiedAccess(query.data, Math.max(now, query.dataUpdatedAt)),
  };
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
