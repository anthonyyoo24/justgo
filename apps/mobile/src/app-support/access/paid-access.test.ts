import { createElement, useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import { useSuperwallStore } from 'expo-superwall';
import type { SessionResponse } from '@justgo/contracts';
import { asyncStorageJournalStorage } from '../../data/activity/persistence/storage';
import { listenToConnectivity } from '../../platform/connectivity/connectivity';
import { createIdentityApi } from '../identity/api';
import { createMemoryVault } from '../identity/storage';
import { ManagedIdentityController } from '../identity/auth/managed-controller';
import { createManagedIdentityController } from '../identity/auth/create-managed-identity';
import {
  nativeCalls,
  superwallNative,
} from '../../../test-support/superwall-native';
import type {
  ManagedIdentityState,
  ManagedIdentityStorage,
} from '../identity/auth/managed-state';
import type { ManagedAuth, ProviderSession } from '../identity/auth/types';
import {
  AppProvider,
  createAppRuntime,
  useRuntime,
} from '../providers/AppProvider';

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
const api = 'http://localhost:3000';
const minute = 60_000;
const hour = 60 * minute;
const start = Date.parse('2026-11-20T12:00:00.000Z');
const userId = id(1);
const otherUserId = id(8);
const firstToken = 'a'.repeat(64);
const otherToken = 'b'.repeat(64);
const keyOf = (owner: string, kind: 'account' | 'guest') =>
  `justgo:v1:${owner}:access:${kind}:${encodeURIComponent(api)}`;
const iso = (time: number) => new Date(time).toISOString();
const verified = (checkedAt: number, lasts: number) => ({
  status: 'verified',
  checkedAt: iso(checkedAt),
  expiresAt: iso(checkedAt + lasts),
  source: 'subscription',
  productId: 'justgo.monthly',
});
const unpaid = () => ({ status: 'unpaid', checkedAt: iso(Date.now()) });
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

let session: SessionResponse;
let providerSession: ProviderSession;
let stored: ManagedIdentityState | null;
let auth: ManagedAuth;
let controller: ManagedIdentityController;
let fetcher: jest.SpiedFunction<typeof fetch>;
let onAppState: (value: AppStateStatus) => void;
let runtime: ReturnType<typeof createAppRuntime>;
let offline: boolean;
// Each bearer's next /v1/access answer, or a status the server fails with.
let answers: Record<string, () => unknown>;
let guestAnswer: () => unknown;

function Probe() {
  const current = useRuntime();
  useEffect(() => {
    runtime = current;
  }, [current]);
  return null;
}
function newController() {
  const managedStorage: ManagedIdentityStorage = {
    read: jest.fn(async () => stored),
    write: jest.fn(async (next) => {
      stored = next;
    }),
  };
  const secure = new Map<string, string>();
  controller = new ManagedIdentityController({
    auth,
    storage: managedStorage,
    legacyVault: createMemoryVault(),
    api: createIdentityApi(api, (...args) => fetch(...args)),
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
}
async function mount() {
  newController();
  const screen = await render(
    createElement(AppProvider, null, createElement(Probe)),
  );
  await waitFor(() =>
    expect(runtime.identity.getSnapshot().initialized).toBe(true),
  );
  return screen;
}
const accessRequests = () =>
  fetcher.mock.calls.filter(([url]) =>
    /\/v1\/(guest\/)?access$/.test(new URL(String(url)).pathname),
  );
const saved = async (key: string) =>
  JSON.parse((await asyncStorageJournalStorage.getItem(key)) ?? 'null') as {
    receivedAt: number;
    access: { status: string; expiresAt?: string };
  } | null;
const connectivity = () =>
  jest.mocked(listenToConnectivity).mock.calls.at(-1)![0];

beforeEach(async () => {
  for (const key of (await asyncStorageJournalStorage.getAllKeys?.()) ?? [])
    await asyncStorageJournalStorage.removeItem(key);
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  jest.setSystemTime(start);
  process.env.EXPO_PUBLIC_API_URL = api;
  process.env.EXPO_PUBLIC_BILLING_ENABLED = 'true';
  superwallNative.reset();
  useSuperwallStore.setState({
    isConfigured: false,
    isLoading: false,
    listenersInitialized: false,
    configurationError: null,
    user: null,
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  offline = false;
  session = {
    userId,
    deviceId: id(2),
    sessionId: id(3),
    expiresAt: iso(start + 7 * 24 * hour),
  };
  providerSession = {
    authUserId: id(40),
    accessToken: firstToken,
    expiresAt: session.expiresAt,
  };
  stored = {
    version: 1,
    deviceId: session.deviceId,
    guestId: id(50),
    guestAdoption: { ownerId: userId, status: 'consumed' },
    collectionAdoption: null,
    collection: { kind: 'account', id: userId },
    mode: 'account',
    account: {
      ...session,
      authUserId: providerSession.authUserId,
      dataEpoch: 0,
      guest: false,
    },
    pendingSignIn: null,
    pendingLink: null,
    linkedLegacyOwnerIds: [userId],
    logoutPending: false,
    deletion: null,
    deleted: false,
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
  answers = {
    [firstToken]: () => verified(Date.now(), 30 * 24 * hour),
    [otherToken]: unpaid,
  };
  guestAnswer = unpaid;
  fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      if (offline) throw new TypeError('Network request failed');
      const path = new URL(String(input)).pathname;
      if (path === '/v1/access') {
        const bearer = new Headers(init?.headers)
          .get('authorization')
          ?.replace('Bearer ', '');
        const answer = answers[bearer ?? '']?.();
        return typeof answer === 'number'
          ? response({ error: { code: 'UNAVAILABLE' } }, answer)
          : response(answer);
      }
      if (path === '/v1/guest/access') return response(guestAnswer());
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
      if (path.endsWith('/guest/challenges')) return response({ cards: [] });
      if (path.endsWith('/challenges')) return response({ cards: [] });
      throw new Error(`Unexpected fixture request: ${path}`);
    });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      onAppState = listener;
      return { remove: jest.fn() };
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
  delete process.env.EXPO_PUBLIC_API_URL;
  delete process.env.EXPO_PUBLIC_BILLING_ENABLED;
});

it('saves the verified answer per account and starts challenges offline until its expiry, then requires an online check', async () => {
  answers[firstToken] = () => verified(Date.now(), 2 * hour);
  const first = await mount();
  await waitFor(async () =>
    expect((await saved(keyOf(userId, 'account')))?.access.status).toBe(
      'verified',
    ),
  );
  expect(runtime.canStartChallenge()).toBe(true);
  const receivedAt = (await saved(keyOf(userId, 'account')))!.receivedAt;
  expect(receivedAt).toBeGreaterThanOrEqual(start);
  await act(async () => first.unmount());

  // Reopen in airplane mode: the saved verification grants access at once.
  offline = true;
  await mount();
  await waitFor(() => expect(runtime.canStartChallenge()).toBe(true));
  expect(runtime.identity.getSnapshot().account).toBeNull();

  jest.setSystemTime(receivedAt + 2 * hour - minute);
  expect(runtime.canStartChallenge()).toBe(true);
  const check = jest.spyOn(runtime.access!, 'refresh');
  jest.setSystemTime(receivedAt + 2 * hour);
  // At expiry there is no offline grace: the refusal starts an online check.
  expect(runtime.canStartChallenge()).toBe(false);
  expect(check).toHaveBeenCalledTimes(1);
  await act(async () => check.mock.results[0]!.value);
  expect(runtime.canStartChallenge()).toBe(false);
  check.mockRestore();

  // Reconnecting restores the session, which checks with the API by itself.
  offline = false;
  await act(async () => {
    connectivity()(false);
    connectivity()(true);
  });
  await waitFor(async () =>
    expect((await saved(keyOf(userId, 'account')))!.receivedAt).toBe(
      receivedAt + 2 * hour,
    ),
  );
  expect(runtime.canStartChallenge()).toBe(true);
});

it('checks on open, foreground and reconnect only when the snapshot is older than five minutes, coalesced and without polling', async () => {
  await mount();
  await waitFor(() => expect(accessRequests()).toHaveLength(1));
  await act(async () => onAppState('active'));
  await act(async () => {
    connectivity()(false);
    connectivity()(true);
  });
  expect(accessRequests()).toHaveLength(1);

  // Time passing alone sends nothing and blocks nothing.
  await act(async () => jest.advanceTimersByTimeAsync(6 * minute));
  expect(accessRequests()).toHaveLength(1);
  expect(runtime.canStartChallenge()).toBe(true);

  await act(async () => onAppState('active'));
  await waitFor(() => expect(accessRequests()).toHaveLength(2));

  jest.setSystemTime(Date.now() + 6 * minute);
  await act(async () => {
    connectivity()(false);
    connectivity()(true);
  });
  await waitFor(() => expect(accessRequests()).toHaveLength(3));

  jest.setSystemTime(Date.now() + 6 * minute);
  await act(async () => {
    onAppState('active');
    connectivity()(false);
    connectivity()(true);
    await runtime.access!.refresh();
  });
  expect(accessRequests()).toHaveLength(4);
});

it('keeps a saved verification when a check fails and follows the server when it answers', async () => {
  await mount();
  await waitFor(() => expect(runtime.canStartChallenge()).toBe(true));
  jest.setSystemTime(Date.now() + 6 * minute);
  answers[firstToken] = () => 503;
  await act(async () => {
    onAppState('active');
    await runtime.access!.refresh();
  });
  expect(accessRequests().length).toBeGreaterThan(1);
  expect(runtime.canStartChallenge()).toBe(true);

  answers[firstToken] = () => ({
    status: 'unavailable',
    checkedAt: iso(Date.now()),
  });
  await act(async () => {
    onAppState('active');
    await runtime.access!.refresh();
  });
  expect(runtime.canStartChallenge()).toBe(true);
  expect((await saved(keyOf(userId, 'account')))?.access.status).toBe(
    'verified',
  );

  answers[firstToken] = unpaid;
  await act(async () => onAppState('active'));
  await waitFor(() => expect(runtime.canStartChallenge()).toBe(false));
  expect((await saved(keyOf(userId, 'account')))?.access.status).toBe('unpaid');
});

it('accepts a fresh answer from a server clock ahead of the phone and fails closed when the phone clock moves back', async () => {
  answers[firstToken] = () => verified(Date.now() + 3 * hour, hour);
  await mount();
  await waitFor(() => expect(runtime.canStartChallenge()).toBe(true));
  const receivedAt = (await saved(keyOf(userId, 'account')))!.receivedAt;

  offline = true;
  jest.setSystemTime(receivedAt + hour - minute);
  expect(runtime.canStartChallenge()).toBe(true);
  jest.setSystemTime(receivedAt + hour);
  expect(runtime.canStartChallenge()).toBe(false);
  jest.setSystemTime(receivedAt - minute);
  expect(runtime.canStartChallenge()).toBe(false);
});

it("switches to the signed-in account's own snapshot and never reuses another account's", async () => {
  await mount();
  await waitFor(() => expect(runtime.canStartChallenge()).toBe(true));

  await act(async () =>
    controller.rejectSession(firstToken, 'SESSION_REVOKED'),
  );
  // Signed out, the kept collection is checked as a guest, never as the account.
  await waitFor(() => expect(runtime.canStartChallenge()).toBe(false));
  expect((await saved(keyOf(userId, 'account')))?.access.status).toBe(
    'verified',
  );
  session = { ...session, userId: otherUserId };
  providerSession = {
    ...providerSession,
    authUserId: id(80),
    accessToken: otherToken,
  };
  await act(async () => controller.signIn('apple'));
  await waitFor(() =>
    expect(runtime.identity.getSnapshot().account?.userId).toBe(otherUserId),
  );
  expect(runtime.canStartChallenge()).toBe(false);
  await waitFor(async () =>
    expect((await saved(keyOf(otherUserId, 'account')))?.access.status).toBe(
      'unpaid',
    ),
  );
  expect(runtime.canStartChallenge()).toBe(false);
  // Retiring the first account's collection erases its saved access with it.
  await waitFor(async () =>
    expect(await saved(keyOf(userId, 'account'))).toBeNull(),
  );
  const bearers = accessRequests()
    .filter(([url]) => new URL(String(url)).pathname === '/v1/access')
    .map(([, init]) => new Headers(init?.headers).get('authorization'));
  expect(bearers).toEqual([`Bearer ${firstToken}`, `Bearer ${otherToken}`]);
});

it('tells Superwall only the owner ID of the account on the phone and resets it on sign-out', async () => {
  const superwallCalls = () =>
    nativeCalls
      .filter(({ method }) => ['identify', 'reset'].includes(method))
      .map(({ method, args }) => [method, ...args]);
  await mount();
  await waitFor(() =>
    expect(superwallCalls()).toEqual([['identify', userId, undefined]]),
  );

  await act(async () =>
    controller.rejectSession(firstToken, 'SESSION_REVOKED'),
  );
  await waitFor(() =>
    expect(superwallCalls()).toEqual([
      ['identify', userId, undefined],
      ['reset'],
    ]),
  );
  session = { ...session, userId: otherUserId };
  providerSession = {
    ...providerSession,
    authUserId: id(80),
    accessToken: otherToken,
  };
  await act(async () => controller.signIn('apple'));
  await waitFor(() =>
    expect(superwallCalls()).toEqual([
      ['identify', userId, undefined],
      ['reset'],
      ['identify', otherUserId, undefined],
    ]),
  );
  expect(nativeCalls.filter(({ method }) => method === 'configure')).toEqual([
    {
      method: 'configure',
      args: [
        'pk_weeyKXc6nLaH3eMSkyjhB',
        expect.objectContaining({ eventTrackingBehavior: 'superwallOnly' }),
        false,
        expect.any(String),
      ],
    },
  ]);
  expect(nativeCalls.map(({ method }) => method)).not.toContain(
    'setUserAttributes',
  );
});

it("reads a guest's access from the guest route under the guest's own key", async () => {
  stored = null;
  jest.mocked(auth.initialize).mockResolvedValue(null);
  guestAnswer = () => ({
    status: 'verified',
    checkedAt: iso(Date.now()),
    expiresAt: iso(Date.now() + 30 * 24 * hour),
    source: 'free_beta',
  });
  await mount();
  expect(runtime.canStartChallenge()).toBe(false);
  await act(async () => controller.continueAsGuest());
  await waitFor(() => expect(runtime.canStartChallenge()).toBe(true));
  // A guest stays anonymous in Superwall.
  expect(useSuperwallStore.getState().isConfigured).toBe(true);
  expect(
    nativeCalls.filter(({ method }) => ['identify', 'reset'].includes(method)),
  ).toEqual([]);
  const guest = runtime.activity.getRepository()!.accountId;
  expect((await saved(keyOf(guest, 'guest')))?.access.status).toBe('verified');
  expect(
    accessRequests().map(([url]) => new URL(String(url)).pathname),
  ).toEqual(['/v1/guest/access']);
});

it('starts challenges with no access request or saved snapshot when the flag is off', async () => {
  delete process.env.EXPO_PUBLIC_BILLING_ENABLED;
  offline = true;
  await mount();
  expect(runtime.access).toBeNull();
  expect(runtime.superwall).toBeNull();
  expect(runtime.canStartChallenge()).toBe(true);
  offline = false;
  await act(async () => onAppState('active'));
  await act(async () => jest.advanceTimersByTimeAsync(6 * minute));
  expect(accessRequests()).toHaveLength(0);
  expect(
    ((await asyncStorageJournalStorage.getAllKeys?.()) ?? []).filter((key) =>
      key.includes(':access:'),
    ),
  ).toEqual([]);
  expect(nativeCalls).toEqual([]);
});
