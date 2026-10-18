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
import { focusManager, notifyManager } from '@tanstack/react-query';
import { z } from 'zod';
import {
  CURRENT_ACCEPTANCE_VERSIONS,
  type AccessResponse,
  type SessionResponse,
} from '@justgo/contracts';
import { accountKey } from '../../lib/network/account-client';
import { createIdentityApi } from '../identity/api';
import { IdentityController } from '../identity/controller';
import { createMemoryVault, type CredentialVault } from '../identity/storage';
import { createVault } from '../identity/vault';
import {
  AppProvider,
  createAppRuntime,
  useAccess,
  useActivityState,
  useIdentity,
  useRuntime,
  useAcceptance,
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
jest.mock('../../data/activity/persistence/storage', () => ({
  asyncStorageJournalStorage: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
jest.mock('../identity/vault', () => ({ createVault: jest.fn() }));
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const token = 'a'.repeat(64);
const userId = id(1);
let session: SessionResponse;
let vault: CredentialVault;
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
  const acceptance = useAcceptance();
  return (
    <>
      <Text>{identity.initialized ? 'initialized' : 'starting'}</Text>
      <Text>{identity.account?.userId ?? 'disconnected'}</Text>
      <Text>{access.verified ? 'access verified' : 'access closed'}</Text>
      <Text>{identity.message}</Text>
      <Text>{`acceptance: ${acceptance.status}`}</Text>
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
  const screen = render(
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
    runtime.client.queries.setQueryData(accountKey(userId, 'access'), value);
    await jest.advanceTimersByTimeAsync(0);
  });
}

beforeEach(async () => {
  // Control polling/freshness and flush scheduled notifications before restoring timers.
  jest.useFakeTimers({ doNotFake: ['performance'] });
  notifyManager.setNotifyFunction((notify) => act(notify));
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
  jest.mocked(createVault).mockReturnValue(vault);
  fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith('/sessions/current')) return response(session);
      if (path.endsWith('/devices')) return response({ devices: [] });
      if (path.endsWith('/credentials')) return response({ credentials: [] });
      if (path.endsWith('/access')) return response(access);
      if (path.endsWith('/account/acceptance'))
        return response({
          userId,
          analyticsRestricted: false,
          receipt: {
            userId,
            ...CURRENT_ACCEPTANCE_VERSIONS,
            acceptedAt: new Date(Date.now() - 1000).toISOString(),
          },
        });
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
  await act(async () => cleanup());
  await runtime?.client.queries.cancelQueries();
  runtime?.client.queries.clear();
  focusManager.setFocused(undefined);
  notifyManager.setNotifyFunction((notify) => notify());
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
    runtime.client.queries.getQueryData(accountKey(userId, 'access')),
  ).toEqual(access);
  const originalRuntime = runtime;
  screen.rerender(
    <AppProvider>
      <Probe />
      <Text>rerender</Text>
    </AppProvider>,
  );
  expect(runtime).toBe(originalRuntime);
  expect(
    fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith('/sessions/current'),
    ),
  ).toHaveLength(1);
});

it('keeps unavailable storage disconnected without bootstrapping or checking access', async () => {
  jest.spyOn(vault, 'read').mockRejectedValue(new Error('locked'));
  const screen = await mount();
  expect(screen.getByText('disconnected')).toBeTruthy();
  expect(screen.getByText('access closed')).toBeTruthy();
  expect(screen.getByText('activity disconnected')).toBeTruthy();
  expect(screen.getByText(/Secure storage is unavailable/)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
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
  act(() => runtime.identity.rejectSession(token, 'SESSION_REVOKED'));
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
  fetcher.mockImplementation(async (input, init) => {
    if (String(input).endsWith('/sessions')) {
      const proposal = JSON.parse(String(init?.body)) as SessionResponse;
      session = {
        ...session,
        deviceId: proposal.deviceId,
        sessionId: proposal.sessionId,
      };
      return response(session);
    }
    if (String(input).endsWith('/devices')) return response({ devices: [] });
    if (String(input).endsWith('/credentials'))
      return response(init?.body ? { ok: true } : { credentials: [] });
    return response(access);
  });
  await act(async () => runtime.identity.recoverKey('b'.repeat(64)));
  await waitFor(() => expect(screen.getByText(id(8))).toBeTruthy());
  await waitFor(() => expect(runtime.client.queries.isFetching()).toBe(0));
  expect(
    runtime.client.queries.getQueryData(accountKey(userId, 'access')),
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

it('hides recovery keys on background, refreshes on foreground and releases listeners on unmount', async () => {
  const screen = await mount();
  const hide = jest.spyOn(runtime.identity, 'hideKey');
  const retry = jest.spyOn(runtime.identity, 'retry');
  const invalidate = jest.spyOn(runtime.client.queries, 'invalidateQueries');
  const refresh = jest.spyOn(runtime.challenges, 'refresh').mockResolvedValue();
  const track = jest.spyOn(runtime.telemetry, 'track');
  act(() => onAppState('background'));
  expect(hide).toHaveBeenCalledTimes(1);
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
  screen.unmount();
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
        queryKey: accountKey(userId, 'access'),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('access verified')).toBeTruthy(),
    );
    fetcher.mockRejectedValue(new Error('offline'));
    await act(async () =>
      runtime.client.queries.invalidateQueries({
        queryKey: accountKey(userId, 'access'),
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
  act(() => listener(false));
  expect(repo.store.getState().online).toBe(false);
  expect(screen.getByText('activity offline')).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
  act(() => listener(true));
  expect(repo.store.getState().online).toBe(true);
  expect(screen.getByText('activity online')).toBeTruthy();
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => onAppState('background'));
  expect(repo.store.getState().active).toBe(false);
  screen.unmount();
  expect(runtime.activity.getRepository()).toBeNull();
});

it('restores a session while backgrounded without activating uploads until foreground return', async () => {
  const previous = AppState.currentState;
  AppState.currentState = 'background';
  try {
    const screen = await mount();
    await waitFor(() =>
      expect(screen.getByText('access verified')).toBeTruthy(),
    );
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

it('requires a provider for runtime consumers', () => {
  expect(() => renderHook(() => useRuntime())).toThrow(
    'AppProvider is required',
  );
});

it('keeps paid access and account activity independent of acceptance-service failure', async () => {
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (input, init) => {
    if (String(input).endsWith('/account/acceptance'))
      throw new Error('offline');
    return original(input, init);
  });
  const screen = await mount();
  await waitFor(() =>
    expect(screen.getByText('acceptance: error')).toBeTruthy(),
  );
  await waitFor(() => expect(screen.getByText('access verified')).toBeTruthy());
  expect(runtime.activity.getRepository()?.accountId).toBe(userId);
  expect(
    runtime.acceptance.capture({
      userId,
      occurredAt: new Date().toISOString(),
    }),
  ).toBeNull();
});

it('closes analytics eligibility immediately in background and requires fresh foreground confirmation', async () => {
  await mount();
  await waitFor(() =>
    expect(runtime.acceptance.getSnapshot().confirmed).toBe(true),
  );
  const event = { userId, occurredAt: new Date().toISOString() };
  const ticket = runtime.acceptance.capture(event)!;
  expect(runtime.acceptance.canDeliver(ticket)).toBe(true);
  act(() => onAppState('background'));
  expect(runtime.acceptance.canDeliver(ticket)).toBe(false);
  await act(async () => onAppState('active'));
  await waitFor(() =>
    expect(runtime.acceptance.getSnapshot().confirmed).toBe(true),
  );
  expect(runtime.acceptance.canDeliver(ticket)).toBe(false);
  expect(
    runtime.acceptance.capture({
      ...event,
      occurredAt: new Date().toISOString(),
    }),
  ).not.toBeNull();
});

it('cancels a receiving transfer in the background and retries durable cleanup on reconnection', async () => {
  const screen = await mount();
  const online = jest.mocked(listenToConnectivity).mock.calls.at(-1)![0];
  let offline = true;
  const originalFetch = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (input, init) => {
    const path = String(input);
    if (path.endsWith('/transfers') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      return response({
        id: body.id,
        status: 'waiting',
        verification: '012345',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
    }
    if (path.includes('/transfers/') && init?.method === 'DELETE') {
      if (offline) throw new Error('Synthetic offline cancellation');
      return response({ status: 'cancelled' });
    }
    return originalFetch(input, init);
  });
  await act(async () => {
    await runtime.identity.startTransfer();
  });
  act(() => onAppState('inactive'));
  await act(async () => {
    await runtime.identity.cancelTransfer();
  });
  expect(runtime.identity.getSnapshot().account).toEqual(session);
  expect(runtime.identity.getSnapshot().transfer).toBeNull();
  expect(runtime.identity.getSnapshot().cancellationPending).toBe(true);
  act(() => onAppState('active'));
  await waitFor(() => expect(runtime.identity.getSnapshot().busy).toBe(false));
  act(() => online(false));
  offline = false;
  act(() => online(true));
  await waitFor(() =>
    expect(runtime.identity.getSnapshot().cancellationPending).toBe(false),
  );
  await waitFor(() => expect(runtime.client.queries.isFetching()).toBe(0));
  expect((await vault.read())!.pending).toBeNull();
  screen.unmount();
});
