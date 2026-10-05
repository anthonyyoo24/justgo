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
import { type AccessResponse, type SessionResponse } from '@justgo/contracts';
import { accountKey } from '../../lib/account-client';
import { createIdentityApi } from '../../features/identity/api';
import { IdentityController } from '../../features/identity/controller';
import {
  createMemoryVault,
  type CredentialVault,
} from '../../features/identity/storage';
import { createVault } from '../../features/identity/vault';
import {
  AppProvider,
  createAppRuntime,
  useAccess,
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
jest.mock('../../features/identity/vault', () => ({ createVault: jest.fn() }));
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
  new Response(JSON.stringify(body), { status });

function Probe() {
  const currentRuntime = useRuntime();
  useEffect(() => {
    runtime = currentRuntime;
  }, [currentRuntime]);
  const identity = useIdentity();
  const access = useAccess();
  return (
    <>
      <Text>{identity.initialized ? 'initialized' : 'starting'}</Text>
      <Text>{identity.account?.userId ?? 'disconnected'}</Text>
      <Text>{access.verified ? 'access verified' : 'access closed'}</Text>
      <Text>{identity.message}</Text>
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
    state: null,
    queues: {},
    success: null,
    pending: null,
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

it('requires a provider for runtime consumers', () => {
  expect(() => renderHook(() => useRuntime())).toThrow(
    'AppProvider is required',
  );
});
