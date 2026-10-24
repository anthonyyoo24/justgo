import { asyncStorageJournalStorage } from '../../data/activity/persistence/storage';
import { listenToConnectivity } from '../../platform/connectivity/connectivity';
import { useEffect } from 'react';
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import { z } from 'zod';
import { type AccessResponse, type SessionResponse } from '@justgo/contracts';
import { card } from '../../../test-support/journal';
import { venues } from '@justgo/contracts';
import { accountKey } from '../../lib/network/account-client';
import { createIdentityApi } from '../identity/api';
import { IdentityController } from '../identity/controller';
import { createMemoryVault, type CredentialVault } from '../identity/storage';
import { ManagedIdentityController } from '../identity/auth/managed-controller';
import { createManagedIdentityController } from '../identity/auth/create-managed-identity';
import type {
  ManagedIdentityState,
  ManagedIdentityStorage,
} from '../identity/auth/managed-state';
import type { ManagedAuth, ProviderSession } from '../identity/auth/types';
import {
  AppProvider,
  createAppRuntime,
  useAccess,
  useActivityState,
  useIdentity,
  useRuntime,
} from './AppProvider';

jest.mock('expo-crypto', () => {
  let sequence = 10;
  return {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    getRandomValues: (array: Uint8Array) => {
      array.fill(0xbb);
      return array;
    },
  };
});
jest.mock('../../platform/connectivity/connectivity', () => ({
  listenToConnectivity: jest.fn(() => () => {}),
}));
jest.mock('../../data/activity/persistence/storage', () => {
  const values = new Map<string, string>();
  return {
    asyncStorageJournalStorage: {
      getAllKeys: async () => [...values.keys()],
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    },
  };
});
jest.mock('../identity/auth/create-managed-identity', () => ({
  createManagedIdentityController: jest.fn(),
}));
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const token = 'a'.repeat(64);
const userId = id(1);
let session: SessionResponse;
let vault: CredentialVault;
let controller: ManagedIdentityController;
let managedStorage: ManagedIdentityStorage;
let auth: ManagedAuth;
let providerSession: ProviderSession;
let fetcher: jest.SpiedFunction<typeof fetch>;
let onAppState: (value: AppStateStatus) => void;
let removeListener: jest.Mock;
let runtime: ReturnType<typeof createAppRuntime>;
let access: AccessResponse;
const originalUrl = process.env.EXPO_PUBLIC_API_URL;
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

function Probe() {
  const currentRuntime = useRuntime();
  useEffect(() => {
    runtime = currentRuntime;
  }, [currentRuntime]);
  const identity = useIdentity();
  const access = useAccess();
  const activity = useActivityState();
  return (
    <>
      <Text>{identity.initialized ? 'initialized' : 'starting'}</Text>
      <Text>{identity.account?.userId ?? 'disconnected'}</Text>
      <Text>{access.verified ? 'access verified' : 'access closed'}</Text>
      <Text>{identity.message}</Text>
      <Text>
        {activity.repository
          ? `Activity owner: ${activity.repository.accountId}`
          : 'activity disconnected'}
      </Text>
      <Text>
        {activity.state?.online ? 'activity online' : 'activity offline'}
      </Text>
    </>
  );
}
async function mount() {
  const screen = await render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => expect(screen.getByText('initialized')).toBeTruthy());
  await waitFor(() => expect(runtime.client.queries.isFetching()).toBe(0));
  return screen;
}

async function receiveAccess(value: AccessResponse) {
  access = value;
  await act(async () => {
    if (value.source === 'free_beta') {
      const lease = runtime.access.beginRequest({
        id: userId,
        kind: 'account',
      })!;
      await runtime.access.receive(lease, value, Date.now());
    }
    runtime.client.queries.setQueryData(
      accountKey(userId, 'access', 'account'),
      value,
    );
    await jest.advanceTimersByTimeAsync(0);
  });
}

beforeEach(async () => {
  for (const key of (await asyncStorageJournalStorage.getAllKeys?.()) ?? [])
    await asyncStorageJournalStorage.removeItem(key);
  // Control polling/freshness and flush scheduled notifications before restoring timers.
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
  session = {
    userId,
    deviceId: id(2),
    sessionId: id(3),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  access = {
    status: 'verified',
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  vault = createMemoryVault();
  await vault.write({
    deviceId: session.deviceId,
    selectedId: id(4),
    session: { token, info: session },
    pending: null,
    savedKey: null,
    registration: null,
  });
  providerSession = {
    authUserId: id(40),
    accessToken: token,
    expiresAt: session.expiresAt,
  };
  let stored: ManagedIdentityState = {
    version: 1 as const,
    deviceId: session.deviceId,
    guestId: id(50),
    guestAdoption: { ownerId: userId, status: 'consumed' },
    collection: { kind: 'account' as const, id: userId },
    mode: 'account' as const,
    account: {
      ...session,
      authUserId: providerSession.authUserId,
      dataEpoch: 0,
    },
    pendingSignIn: null,
    pendingLink: null,
    linkedLegacyOwnerIds: [userId],
    logoutPending: false,
    deletion: null,
    deleted: false,
  };
  managedStorage = {
    read: jest.fn(async () => stored),
    write: jest.fn(async (next) => {
      stored = next;
    }),
  };
  auth = {
    initialize: jest.fn(async () => providerSession),
    refresh: jest.fn(async () => providerSession),
    signIn: jest.fn(async () => providerSession),
    linkIdentity: jest.fn(async () => providerSession),
    unlinkIdentity: jest.fn(async () => providerSession),
    signOut: jest.fn(async () => {}),
    setActive: jest.fn(),
    subscribe: jest.fn(() => () => {}),
    dispose: jest.fn(),
  };
  const secure = new Map<string, string>();
  controller = new ManagedIdentityController({
    auth,
    storage: managedStorage,
    legacyVault: vault,
    api: createIdentityApi('http://localhost:3000', (...args) =>
      fetch(...args),
    ),
    secureStorage: {
      getItem: async (key) => secure.get(key) ?? null,
      setItem: async (key, value) => {
        secure.set(key, value);
      },
      removeItem: async (key) => {
        secure.delete(key);
      },
    },
  });
  jest.mocked(createManagedIdentityController).mockReturnValue(controller);
  fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith('/auth/session'))
        return response({
          ...session,
          authUserId: providerSession.authUserId,
          dataEpoch: 0,
        });
      if (path.endsWith('/auth/logout')) return response({ ok: true });
      if (path.includes('/completion-restores'))
        return response({ dataEpoch: 0, attempts: [], nextCursor: null });
      if (path.includes('/journal-sync'))
        return response({ dataEpoch: 0, versions: [], nextCursor: null });
      if (path.endsWith('/sessions/current')) return response(session);
      if (path.endsWith('/devices')) return response({ devices: [] });
      if (path.endsWith('/credentials')) return response({ credentials: [] });
      if (path.endsWith('/access')) return response(access);
      throw new Error(`Unexpected fixture request: ${path}`);
    });
  removeListener = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      onAppState = listener;
      return { remove: removeListener };
    });
});
afterEach(async () => {
  await act(async () => await cleanup());
  await runtime?.client.queries.cancelQueries();
  runtime?.client.queries.clear();
  runtime?.activity.dispose();
  controller?.dispose();
  focusManager.setFocused(undefined);
  await act(async () => jest.runOnlyPendingTimersAsync());
  jest.restoreAllMocks();
  jest.useRealTimers();
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalUrl;
});

it('initializes one identity/runtime, provides its query cache and admits verified access', async () => {
  const screen = await mount();
  expect(screen.getByText(userId)).toBeTruthy();
  await waitFor(() => expect(screen.getByText('access verified')).toBeTruthy());
  expect(
    runtime.client.queries.getQueryData(
      accountKey(userId, 'access', 'account'),
    ),
  ).toEqual(access);
  const originalRuntime = runtime;
  await screen.rerender(
    <AppProvider>
      <Probe />
      <Text>rerender</Text>
    </AppProvider>,
  );
  expect(runtime).toBe(originalRuntime);
  expect(
    fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/session')),
  ).toHaveLength(1);
});

it('keeps unavailable storage disconnected without bootstrapping or checking access', async () => {
  jest.spyOn(managedStorage, 'read').mockRejectedValue(new Error('locked'));
  const screen = await mount();
  expect(screen.getByText('disconnected')).toBeTruthy();
  expect(screen.getByText('access closed')).toBeTruthy();
  expect(screen.getByText('activity disconnected')).toBeTruthy();
  expect(screen.getByText(/Couldn’t finish connecting/)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});

it('loads guest access and catalog only after explicit Continue, without any account write', async () => {
  jest.spyOn(managedStorage, 'read').mockResolvedValue(null);
  jest.spyOn(vault, 'read').mockResolvedValue(null);
  jest.mocked(auth.initialize).mockResolvedValue(null);
  fetcher.mockImplementation(async (input) => {
    const path = String(input);
    if (path.endsWith('/guest/access')) return response(access);
    if (path.endsWith('/guest/challenges'))
      return response({
        cards: venues.map(({ id }) => ({ ...card, id, venue: id })),
      });
    throw new Error('Unexpected account request for guest');
  });
  const screen = await mount();
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => controller.continueAsGuest());
  await waitFor(() => expect(screen.getByText('access verified')).toBeTruthy());
  await act(async () => runtime.challenges.refresh());
  expect(runtime.activity.getRepository()?.store.getState().dataMode).toBe(
    'local',
  );
  expect(
    fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname),
  ).toEqual(
    expect.arrayContaining(['/v1/guest/access', '/v1/guest/challenges']),
  );
  expect(
    fetcher.mock.calls.every(
      ([, options]) => !new Headers(options?.headers).has('authorization'),
    ),
  ).toBe(true);
});

it('clears queries, mutations and challenge state synchronously on account loss and switch', async () => {
  const screen = await mount();
  runtime.client.queries.setQueryData(accountKey(userId, 'progress'), {
    private: true,
  });
  runtime.client.queries.getMutationCache().build(runtime.client.queries, {
    mutationKey: accountKey(userId, 'write'),
  });
  const consent = jest.spyOn(runtime.telemetry, 'setConsent');
  // Losing this session synchronously disconnects all account-scoped domains.
  await act(() => runtime.identity.rejectSession(token, 'SESSION_REVOKED'));
  expect(screen.getByText('disconnected')).toBeTruthy();
  expect(screen.getByText('access closed')).toBeTruthy();
  expect(
    runtime.client.queries.getQueryData(accountKey(userId, 'progress')),
  ).toBeUndefined();
  expect(runtime.client.queries.getMutationCache().getAll()).toHaveLength(0);
  expect(runtime.challenges.getSnapshot()).toMatchObject({
    queues: {},
    success: null,
    saving: false,
  });
  expect(consent).toHaveBeenCalledWith('unknown');

  session = { ...session, userId: id(8) };
  providerSession = {
    ...providerSession,
    authUserId: id(80),
    accessToken: 'other-provider-token',
  };
  await act(async () => controller.signIn('apple'));
  await waitFor(() => expect(screen.getByText(id(8))).toBeTruthy());
  await waitFor(() => expect(runtime.client.queries.isFetching()).toBe(0));
  expect(
    runtime.client.queries.getQueryData(
      accountKey(userId, 'access', 'account'),
    ),
  ).toBeUndefined();
});

it('coordinates simultaneous expired requests through the real identity session source', async () => {
  const identity = new IdentityController(
    vault,
    createIdentityApi('http://localhost:3000'),
  );
  await identity.initialize();
  runtime = createAppRuntime(identity, 'http://localhost:3000');
  const unsubscribe = runtime.subscribe();
  const retained = accountKey(userId, 'progress');
  runtime.client.queries.setQueryData(retained, 'same-account history');
  const nextToken = 'b'.repeat(64);
  const renew = jest.spyOn(identity, 'retry');
  fetcher.mockImplementation(async (input, init) => {
    const path = String(input);
    if (path.endsWith('/sessions/current')) {
      return response({
        ...session,
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      });
    }
    if (path.endsWith('/sessions')) {
      const proposal = JSON.parse(String(init?.body)) as { sessionId: string };
      return response({ ...session, sessionId: proposal.sessionId });
    }
    if (path.endsWith('/devices')) return response({ devices: [] });
    if (path.endsWith('/credentials')) return response({ credentials: [] });
    if (new Headers(init?.headers).get('authorization') === `Bearer ${token}`)
      return response({ code: 'SESSION_EXPIRED', requestId: 'fixture' }, 401);
    return response({ ok: true });
  });
  const result = await Promise.all([
    runtime.client.request('/v1/test', z.object({ ok: z.literal(true) })),
    runtime.client.request('/v1/test', z.object({ ok: z.literal(true) })),
  ]);
  expect(result).toEqual([{ ok: true }, { ok: true }]);
  expect(renew).toHaveBeenCalledTimes(1);
  expect(identity.currentSession()?.token).toBe(nextToken);
  expect(runtime.client.queries.getQueryData(retained)).toBe(
    'same-account history',
  );
  unsubscribe();
});

it('pauses provider refresh on background, refreshes on foreground and releases listeners on unmount', async () => {
  const screen = await mount();
  const active = jest.mocked(auth.setActive);
  const retry = jest.spyOn(runtime.identity, 'retry');
  const invalidate = jest.spyOn(runtime.client.queries, 'invalidateQueries');
  const refresh = jest.spyOn(runtime.challenges, 'refresh').mockResolvedValue();
  const track = jest.spyOn(runtime.telemetry, 'track');
  await act(() => onAppState('background'));
  expect(active).toHaveBeenLastCalledWith(false);
  expect(focusManager.isFocused()).toBe(false);
  expect(retry).not.toHaveBeenCalled();
  await act(async () => onAppState('active'));
  await waitFor(() => expect(runtime.client.queries.isFetching()).toBe(0));
  expect(focusManager.isFocused()).toBe(true);
  expect(retry).toHaveBeenCalledTimes(1);
  expect(retry).toHaveBeenCalledWith({ background: true });
  expect(invalidate).toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('app_foregrounded');
  await screen.unmount();
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(runtime.client.queries.getQueryCache().getAll()).toHaveLength(0);
  // Unsubscribed identity notifications must not reconnect a disposed runtime.
  await runtime.identity.retry();
  await expect(
    runtime.client.request('/v1/test', z.unknown()),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

it.each(['expiry', 'freshness'] as const)(
  'closes access at %s even while the next check is pending',
  async (limit) => {
    access = {
      status: 'verified',
      checkedAt: new Date(
        Date.now() - (limit === 'freshness' ? 59000 : 0),
      ).toISOString(),
      expiresAt: new Date(
        Date.now() + (limit === 'expiry' ? 1000 : 3600000),
      ).toISOString(),
    };
    const screen = await mount();
    await waitFor(() =>
      expect(screen.getByText('access verified')).toBeTruthy(),
    );
    await act(async () => jest.advanceTimersByTimeAsync(1001));
    expect(screen.getByText('access closed')).toBeTruthy();
  },
);

it.each([25, 5_000])(
  'admits a fresh server check %s ms ahead of the phone without extending expiry',
  async (ahead) => {
    const screen = await mount();
    const receivedAt = Date.now();
    await receiveAccess({
      status: 'verified',
      source: 'free_beta',
      checkedAt: new Date(receivedAt + ahead).toISOString(),
      expiresAt: new Date(receivedAt + ahead + 1_000).toISOString(),
    });
    expect(screen.getByText('access verified')).toBeTruthy();
    await act(async () =>
      jest.advanceTimersByTimeAsync(receivedAt + 999 - Date.now()),
    );
    expect(screen.getByText('access verified')).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(2));
    expect(screen.getByText('access closed')).toBeTruthy();
  },
);

it('does not admit an implausibly future server check', async () => {
  const screen = await mount();
  await receiveAccess({
    status: 'verified',
    checkedAt: new Date(Date.now() + 5_001).toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  expect(screen.getByText('access closed')).toBeTruthy();
});

it('closes a clock-aligned check after sixty seconds when polling is paused', async () => {
  const screen = await mount();
  const receivedAt = Date.now();
  await receiveAccess({
    status: 'verified',
    checkedAt: new Date(Date.now() + 25).toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  expect(screen.getByText('access verified')).toBeTruthy();
  focusManager.setFocused(false);
  await act(async () =>
    jest.advanceTimersByTimeAsync(receivedAt + 59_999 - Date.now()),
  );
  expect(screen.getByText('access verified')).toBeTruthy();
  await act(async () => jest.advanceTimersByTimeAsync(1));
  expect(screen.getByText('access closed')).toBeTruthy();
});

it.each(['unpaid', 'unavailable'] as const)(
  'does not admit %s access and recovers after a verified retry',
  async (status) => {
    access = { status, checkedAt: new Date().toISOString() };
    const screen = await mount();
    expect(screen.getByText('access closed')).toBeTruthy();
    access = {
      status: 'verified',
      checkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    await act(async () =>
      runtime.client.queries.invalidateQueries({
        queryKey: accountKey(userId, 'access', 'account'),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('access verified')).toBeTruthy(),
    );
    fetcher.mockRejectedValue(new Error('offline'));
    await act(async () =>
      runtime.client.queries.invalidateQueries({
        queryKey: accountKey(userId, 'access', 'account'),
      }),
    );
    await waitFor(() => expect(screen.getByText('access closed')).toBeTruthy());
  },
);

it('forwards connectivity to the active repository and refreshes only after reconnection', async () => {
  const screen = await mount();
  const repo = runtime.activity.getRepository()!;
  expect(repo.accountId).toBe(userId);
  const listener = jest.mocked(listenToConnectivity).mock.calls.at(-1)![0];
  const refresh = jest.spyOn(runtime.challenges, 'refresh').mockResolvedValue();
  await act(() => listener(false));
  expect(repo.store.getState().online).toBe(false);
  expect(screen.getByText('activity offline')).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
  await act(() => listener(true));
  expect(repo.store.getState().online).toBe(true);
  expect(screen.getByText('activity online')).toBeTruthy();
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(() => onAppState('background'));
  expect(repo.store.getState().active).toBe(false);
  await screen.unmount();
  expect(runtime.activity.getRepository()).toBeNull();
});

it('restores a session while backgrounded without activating uploads until foreground return', async () => {
  const previous = AppState.currentState;
  AppState.currentState = 'background';
  try {
    const screen = await mount();
    // Inactive startup restores identity/history without starting access I/O.
    expect(screen.getByText('access closed')).toBeTruthy();
    expect(runtime.access.getSnapshot().active).toBe(false);
    expect(runtime.activity.getRepository()?.store.getState().active).toBe(
      false,
    );
    await act(async () => onAppState('active'));
    await waitFor(() => expect(runtime.client.queries.isFetching()).toBe(0));
    expect(runtime.activity.getRepository()?.store.getState().active).toBe(
      true,
    );
    expect(screen.getByText('access verified')).toBeTruthy();
  } finally {
    AppState.currentState = previous;
  }
});

it('requires a provider for runtime consumers', async () => {
  await expect(renderHook(() => useRuntime())).rejects.toThrow(
    'AppProvider is required',
  );
});

it('initializes and refreshes account activity without legal receipt requests or a tracking runtime', async () => {
  const screen = await mount();
  await waitFor(() => expect(screen.getByText('access verified')).toBeTruthy());
  expect(runtime.activity.getRepository()?.accountId).toBe(userId);
  expect(runtime).not.toHaveProperty('acceptance');
  expect(
    fetcher.mock.calls.some(([input]) =>
      String(input).includes('/account/acceptance'),
    ),
  ).toBe(false);
  await act(() => onAppState('background'));
  await act(async () => onAppState('active'));
  await waitFor(() => expect(screen.getByText('access verified')).toBeTruthy());
  expect(
    fetcher.mock.calls.some(([input]) =>
      String(input).includes('/account/acceptance'),
    ),
  ).toBe(false);
});

it('keeps the owner-bound local collection after sign-out while stopping account requests', async () => {
  const screen = await mount();
  const repository = runtime.activity.getRepository();
  await act(async () => controller.signOut());
  expect(screen.getByText('disconnected')).toBeTruthy();
  expect(runtime.activity.getRepository()).toBe(repository);
  expect(repository?.store.getState().dataMode).toBe('local');
  expect(runtime.client.ownsCollection(userId)).toBe(true);
  expect(runtime.client.ownsAccount(userId)).toBe(false);
  await expect(
    runtime.client.request('/v1/test', z.unknown()),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

it.each(['api', 'provider'] as const)(
  'restores an account beta approval through %s unavailability without authorizing cloud requests',
  async (failure) => {
    access = { ...access, source: 'free_beta' };
    const first = await mount();
    await waitFor(() =>
      expect(first.getByText('access verified')).toBeTruthy(),
    );
    await waitFor(() => expect(runtime.client.queries.isFetching()).toBe(0));
    await first.unmount();
    await runtime.client.queries.cancelQueries();
    runtime.client.queries.clear();
    runtime.activity.dispose();
    controller.dispose();
    controller = new ManagedIdentityController({
      auth,
      storage: managedStorage,
      legacyVault: vault,
      api: createIdentityApi('http://localhost:3000', (...args) =>
        fetch(...args),
      ),
      secureStorage: {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      },
    });
    jest.mocked(createManagedIdentityController).mockReturnValue(controller);
    if (failure === 'provider')
      jest.mocked(auth.initialize).mockRejectedValue(new Error('offline'));
    fetcher.mockClear();
    fetcher.mockRejectedValue(new Error('offline'));
    const restarted = await mount();
    await waitFor(() =>
      expect(restarted.getByText('access verified')).toBeTruthy(),
    );
    expect(controller.currentSession()).toBeNull();
    expect(runtime.client.ownsAccount(userId)).toBe(false);
    expect(runtime.activity.getRepository()?.store.getState().dataMode).toBe(
      'local',
    );
    expect(runtime.access.getSnapshot()).toMatchObject({
      owner: { id: userId, kind: 'account' },
      authenticated: false,
    });
    await act(async () => jest.advanceTimersByTimeAsync(61_000));
    expect(restarted.getByText('access verified')).toBeTruthy();
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith('/access')),
    ).toBe(false);
    await act(async () => controller.signOut());
    expect(restarted.getByText('access closed')).toBeTruthy();
    expect(runtime.access.getSnapshot().approval).toBeNull();
  },
);
