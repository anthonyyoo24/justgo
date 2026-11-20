import { createElement, useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import type { SessionResponse } from '@justgo/contracts';
import { asyncStorageJournalStorage } from '../../data/activity/persistence/storage';
import { listenToConnectivity } from '../../platform/connectivity/connectivity';
import { createIdentityApi } from '../identity/api';
import { createMemoryVault } from '../identity/storage';
import { ManagedIdentityController } from '../identity/auth/managed-controller';
import { createManagedIdentityController } from '../identity/auth/create-managed-identity';
import type {
  ManagedIdentityState,
  ManagedIdentityStorage,
} from '../identity/auth/managed-state';
import type { ManagedAuth, ProviderSession } from '../identity/auth/types';
import { AccountClient } from '../../lib/network/account-client';
import { createHttpClient } from '../../lib/network/http';
import { PaidAccess } from './paid-access';
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
const failureCodes: Record<number, string> = {
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  503: 'UNAVAILABLE',
};
const reply = (body: unknown) =>
  typeof body === 'number'
    ? response(
        { code: failureCodes[body] ?? 'UNAVAILABLE', requestId: 'fixture' },
        body,
      )
    : response(body);

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
// Each bearer's next /v1/billing/verifications answer ('' for a guest), or a status the server fails with.
let verifications: Record<string, (transactionId: string) => unknown>;
// Holds the next request to this path until the test releases it.
let held: { path: string; release: Promise<void> } | null;

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
  verifications = {};
  held = null;
  fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      if (offline) throw new TypeError('Network request failed');
      const path = new URL(String(input)).pathname;
      if (held?.path === path) {
        const { release } = held;
        held = null;
        await release;
      }
      if (path === '/v1/billing/verifications') {
        const bearer =
          new Headers(init?.headers)
            .get('authorization')
            ?.replace('Bearer ', '') ?? '';
        const { transactionId } = JSON.parse(String(init?.body)) as {
          transactionId: string;
        };
        return reply((verifications[bearer] ?? unpaid)(transactionId));
      }
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
});

describe('purchase verification', () => {
  const guestId = id(60);
  const purchase = '2000000001';
  const verifications$ = () =>
    fetcher.mock.calls.filter(
      ([url]) => new URL(String(url)).pathname === '/v1/billing/verifications',
    );
  const bearerOf = (init: RequestInit | undefined) =>
    new Headers(init?.headers).get('authorization');
  const guestVerified = () => ({
    ...verified(Date.now(), 30 * 24 * hour),
    source: 'guest_subscription',
  });
  function paidAccess(
    kind: 'account' | 'guest',
    latestTransactionId?: () => Promise<string | null>,
  ) {
    const client = new AccountClient(createHttpClient(api), {
      current: () => ({ userId, token: firstToken }),
      renew: async () => ({ userId, token: firstToken }),
      reject: () => {},
    });
    if (kind === 'account') client.changeAccount(userId);
    else client.changeCollection(guestId);
    const access = new PaidAccess({
      url: api,
      storage: asyncStorageJournalStorage,
      client,
      ...(latestTransactionId ? { latestTransactionId } : {}),
    });
    access.changeOwner({ id: kind === 'account' ? userId : guestId, kind });
    return access;
  }
  const release = () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { gate, open };
  };

  it('verifies a purchase at once with the account bearer, past a fresh unpaid answer, and tells listeners', async () => {
    answers[firstToken] = unpaid;
    verifications[firstToken] = () => verified(Date.now(), 30 * 24 * hour);
    const access = paidAccess('account');
    await access.refresh();
    expect(access.canStart()).toBe(false);
    const listener = jest.fn();
    access.subscribe(listener);

    await expect(access.verifyPurchase(purchase)).resolves.toMatchObject({
      status: 'verified',
    });
    expect(access.canStart()).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(verifications$().map(([, init]) => bearerOf(init))).toEqual([
      `Bearer ${firstToken}`,
    ]);
    expect(JSON.parse(String(verifications$()[0]![1]?.body))).toEqual({
      transactionId: purchase,
    });
    await access.settled();
    expect((await saved(keyOf(userId, 'account')))?.access.status).toBe(
      'verified',
    );
  });

  it("verifies a guest purchase with no bearer under the guest's own key", async () => {
    verifications[''] = guestVerified;
    const access = paidAccess('guest');
    await access.refresh();
    expect(access.canStart()).toBe(false);
    await expect(access.verifyPurchase(purchase)).resolves.toMatchObject({
      status: 'verified',
      source: 'guest_subscription',
    });
    expect(access.canStart()).toBe(true);
    expect(verifications$().map(([, init]) => bearerOf(init))).toEqual([null]);
    await access.settled();
    expect((await saved(keyOf(guestId, 'guest')))?.access.status).toBe(
      'verified',
    );
  });

  it('keeps the saved answer when verification fails or the server is unavailable, and saves a refusal', async () => {
    const access = paidAccess('account');
    await access.refresh();
    expect(access.canStart()).toBe(true);

    verifications[firstToken] = () => 503;
    await expect(access.verifyPurchase(purchase)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    verifications[firstToken] = () => 409;
    await expect(access.verifyPurchase(purchase)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    verifications[firstToken] = () => ({
      status: 'unavailable',
      checkedAt: iso(Date.now()),
    });
    await expect(access.verifyPurchase(purchase)).resolves.toMatchObject({
      status: 'unavailable',
    });
    expect(access.canStart()).toBe(true);
    await access.settled();
    expect((await saved(keyOf(userId, 'account')))?.access.status).toBe(
      'verified',
    );

    verifications[firstToken] = unpaid;
    await expect(access.verifyPurchase(purchase)).resolves.toMatchObject({
      status: 'unpaid',
    });
    expect(access.canStart()).toBe(false);
  });

  it('refuses to save a verification that lands after the owner changed', async () => {
    answers[firstToken] = unpaid;
    verifications[firstToken] = () => verified(Date.now(), 30 * 24 * hour);
    const access = paidAccess('account');
    await access.refresh();
    const { gate, open } = release();
    held = { path: '/v1/billing/verifications', release: gate };
    const result = access.verifyPurchase(purchase).catch((error) => error);
    await act(async () => jest.advanceTimersByTimeAsync(0));
    access.changeOwner({ id: guestId, kind: 'guest' });
    open();
    expect(await result).toMatchObject({ code: 'ACCOUNT_CHANGED' });
    await access.refresh();
    expect(access.canStart()).toBe(false);
    access.changeOwner({ id: userId, kind: 'account' });
    await access.refresh();
    await access.settled();
    expect(access.canStart()).toBe(false);
    expect((await saved(keyOf(userId, 'account')))?.access.status).toBe(
      'unpaid',
    );
  });

  it('drops an older check that lands after a purchase verification', async () => {
    answers[firstToken] = unpaid;
    verifications[firstToken] = () => verified(Date.now(), 30 * 24 * hour);
    const { gate, open } = release();
    held = { path: '/v1/access', release: gate };
    const access = paidAccess('account');
    const check = access.refresh();
    await act(async () => jest.advanceTimersByTimeAsync(0));
    await access.verifyPurchase(purchase);
    expect(access.canStart()).toBe(true);
    open();
    await check;
    expect(access.canStart()).toBe(true);
    await access.settled();
    expect((await saved(keyOf(userId, 'account')))?.access.status).toBe(
      'verified',
    );
  });

  it('posts the latest transaction instead of asking the guest route, so a paid guest keeps access', async () => {
    verifications[''] = guestVerified;
    const access = paidAccess('guest', async () => purchase);
    await access.refresh();
    expect(access.canStart()).toBe(true);
    expect(
      fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual(['/v1/billing/verifications']);
  });

  it.each([
    ['has no transaction', async () => null],
    [
      'fails',
      async () => {
        throw new Error('store unavailable');
      },
    ],
  ])(
    'asks the guest route when the store %s',
    async (_name, latestTransactionId) => {
      const access = paidAccess('guest', latestTransactionId);
      await access.refresh();
      expect(access.canStart()).toBe(false);
      expect(
        fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname),
      ).toEqual(['/v1/guest/access']);
    },
  );

  it('posts the latest transaction only when the account answer is unpaid', async () => {
    const latestTransactionId = jest.fn(async () => purchase);
    verifications[firstToken] = () => verified(Date.now(), 30 * 24 * hour);
    const paid = paidAccess('account', latestTransactionId);
    await paid.refresh();
    expect(paid.canStart()).toBe(true);
    expect(verifications$()).toHaveLength(0);

    answers[firstToken] = unpaid;
    jest.setSystemTime(Date.now() + 6 * minute);
    await paid.refresh();
    expect(paid.canStart()).toBe(true);
    expect(
      fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual(['/v1/access', '/v1/access', '/v1/billing/verifications']);

    verifications[firstToken] = () => 503;
    jest.setSystemTime(Date.now() + 6 * minute);
    await paid.refresh();
    expect(paid.canStart()).toBe(false);
    await paid.settled();
    expect((await saved(keyOf(userId, 'account')))?.access.status).toBe(
      'unpaid',
    );
  });
});
