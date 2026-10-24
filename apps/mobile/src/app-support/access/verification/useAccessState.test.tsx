import type { PropsWithChildren } from 'react';
import {
  act,
  cleanup,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import type { AccessResponse } from '@justgo/contracts';
import { deferred } from '../../../../test-support/journal';
import {
  AccountClient,
  accountKey,
  type AccountSession,
} from '../../../lib/network/account-client';
import { ApiError, createHttpClient } from '../../../lib/network/http';
import { createBetaApproval, type AccessOwner } from './policy';
import { AccessStore } from './store';
import { canStartChallenge, useAccessState } from './useAccessState';

const start = Date.parse('2026-10-24T12:00:00.000Z');
const origin = 'https://api.beta.example';
const account: AccessOwner = { id: 'synthetic-account', kind: 'account' };
const other: AccessOwner = { id: 'another-account', kind: 'account' };
const guest: AccessOwner = { ...account, kind: 'guest' };
const accessKey = (owner: AccessOwner) =>
  accountKey(owner.id, 'access', owner.kind);
const beta = (
  expiresAt = start + 3_600_000,
  checkedAt = Date.now(),
): AccessResponse => ({
  status: 'verified',
  source: 'free_beta',
  checkedAt: new Date(checkedAt).toISOString(),
  expiresAt: new Date(expiresAt).toISOString(),
});
const strictAccess = (
  checkedAt = Date.now(),
  expiresAt = start + 3_600_000,
): AccessResponse => ({
  status: 'verified',
  checkedAt: new Date(checkedAt).toISOString(),
  expiresAt: new Date(expiresAt).toISOString(),
});
const denial = (): AccessResponse => ({
  status: 'unpaid',
  source: 'free_beta',
  checkedAt: new Date(Date.now()).toISOString(),
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const permanentFailure = () =>
  json({ code: 'INVALID_REQUEST', requestId: 'synthetic-access-read' }, 400);
const clients: AccountClient[] = [];

async function setup({
  owner = account,
  online = true,
  active = true,
  authenticated = online,
  cached,
  readFails = false,
}: {
  owner?: AccessOwner | null;
  online?: boolean;
  active?: boolean;
  authenticated?: boolean;
  cached?: AccessResponse;
  readFails?: boolean;
} = {}) {
  let session: AccountSession | null = null;
  let signedIn = authenticated;
  let selectedOwner = owner;
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => json(denial()),
  );
  const client = new AccountClient(createHttpClient(origin, fetcher), {
    current: () => session,
    renew: async () => {
      throw new ApiError('UNAUTHORIZED');
    },
    reject: jest.fn(),
  });
  clients.push(client);
  const values = new Map<string, string>();
  if (cached && owner)
    values.set(
      `justgo:v1:${owner.id}:access:${owner.kind}:${encodeURIComponent(origin)}`,
      JSON.stringify(createBetaApproval(cached, origin, owner, Date.now())),
    );
  const storage = {
    getItem: jest.fn(async (key: string) => {
      if (readFails) throw new Error('Synthetic read failure');
      return values.get(key) ?? null;
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  const store = new AccessStore(origin, storage, () => Date.now());
  const updateClient = () => {
    session =
      selectedOwner?.kind === 'account' && signedIn
        ? { userId: selectedOwner.id, token: 'synthetic-session-token' }
        : null;
    client.changeAccount(session?.userId ?? null);
    client.changeCollection(selectedOwner?.id ?? null);
  };
  const select = (selected: AccessOwner | null) => {
    selectedOwner = selected;
    updateClient();
    store.changeOwner(selected);
    store.setAuthenticated(!!session);
  };
  const authenticate = (value: boolean) => {
    signedIn = value;
    updateClient();
    store.setAuthenticated(!!session);
  };
  store.setEnvironment({ online, active });
  select(owner);
  if (store.getSnapshot().hydrating) {
    const hydrated = deferred<void>();
    const unsubscribe = store.subscribe(() => {
      if (!store.getSnapshot().hydrating) hydrated.resolve();
    });
    await hydrated.promise;
    unsubscribe();
  }
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client.queries}>
      {children}
    </QueryClientProvider>
  );
  return {
    client,
    store,
    fetcher,
    storage,
    select,
    authenticate,
    mount: async () =>
      await renderHook(() => useAccessState(client, store), { wrapper }),
  };
}
async function advanceTo(now: number) {
  const remaining = now - Date.now();
  expect(remaining).toBeGreaterThanOrEqual(0);
  await act(async () => await jest.advanceTimersByTimeAsync(remaining));
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  jest.setSystemTime(start);
  focusManager.setFocused(true);
});
afterEach(async () => {
  await cleanup();
  for (const client of clients.splice(0)) {
    await client.queries.cancelQueries();
    client.changeAccount(null);
    client.queries.clear();
  }
  await act(async () => await jest.runOnlyPendingTimersAsync());
  jest.restoreAllMocks();
  focusManager.setFocused(undefined);
  jest.useRealTimers();
});

it('keeps a previously approved beta usable offline beyond sixty seconds until its approved expiry', async () => {
  const ctx = await setup({ online: false, cached: beta() });
  const hook = await ctx.mount();
  expect(hook.result.current.verified).toBe(true);
  expect(hook.result.current.isPending).toBe(false);
  await advanceTo(start + 60_001);
  expect(hook.result.current.verified).toBe(true);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(true);
  expect(hook.result.current.data).toEqual(beta(start + 3_600_000, start));
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

it.each([false, true])(
  'keeps first-use offline access denied without an endless loading state (storage failure: %s)',
  async (readFails) => {
    const ctx = await setup({ online: false, readFails });
    const hook = await ctx.mount();
    expect(hook.result.current.verified).toBe(false);
    expect(hook.result.current.isPending).toBe(false);
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.storageUnavailable).toBe(readFails);
    expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  },
);

it('waits for cold account authentication without discarding a valid beta approval', async () => {
  const ctx = await setup({ authenticated: false, cached: beta() });
  const hook = await ctx.mount();
  expect(hook.result.current.verified).toBe(true);
  expect(hook.result.current.isPending).toBe(false);
  expect(ctx.fetcher).not.toHaveBeenCalled();
  await act(() => ctx.authenticate(true));
  await waitFor(() => expect(hook.result.current.data?.status).toBe('unpaid'));
  expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  expect(hook.result.current.verified).toBe(false);
});

it('finishes first-use cold-account loading without granting access and refetches when authentication returns', async () => {
  const ctx = await setup({ authenticated: false });
  ctx.fetcher.mockImplementation(async () => json(beta()));
  const hook = await ctx.mount();
  expect(hook.result.current.verified).toBe(false);
  expect(hook.result.current.isPending).toBe(false);
  expect(ctx.fetcher).not.toHaveBeenCalled();
  await act(() => ctx.authenticate(true));
  await waitFor(() => expect(hook.result.current.verified).toBe(true));
  expect(ctx.fetcher).toHaveBeenCalledTimes(1);
});

it('admits a fresh server-approved tester while its optional cache write is still pending', async () => {
  const ctx = await setup();
  const write = deferred<void>();
  ctx.storage.setItem.mockReturnValueOnce(write.promise);
  ctx.fetcher.mockResolvedValueOnce(json(beta()));
  const hook = await ctx.mount();
  try {
    await waitFor(() => {
      expect(ctx.storage.setItem).toHaveBeenCalledTimes(1);
      expect(hook.result.current.isFetching).toBe(false);
    });
    expect(hook.result.current.verified).toBe(true);
    expect(hook.result.current.isPending).toBe(false);
    expect(canStartChallenge(ctx.client, ctx.store)).toBe(true);
  } finally {
    await act(() => write.resolve());
  }
  expect(hook.result.current.storageUnavailable).toBe(false);
});

it('completes an explicit denial recheck before an older optional cache write finishes', async () => {
  const ctx = await setup();
  const write = deferred<void>();
  const persist = ctx.storage.setItem.getMockImplementation()!;
  ctx.storage.setItem.mockImplementationOnce(async (key, value) => {
    await write.promise;
    await persist(key, value);
  });
  ctx.fetcher.mockResolvedValueOnce(json(beta()));
  const hook = await ctx.mount();
  try {
    await waitFor(() => {
      expect(ctx.storage.setItem).toHaveBeenCalledTimes(1);
      expect(hook.result.current.isFetching).toBe(false);
    });
    expect(hook.result.current.verified).toBe(true);

    await act(async () => await hook.result.current.refetch());
    await waitFor(() => {
      expect(hook.result.current.data?.status).toBe('unpaid');
      expect(hook.result.current.isFetching).toBe(false);
    });
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
    expect(hook.result.current.verified).toBe(false);
    expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
    expect(ctx.store.getSnapshot().approval).toBeNull();
    expect(ctx.storage.removeItem).not.toHaveBeenCalled();
  } finally {
    await act(() => write.resolve());
  }

  await waitFor(() => expect(ctx.storage.removeItem).toHaveBeenCalledTimes(1));
  expect(
    await ctx.storage.getItem(
      `justgo:v1:${account.id}:access:account:${encodeURIComponent(origin)}`,
    ),
  ).toBeNull();
  expect(ctx.store.getSnapshot().approval).toBeNull();
});

it('keeps a pending offline cache read visible as loading until its approval is hydrated', async () => {
  const ctx = await setup({ owner: null, online: false });
  const pending = deferred<string | null>();
  ctx.storage.getItem.mockReturnValueOnce(pending.promise);
  const hook = await ctx.mount();
  await act(() => ctx.select(account));
  expect(hook.result.current.isPending).toBe(true);
  expect(hook.result.current.verified).toBe(false);
  await act(() =>
    pending.resolve(
      JSON.stringify(createBetaApproval(beta(), origin, account, Date.now())),
    ),
  );
  expect(hook.result.current.isPending).toBe(false);
  expect(hook.result.current.verified).toBe(true);
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

it('invalidates beta admission on a successful denial before older Query beta data is replaced', async () => {
  const previous = beta();
  const ctx = await setup({
    online: false,
    authenticated: true,
    cached: previous,
  });
  ctx.client.queries.setQueryData(accessKey(account), previous);
  const hook = await ctx.mount();
  expect(hook.result.current.verified).toBe(true);
  const duringDenial = jest.fn();
  const unsubscribe = ctx.store.subscribe(() => {
    if (!ctx.store.getSnapshot().approval)
      duringDenial({
        query: ctx.client.queries.getQueryData(accessKey(account)),
        allowed: canStartChallenge(ctx.client, ctx.store),
      });
  });
  try {
    await act(async () => await hook.result.current.refetch());
    expect(duringDenial).toHaveBeenCalledWith({
      query: previous,
      allowed: false,
    });
    expect(hook.result.current.verified).toBe(false);
    await waitFor(() =>
      expect(hook.result.current.data?.status).toBe('unpaid'),
    );
    expect(hook.result.current.isPending).toBe(false);
    expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
  } finally {
    unsubscribe();
  }
});

it('never admits stale beta Query data when no validated offline approval exists', async () => {
  const ctx = await setup({ online: false });
  ctx.client.queries.setQueryData(accessKey(account), beta());
  const hook = await ctx.mount();
  expect(hook.result.current.data?.status).toBe('verified');
  expect(hook.result.current.verified).toBe(false);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
});

it('keeps beta admission through a transient access failure while its approved window remains open', async () => {
  const ctx = await setup({ cached: beta() });
  ctx.fetcher.mockRejectedValue(new Error('Synthetic offline transport'));
  const hook = await ctx.mount();
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.verified).toBe(true);
  expect(hook.result.current.isPending).toBe(false);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(true);
});

it('retains strict non-beta freshness, closing precisely after sixty seconds even when offline', async () => {
  const ctx = await setup({ online: false });
  const access = strictAccess();
  ctx.client.queries.setQueryData(accessKey(account), access);
  const hook = await ctx.mount();
  expect(hook.result.current.verified).toBe(true);
  expect(ctx.store.getSnapshot().approval).toBeNull();
  await advanceTo(start + 59_999);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(true);
  await advanceTo(start + 60_000);
  expect(hook.result.current.verified).toBe(false);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

it('closes non-beta admission on a failed refresh even while the cached response remains fresh', async () => {
  const ctx = await setup();
  ctx.client.queries.setQueryData(accessKey(account), strictAccess());
  ctx.fetcher.mockResolvedValue(permanentFailure());
  const hook = await ctx.mount();
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data?.status).toBe('verified');
  expect(hook.result.current.verified).toBe(false);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
});

it('uses the earlier non-beta server expiry and bounded clock alignment rather than beta persistence', async () => {
  const ctx = await setup({ online: false });
  ctx.client.queries.setQueryData(
    accessKey(account),
    strictAccess(start + 5_000, start + 7_000),
  );
  const hook = await ctx.mount();
  expect(hook.result.current.verified).toBe(true);
  await advanceTo(start + 1_999);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(true);
  await advanceTo(start + 2_000);
  expect(hook.result.current.verified).toBe(false);
  expect(ctx.store.getSnapshot().approval).toBeNull();
});

it('closes beta access at its exact expiry without adding an unscheduled network refresh', async () => {
  const ctx = await setup();
  ctx.fetcher.mockResolvedValueOnce(json(beta(start + 2_000)));
  const hook = await ctx.mount();
  await waitFor(() => expect(hook.result.current.verified).toBe(true));
  await advanceTo(start + 1_999);
  expect(hook.result.current.verified).toBe(true);
  expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  await advanceTo(start + 2_000);
  expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  expect(hook.result.current.verified).toBe(false);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
  await advanceTo(start + 30_000);
  await waitFor(() => expect(hook.result.current.data?.status).toBe('unpaid'));
  expect(ctx.fetcher).toHaveBeenCalledTimes(2);
});

it('reschedules a distant beta expiry with bounded timers and still closes on the exact deadline', async () => {
  const maximum = 2_147_483_647;
  const ctx = await setup({
    online: false,
    cached: beta(start + maximum + 1_234),
  });
  const scheduling = jest.spyOn(globalThis, 'setTimeout');
  const hook = await ctx.mount();
  expect(scheduling).toHaveBeenCalledWith(expect.any(Function), maximum);
  await advanceTo(start + maximum);
  expect(hook.result.current.verified).toBe(true);
  expect(scheduling).toHaveBeenCalledWith(expect.any(Function), 1_234);
  await advanceTo(start + maximum + 1_233);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(true);
  await advanceTo(start + maximum + 1_234);
  expect(hook.result.current.verified).toBe(false);
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

it('pauses polling while inactive or offline and resumes verification when both become available', async () => {
  const ctx = await setup();
  ctx.fetcher.mockImplementation(async () => json(beta()));
  const hook = await ctx.mount();
  await waitFor(() => expect(hook.result.current.verified).toBe(true));
  expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  await act(() => ctx.store.setEnvironment({ online: true, active: false }));
  await advanceTo(start + 31_000);
  expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  await act(() => ctx.store.setEnvironment({ online: false, active: true }));
  await advanceTo(start + 62_000);
  expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  expect(hook.result.current.verified).toBe(true);
  await act(() => ctx.store.setEnvironment({ online: true, active: true }));
  await waitFor(() => expect(ctx.fetcher).toHaveBeenCalledTimes(2));
});

it('expires locally without refetching while the application is inactive', async () => {
  const ctx = await setup({ active: false, cached: beta(start + 1_000) });
  const hook = await ctx.mount();
  expect(hook.result.current.verified).toBe(true);
  await advanceTo(start + 1_000);
  expect(hook.result.current.verified).toBe(false);
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

it.each([other, guest])(
  'fences an old account request when selecting owner/mode %j and uses the correct new endpoint',
  async (nextOwner) => {
    const ctx = await setup();
    const old = deferred<Response>();
    ctx.fetcher
      .mockReturnValueOnce(old.promise)
      .mockImplementation(async () => json(beta()));
    const hook = await ctx.mount();
    expect(hook.result.current.isPending).toBe(true);
    const oldSignal = ctx.fetcher.mock.calls[0]![1]?.signal;
    expect(oldSignal?.aborted).toBe(false);
    await act(() => ctx.select(nextOwner));
    await waitFor(() => expect(hook.result.current.verified).toBe(true));
    expect(oldSignal?.aborted).toBe(true);
    await act(() => old.resolve(json(beta())));
    expect(ctx.store.getSnapshot().approval?.owner).toEqual(nextOwner);
    expect(canStartChallenge(ctx.client, ctx.store)).toBe(true);
    const [target, options] = ctx.fetcher.mock.calls.at(-1)!;
    expect(target).toBe(
      `${origin}/v1/${nextOwner.kind === 'guest' ? 'guest/' : ''}access`,
    );
    if (nextOwner.kind === 'guest')
      expect(options?.headers).not.toHaveProperty('authorization');
  },
);

it('ignores a cancelled response even if the transport ignores the query AbortSignal', async () => {
  const ctx = await setup();
  const response = deferred<AccessResponse>();
  let signal: AbortSignal | undefined;
  jest
    .spyOn(ctx.client, 'request')
    .mockImplementationOnce(async (_path, schema, options) => {
      signal = options?.signal;
      return schema.parse(await response.promise);
    });
  const receive = jest.spyOn(ctx.store, 'receive');
  const hook = await ctx.mount();
  expect(hook.result.current.isPending).toBe(true);
  await act(async () => await ctx.client.queries.cancelQueries());
  expect(signal?.aborted).toBe(true);
  await act(() => response.resolve(beta()));
  expect(receive).not.toHaveBeenCalled();
  expect(ctx.store.getSnapshot().approval).toBeNull();
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
});

it('denies a refetch when the current owner can no longer obtain a request lease', async () => {
  const ctx = await setup({ online: false });
  const hook = await ctx.mount();
  await act(() => ctx.select(other));
  // Ownership may change between rendering the observer and obtaining its lease.
  const beginRequest = jest
    .spyOn(ctx.store, 'beginRequest')
    .mockReturnValueOnce(null);
  await act(async () => await hook.result.current.refetch());
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(beginRequest).toHaveBeenCalledWith(other);
  expect(
    ctx.client.queries.getQueryState(accessKey(other))?.error,
  ).toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(ctx.fetcher).not.toHaveBeenCalled();
  expect(ctx.store.getSnapshot()).toMatchObject({
    owner: other,
    approval: null,
  });
  expect(hook.result.current.verified).toBe(false);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
});

it('fails closed without an owner, including an explicit refetch, and cleans up expiry timers and subscriptions', async () => {
  const ctx = await setup({ owner: null, online: false });
  const hook = await ctx.mount();
  expect(hook.result.current.isPending).toBe(false);
  expect(canStartChallenge(ctx.client, ctx.store)).toBe(false);
  await act(async () => {
    const result = await hook.result.current.refetch();
    expect(result.error).toMatchObject({ code: 'ACCOUNT_CHANGED' });
  });
  expect(ctx.fetcher).not.toHaveBeenCalled();
  await hook.unmount();

  await act(() => ctx.select(account));
  const lease = ctx.store.beginRequest(account);
  expect(lease).not.toBeNull();
  await ctx.store.receive(lease!, beta(start + 1_000), Date.now());
  const clear = jest.spyOn(globalThis, 'clearTimeout');
  const scheduled = jest.spyOn(globalThis, 'setTimeout');
  const approved = await ctx.mount();
  expect(approved.result.current.verified).toBe(true);
  const before = ctx.fetcher.mock.calls.length;
  const expiryIndex = scheduled.mock.calls.findIndex(
    ([, delay]) => delay === start + 1_000 - Date.now(),
  );
  expect(expiryIndex).toBeGreaterThanOrEqual(0);
  const expiryTimer = scheduled.mock.results[expiryIndex]!.value;
  await approved.unmount();
  expect(clear).toHaveBeenCalledWith(expiryTimer);
  await advanceTo(start + 2_000);
  expect(ctx.fetcher).toHaveBeenCalledTimes(before);
});
