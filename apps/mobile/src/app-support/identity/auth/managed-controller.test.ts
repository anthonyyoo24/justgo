import {
  managedIdentityStateSchema,
  type ManagedIdentityState,
} from './managed-state';
import { ManagedIdentityController } from './managed-controller';
import {
  ProviderAuthError,
  type ManagedAuth,
  type ProviderSession,
  type SignInProvider,
} from './types';
import { createMemoryVault } from '../storage';
import type { IdentityApi } from '../api';
import { ApiError } from '../../../lib/network/http';
import { deferred } from '../../../../test-support/journal';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const uuid = (n: number) =>
  `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const session: ProviderSession = {
  authUserId: uuid(40),
  accessToken: 'synthetic-provider-token',
  expiresAt: '2030-01-01T00:00:00.000Z',
  linkedProviders: ['apple'],
};
const account = {
  userId: uuid(50),
  authUserId: session.authUserId,
  deviceId: uuid(2),
  sessionId: uuid(60),
  expiresAt: session.expiresAt,
  dataEpoch: 0,
};
const legacyInfo = {
  userId: account.userId,
  deviceId: account.deviceId,
  sessionId: account.sessionId,
  expiresAt: account.expiresAt,
};
function setup(connectionDiagnostics = false) {
  let state: ManagedIdentityState | null = null;
  const stored = new Map<string, string>();
  let provider: ProviderSession | null = null;
  const auth: jest.Mocked<ManagedAuth> = {
    initialize: jest.fn(async () => provider),
    signIn: jest.fn(async (providerName: SignInProvider) => {
      void providerName;
      provider = session;
      return provider;
    }),
    refresh: jest.fn(async () => {
      provider = { ...session, accessToken: 'refreshed-provider-token' };
      return provider;
    }),
    linkIdentity: jest.fn(async (providerName: SignInProvider) => {
      void providerName;
      return provider;
    }),
    unlinkIdentity: jest.fn(async (providerName: SignInProvider) => {
      void providerName;
      return session;
    }),
    signOut: jest.fn(async () => {
      provider = null;
    }),
    setActive: jest.fn(),
    subscribe: jest.fn(
      (listener: (session: ProviderSession | null) => void) => {
        void listener;
        return () => {};
      },
    ),
    dispose: jest.fn(),
  };
  const storage = {
    read: jest.fn(async () =>
      state ? managedIdentityStateSchema.parse(state) : null,
    ),
    write: jest.fn(async (next: ManagedIdentityState) => {
      state = managedIdentityStateSchema.parse(next);
    }),
  };
  const calls: {
    method: string;
    path: string;
    body: unknown;
    token: string | undefined;
  }[] = [];
  let failure: Error | null = null;
  let returnedAccount = { ...account };
  const verifiedAccounts = new Map<
    string,
    typeof account | Error | (() => Promise<typeof account>)
  >();
  const api: IdentityApi = {
    request: async (method, path, schema, body, token) => {
      calls.push({ method, path, body, token });
      if (failure) throw failure;
      if (
        method === 'GET' &&
        path === '/auth/session' &&
        token &&
        verifiedAccounts.has(token)
      ) {
        const value = verifiedAccounts.get(token);
        if (value instanceof Error) throw value;
        return schema.parse(
          typeof value === 'function' ? await value() : value,
        );
      }
      return schema.parse(
        path === '/auth/logout'
          ? { ok: true }
          : path === '/account'
            ? {
                userId: account.userId,
                deletedAt: '2026-10-20T20:00:00.000Z',
                credentialDigests: [],
              }
            : returnedAccount,
      );
    },
  };
  const secureStorage = {
    getItem: jest.fn(async (key: string) => stored.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      stored.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      stored.delete(key);
    }),
  };
  const vault = createMemoryVault();
  const create = () => {
    let id = 1;
    const controller = new ManagedIdentityController({
      auth,
      storage,
      api,
      secureStorage,
      legacyVault: vault,
      randomId: () => uuid(id++),
      connectionDiagnostics,
    });
    controller.setGuestDataMerger(jest.fn(async () => {}));
    controller.setGuestDataRetirer(jest.fn(async () => {}));
    return controller;
  };
  const controller = create();
  return {
    controller,
    create,
    api,
    storage,
    auth,
    calls,
    secureStorage,
    stored,
    vault,
    saved: () => state,
    setFailure: (error: Error | null) => {
      failure = error;
    },
    setVerifiedAccount: (
      token: string,
      value: typeof account | Error | (() => Promise<typeof account>),
    ) => verifiedAccounts.set(token, value),
    setAccount: (value: typeof account) => {
      returnedAccount = value;
    },
    setProvider: (value: ProviderSession | null) => {
      provider = value;
    },
  };
}

it('enters a durable guest collection without creating a server or Auth account', async () => {
  const ctx = setup();
  expect(ctx.controller.offlineAccountOwner()).toBeNull();
  await ctx.controller.initialize();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'welcome',
    needsWelcome: true,
    account: null,
  });
  await ctx.controller.continueAsGuest();
  const guestId = ctx.controller.getSnapshot().collectionId;
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'guest',
    needsWelcome: false,
    collectionKind: 'guest',
  });
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.offlineAccountOwner()).toBeNull();
  expect(ctx.calls).toEqual([]);
  expect(ctx.auth.signIn).not.toHaveBeenCalled();
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    collectionId: guestId,
    mode: 'guest',
    account: null,
  });
});

it('keeps connection diagnostics disabled by default and outside persisted state', async () => {
  const ctx = setup();
  await ctx.controller.continueAsGuest();
  ctx.setFailure(new ApiError('UNAVAILABLE', uuid(99)));
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot().connectionReference).toBeNull();
  expect(ctx.controller.getSnapshot().message).toContain(
    'Couldn’t finish connecting',
  );
  expect(ctx.saved()).not.toHaveProperty('connectionReference');
  ctx.controller.dispose();
});

it.each([
  'provider-auth',
  'legacy-vault',
  'app-session',
  'adopt-guest',
  'save-account',
  'retire-guest',
] as const)(
  'identifies the %s failure without changing durable recovery boundaries',
  async (phase) => {
    const ctx = setup(true);
    await ctx.controller.continueAsGuest();
    const guest = ctx.controller.getSnapshot().collectionId;
    if (phase === 'provider-auth')
      ctx.auth.signIn.mockRejectedValueOnce(new ProviderAuthError('AUTH'));
    else if (phase === 'legacy-vault')
      jest
        .spyOn(ctx.vault, 'read')
        .mockRejectedValueOnce(new Error('PRIVATE_TOKEN_AND_WRITING'));
    else if (phase === 'app-session')
      ctx.setFailure(new ApiError('UNAVAILABLE', uuid(99)));
    else if (phase === 'adopt-guest')
      ctx.controller.setGuestDataMerger(async () => {
        throw new ApiError('NETWORK');
      });
    else if (phase === 'save-account') {
      const write = ctx.storage.write.getMockImplementation();
      if (!write) throw new Error('Missing fixture storage');
      ctx.storage.write.mockImplementation(async (next) => {
        if (next.mode === 'account')
          throw new Error('PRIVATE_TOKEN_AND_WRITING');
        await write(next);
      });
    } else
      ctx.controller.setGuestDataRetirer(async () => {
        throw new Error('PRIVATE_TOKEN_AND_WRITING');
      });
    await ctx.controller.signIn('google');
    const reference = ctx.controller.getSnapshot().connectionReference;
    expect(reference).toContain(`Dev sign-in reference: ${phase} / `);
    expect(reference).not.toContain('PRIVATE_TOKEN_AND_WRITING');
    if (phase === 'app-session') expect(reference).toContain(uuid(99));
    expect(ctx.saved()).not.toHaveProperty('connectionReference');
    if (phase === 'retire-guest') {
      expect(ctx.saved()).toMatchObject({
        collection: { kind: 'account', id: account.userId },
        guestAdoption: { status: 'copied' },
      });
    } else {
      expect(ctx.controller.getSnapshot().collectionId).toBe(guest);
      expect(ctx.saved()?.pendingSignIn).not.toBeNull();
    }
    ctx.controller.dispose();
    expect(ctx.controller.getSnapshot().connectionReference).toBeNull();
  },
);

it('clears a connection reference for cancellation, a new attempt and success', async () => {
  const ctx = setup(true);
  await ctx.controller.continueAsGuest();
  ctx.setFailure(new ApiError('UNAVAILABLE'));
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot().connectionReference).toContain(
    'app-session / UNAVAILABLE',
  );
  ctx.auth.signIn.mockRejectedValueOnce(new ProviderAuthError('CANCELLED'));
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot().connectionReference).toBeNull();
  ctx.setFailure(null);
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    connectionReference: null,
    account: { userId: account.userId },
  });
  ctx.controller.dispose();
});

it.each(['apple', 'google'] as const)(
  'maps a verified %s identity and automatically adopts phone data',
  async (provider) => {
    const ctx = setup();
    const merge = jest.fn();
    ctx.controller.setGuestDataMerger(merge);
    await ctx.controller.initialize();
    await ctx.controller.continueAsGuest();
    const guest = ctx.saved()!.guestId;
    await ctx.controller.signIn(provider);
    expect(ctx.calls).toEqual([
      {
        method: 'POST',
        path: '/auth/session',
        body: { deviceId: uuid(2) },
        token: session.accessToken,
      },
    ]);
    expect(ctx.controller.currentSession()).toEqual({
      userId: account.userId,
      token: session.accessToken,
    });
    expect(ctx.controller.getSnapshot()).toMatchObject({
      mode: 'account',
      account,
      collectionId: account.userId,
      guestId: guest,
    });
    expect(merge).toHaveBeenCalledWith(guest, account.userId, {
      userId: account.userId,
      token: session.accessToken,
    });
    expect(ctx.saved()?.guestAdoption).toEqual({
      ownerId: account.userId,
      status: 'consumed',
    });
    expect(JSON.stringify(ctx.saved())).not.toContain(session.accessToken);
  },
);

it('resumes automatic adoption after failure without exposing an incomplete account', async () => {
  const ctx = setup();
  const merge = jest
    .fn()
    .mockRejectedValueOnce(new Error('Storage full'))
    .mockResolvedValue(undefined);
  ctx.controller.setGuestDataMerger(merge);
  await ctx.controller.initialize();
  await ctx.controller.continueAsGuest();
  const guest = ctx.controller.getSnapshot().collectionId;
  await ctx.controller.signIn('apple');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    collectionId: guest,
    account: null,
    mode: 'guest',
    hasPending: true,
  });
  expect(ctx.controller.currentSession()).toBeNull();
  expect(merge).toHaveBeenCalledWith(guest, account.userId, {
    userId: account.userId,
    token: session.accessToken,
  });
  await ctx.controller.retry();
  expect(merge).toHaveBeenCalledTimes(2);
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'account',
    collectionId: account.userId,
    hasPending: false,
  });
});

it('keeps the guest collection and no authenticated projection after a provider subject mismatch', async () => {
  const ctx = setup();
  ctx.setAccount({ ...account, authUserId: uuid(999) });
  await ctx.controller.initialize();
  await ctx.controller.continueAsGuest();
  const guest = ctx.controller.getSnapshot().collectionId;
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'guest',
    collectionId: guest,
    account: null,
  });
  expect(ctx.controller.currentSession()).toBeNull();
});

it('treats provider cancellation quietly and keeps the original guest collection', async () => {
  const ctx = setup();
  ctx.auth.signIn.mockResolvedValueOnce(null);
  await ctx.controller.initialize();
  await ctx.controller.continueAsGuest();
  await ctx.controller.signIn('apple');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'guest',
    hasPending: false,
    message: '',
  });
  expect(ctx.calls).toEqual([]);
});

it('traces callback and app-session failures while keeping redirect adoption retryable', async () => {
  const ctx = setup(true);
  ctx.auth.signIn.mockResolvedValueOnce('redirecting');
  await ctx.controller.initialize();
  await ctx.controller.continueAsGuest();
  await ctx.controller.signIn('google');
  expect(ctx.saved()?.pendingSignIn).toMatchObject({
    provider: 'google',
    mergeGuest: true,
    guestId: uuid(1),
  });
  expect(ctx.calls).toEqual([]);
  ctx.setProvider(session);
  const callback = ctx.create();
  const merge = jest.fn(async () => {});
  callback.setGuestDataMerger(merge);
  ctx.auth.initialize.mockRejectedValueOnce(new ProviderAuthError('AUTH'));
  await callback.initialize();
  expect(callback.getSnapshot().connectionReference).toBe(
    'Dev sign-in reference: provider-auth / AUTH',
  );
  ctx.setFailure(new ApiError('UNAVAILABLE', uuid(99)));
  await callback.retry();
  expect(callback.getSnapshot()).toMatchObject({
    account: null,
    hasPending: true,
    connectionReference: `Dev sign-in reference: app-session / UNAVAILABLE / ${uuid(99)}`,
  });
  expect(merge).not.toHaveBeenCalled();
  ctx.setFailure(null);
  await callback.retry();
  expect(merge).toHaveBeenCalledTimes(1);
  expect(callback.getSnapshot().account).toEqual(account);
  expect(callback.getSnapshot().connectionReference).toBeNull();
  callback.dispose();
  ctx.controller.dispose();
});

it('fences uploads immediately on offline logout, retains local ownership and retries secure signout after restart', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  expect(ctx.controller.offlineAccountOwner()).toBe(account.userId);
  ctx.setFailure(new ApiError('NETWORK'));
  expect(await ctx.controller.signOut()).toBe(false);
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.offlineAccountOwner()).toBeNull();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'signed-out',
    collectionId: account.userId,
    account: null,
    hasPending: true,
  });
  expect(ctx.saved()?.logoutPending).toBe(true);
  expect(ctx.auth.signOut).not.toHaveBeenCalled();
  ctx.setFailure(null);
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    mode: 'signed-out',
    collectionId: account.userId,
    hasPending: false,
  });
  expect(ctx.auth.signOut).toHaveBeenCalledTimes(1);
  expect(restarted.offlineAccountOwner()).toBeNull();
});

it('never treats another signed-out account collection as guest data to merge', async () => {
  const ctx = setup();
  const merge = jest.fn(async () => {});
  ctx.controller.setGuestDataMerger(merge);
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  expect(await ctx.controller.signOut()).toBe(true);
  merge.mockClear();
  ctx.auth.signIn.mockResolvedValueOnce({ ...session, authUserId: uuid(41) });
  ctx.setAccount({ ...account, authUserId: uuid(41), userId: uuid(51) });
  await ctx.controller.signIn('google');
  expect(merge).not.toHaveBeenCalled();
  expect(ctx.controller.getSnapshot().collectionId).toBe(uuid(51));
});

it('checks canonical owner with the API before making a stored session available after relaunch', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.setFailure(new ApiError('SESSION_REVOKED'));
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.currentSession()).toBeNull();
  expect(restarted.offlineAccountOwner()).toBeNull();
  expect(restarted.getSnapshot()).toMatchObject({
    mode: 'signed-out',
    account: null,
    collectionId: account.userId,
  });
});

it.each(['API', 'provider'] as const)(
  'retains the saved local account scope without exposing a session when cold %s verification is unavailable',
  async (boundary) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    ctx.controller.dispose();
    ctx.calls.length = 0;
    if (boundary === 'API') ctx.setFailure(new ApiError('NETWORK'));
    else
      ctx.auth.initialize.mockRejectedValueOnce(new ProviderAuthError('AUTH'));

    const restarted = ctx.create();
    try {
      await restarted.initialize();
      expect(restarted.getSnapshot()).toMatchObject({
        initialized: true,
        mode: 'signed-out',
        account: null,
        collectionId: account.userId,
        collectionKind: 'account',
      });
      expect(ctx.saved()).toMatchObject({ mode: 'account', account });
      expect(restarted.offlineAccountOwner()).toBe(account.userId);
      expect(restarted.currentSession()).toBeNull();
      expect(ctx.calls.map(({ method, path }) => ({ method, path }))).toEqual(
        boundary === 'API' ? [{ method: 'GET', path: '/auth/session' }] : [],
      );
    } finally {
      restarted.dispose();
    }
  },
);

it.each([
  { change: 'missing', recovery: 'retry' },
  { change: 'different', recovery: 'retry' },
  { change: 'missing', recovery: 'sign in' },
  { change: 'different', recovery: 'sign in' },
] as const)(
  'immediately fences an offline local owner after a $change provider event until a successful $recovery',
  async ({ change, recovery }) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    ctx.controller.dispose();
    ctx.setFailure(new ApiError('NETWORK'));
    const restarted = ctx.create();
    const notifyProvider = ctx.auth.subscribe.mock.lastCall![0];
    try {
      await restarted.initialize();
      expect(restarted.getSnapshot().account).toBeNull();
      expect(restarted.offlineAccountOwner()).toBe(account.userId);
      const changed = jest.fn(() => restarted.offlineAccountOwner());
      const unsubscribe = restarted.subscribe(changed);
      try {
        const requestsBefore = ctx.calls.length;
        notifyProvider(
          change === 'missing' ? null : { ...session, authUserId: uuid(999) },
        );
        expect(restarted.offlineAccountOwner()).toBeNull();
        expect(restarted.currentSession()).toBeNull();
        expect(changed).toHaveReturnedWith(null);
        expect(ctx.calls).toHaveLength(requestsBefore);

        // A matching cached provider event alone cannot undo the detach fence.
        notifyProvider(session);
        expect(restarted.offlineAccountOwner()).toBeNull();
        expect(restarted.currentSession()).toBeNull();
        ctx.setFailure(null);
        if (recovery === 'retry') await restarted.retry();
        else await restarted.signIn('apple');
        expect(restarted.offlineAccountOwner()).toBe(account.userId);
        expect(restarted.currentSession()).toEqual({
          userId: account.userId,
          token: session.accessToken,
        });
        expect(ctx.calls.at(-1)).toMatchObject({
          method: recovery === 'retry' ? 'GET' : 'POST',
          path: '/auth/session',
        });
      } finally {
        unsubscribe();
      }
    } finally {
      restarted.dispose();
    }
  },
);

it.each(['SESSION_REVOKED', 'UNAUTHORIZED'] as const)(
  'clears local admission scope synchronously after %s without removing the selected journal',
  async (code) => {
    const ctx = setup();
    try {
      await ctx.controller.initialize();
      await ctx.controller.signIn('apple');
      expect(ctx.controller.offlineAccountOwner()).toBe(account.userId);
      ctx.controller.rejectSession(session.accessToken, code);
      expect(ctx.controller.offlineAccountOwner()).toBeNull();
      expect(ctx.controller.currentSession()).toBeNull();
      expect(ctx.controller.getSnapshot()).toMatchObject({
        account: null,
        collectionId: account.userId,
        collectionKind: 'account',
      });
    } finally {
      ctx.controller.dispose();
    }
  },
);

it.each([
  { change: 'missing', operation: 'retry' },
  { change: 'different', operation: 'retry' },
  { change: 'missing', operation: 'sign in' },
  { change: 'different', operation: 'sign in' },
] as const)(
  'keeps a newer $change provider fence when an older $operation finishes its final account write',
  async ({ change, operation }) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    ctx.controller.dispose();
    ctx.setFailure(new ApiError('NETWORK'));
    const restarted = ctx.create();
    await restarted.initialize();
    expect(restarted.offlineAccountOwner()).toBe(account.userId);
    expect(restarted.currentSession()).toBeNull();
    const notifyProvider = ctx.auth.subscribe.mock.lastCall![0];
    const writing = deferred<void>();
    const release = deferred<void>();
    const persist = ctx.storage.write.getMockImplementation()!;
    ctx.storage.write.mockImplementation(async (next) => {
      if (next.mode === 'account' && next.pendingSignIn === null) {
        writing.resolve();
        await release.promise;
      }
      await persist(next);
    });
    ctx.setFailure(null);
    const pending =
      operation === 'retry' ? restarted.retry() : restarted.signIn('apple');
    try {
      await writing.promise;
      expect(ctx.calls.at(-1)).toMatchObject({
        method: operation === 'retry' ? 'GET' : 'POST',
        path: '/auth/session',
      });
      notifyProvider(
        change === 'missing' ? null : { ...session, authUserId: uuid(999) },
      );
      expect(restarted.offlineAccountOwner()).toBeNull();
      // Returning cached provider metadata cannot make the preceding online
      // verification current again while its final write is still pending.
      notifyProvider(session);
      release.resolve();
      await pending;
      expect(restarted.offlineAccountOwner()).toBeNull();
      expect(restarted.currentSession()).toBeNull();
      expect(restarted.getSnapshot()).toMatchObject({
        account: null,
        collectionId: account.userId,
        collectionKind: 'account',
      });
    } finally {
      release.resolve();
      await pending;
      restarted.dispose();
    }
  },
);

it.each(['missing', 'different'] as const)(
  'keeps a newer %s provider fence when an older adoption finishes retiring its guest source',
  async (change) => {
    const ctx = setup();
    await ctx.controller.initialize();
    const retiring = deferred<void>();
    const release = deferred<void>();
    ctx.controller.setGuestDataRetirer(async () => {
      retiring.resolve();
      await release.promise;
    });
    const notifyProvider = ctx.auth.subscribe.mock.lastCall![0];
    const pending = ctx.controller.signIn('apple');
    try {
      await retiring.promise;
      expect(ctx.saved()).toMatchObject({
        mode: 'account',
        collection: { kind: 'account', id: account.userId },
        guestAdoption: { ownerId: account.userId, status: 'copied' },
      });
      notifyProvider(
        change === 'missing' ? null : { ...session, authUserId: uuid(999) },
      );
      expect(ctx.controller.offlineAccountOwner()).toBeNull();
      notifyProvider(session);
      release.resolve();
      await pending;
      expect(ctx.saved()?.guestAdoption?.status).toBe('consumed');
      expect(ctx.controller.offlineAccountOwner()).toBeNull();
      expect(ctx.controller.currentSession()).toBeNull();
      expect(ctx.controller.getSnapshot().account).toBeNull();
    } finally {
      release.resolve();
      await pending;
      ctx.controller.dispose();
    }
  },
);

it('withholds offline scope during a pending provider sign-in and restores it after cancellation', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  expect(ctx.controller.offlineAccountOwner()).toBe(account.userId);
  const pending = deferred<ProviderSession | null>();
  const started = deferred<void>();
  ctx.auth.signIn.mockImplementationOnce(() => {
    started.resolve();
    return pending.promise;
  });
  const signingIn = ctx.controller.signIn('google');
  try {
    await started.promise;
    expect(ctx.saved()?.pendingSignIn?.provider).toBe('google');
    expect(ctx.controller.offlineAccountOwner()).toBeNull();
    pending.resolve(null);
    await signingIn;
    expect(ctx.saved()?.pendingSignIn).toBeNull();
    expect(ctx.controller.offlineAccountOwner()).toBe(account.userId);
  } finally {
    pending.resolve(null);
    await signingIn;
    ctx.controller.dispose();
  }
});

// supabase-js 2.119 removes the stored session before it reports a failed
// local sign-out. The controller must still keep its pending step and finish
// it on a retry, with no stored session left to revoke.
it.each(['retry', 'restart'] as const)(
  'finishes a logout on %s after provider sign-out cleared the session and failed',
  async (resume) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    ctx.auth.signOut.mockImplementationOnce(async () => {
      ctx.setProvider(null);
      throw new ProviderAuthError('AUTH');
    });
    expect(await ctx.controller.signOut()).toBe(false);
    expect(ctx.saved()?.logoutPending).toBe(true);
    expect(ctx.controller.currentSession()).toBeNull();
    expect(ctx.controller.offlineAccountOwner()).toBeNull();
    expect(ctx.controller.getSnapshot()).toMatchObject({
      mode: 'signed-out',
      account: null,
      collectionId: account.userId,
    });
    const logouts = () =>
      ctx.calls.filter((call) => call.path === '/auth/logout');
    expect(logouts()).toHaveLength(1);

    // The first logout revoked the app session, so the server now rejects it.
    ctx.setFailure(new ApiError('SESSION_REVOKED'));
    let controller = ctx.controller;
    if (resume === 'retry') await controller.retry();
    else {
      controller = ctx.create();
      await controller.initialize();
    }
    expect(ctx.saved()?.logoutPending).toBe(false);
    expect(ctx.auth.signOut).toHaveBeenCalledTimes(2);
    // Only the in-memory retry still holds the old token to revoke again.
    expect(logouts()).toHaveLength(resume === 'retry' ? 2 : 1);
    expect(controller.getSnapshot()).toMatchObject({
      mode: 'signed-out',
      account: null,
      collectionId: account.userId,
      hasPending: false,
    });
    expect(controller.currentSession()).toBeNull();
    expect(controller.offlineAccountOwner()).toBeNull();
  },
);

it('finishes a deletion on retry after provider sign-out cleared the session and failed', async () => {
  const ctx = setup();
  const remove = jest.fn(async () => {});
  ctx.controller.setAccountDataRemover(remove);
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.auth.signOut.mockImplementationOnce(async () => {
    ctx.setProvider(null);
    throw new ProviderAuthError('AUTH');
  });
  await ctx.controller.deleteAccount();
  expect(ctx.auth.signOut).toHaveBeenCalledTimes(1);
  expect(ctx.controller.getSnapshot().deletionStatus).toBe('cleanup');
  expect(ctx.saved()?.deletion?.receipt?.userId).toBe(account.userId);
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.offlineAccountOwner()).toBeNull();

  await ctx.controller.retry();
  expect(ctx.calls.filter((call) => call.path === '/account')).toHaveLength(1);
  expect(remove).toHaveBeenCalledTimes(2);
  expect(ctx.auth.signOut).toHaveBeenCalledTimes(2);
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'welcome',
    account: null,
    deletionStatus: 'deleted',
    hasPending: false,
  });
  expect(ctx.saved()?.deletion).toBeNull();
  expect(ctx.stored.size).toBe(0);
});

it('freezes deletion proof, commits the receipt before cleanup and resumes after local failure', async () => {
  const ctx = setup();
  const remove = jest
    .fn()
    .mockRejectedValueOnce(new Error('Phone locked'))
    .mockResolvedValue(undefined);
  ctx.controller.setAccountDataRemover(remove);
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  await ctx.controller.deleteAccount();
  expect(ctx.controller.getSnapshot().deletionStatus).toBe('cleanup');
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.offlineAccountOwner()).toBeNull();
  expect(ctx.saved()?.deletion?.receipt?.userId).toBe(account.userId);
  expect([...ctx.stored.values()]).toEqual([session.accessToken]);
  await ctx.controller.retry();
  expect(ctx.calls.filter((call) => call.path === '/account')).toHaveLength(1);
  expect(remove).toHaveBeenCalledTimes(2);
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'welcome',
    deletionStatus: 'deleted',
    account: null,
  });
  expect(ctx.stored.size).toBe(0);
});

it('does not republish an erased account collection when provider sign-out emits a missing session', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const notifyProvider = ctx.auth.subscribe.mock.lastCall![0];
  let removed = false;
  const afterRemoval: ReturnType<ManagedIdentityController['getSnapshot']>[] =
    [];
  ctx.controller.setAccountDataRemover(async (owner) => {
    expect(owner).toBe(account.userId);
    removed = true;
  });
  ctx.auth.signOut.mockImplementationOnce(async () => {
    expect(removed).toBe(true);
    notifyProvider(null);
  });
  const unsubscribe = ctx.controller.subscribe(() => {
    if (removed) afterRemoval.push(ctx.controller.getSnapshot());
  });
  try {
    await ctx.controller.deleteAccount();
    expect(ctx.auth.signOut).toHaveBeenCalledTimes(1);
    expect(afterRemoval.length).toBeGreaterThan(0);
    for (const snapshot of afterRemoval) {
      expect(snapshot).toMatchObject({
        mode: 'welcome',
        account: null,
        deletionStatus: 'deleted',
      });
      expect(snapshot.collectionId).not.toBe(account.userId);
    }
    expect(ctx.controller.offlineAccountOwner()).toBeNull();
    expect(ctx.controller.currentSession()).toBeNull();
  } finally {
    unsubscribe();
    ctx.controller.dispose();
  }
});

it.each(['pending', 'cleanup'] as const)(
  'resumes %s deletion before provider initialization when the Auth user is already unavailable',
  async (stage) => {
    const ctx = setup();
    const remove = jest.fn(async () => {});
    if (stage === 'cleanup')
      remove.mockRejectedValueOnce(new Error('Phone locked'));
    ctx.controller.setAccountDataRemover(remove);
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    if (stage === 'pending') ctx.setFailure(new ApiError('NETWORK'));
    await ctx.controller.deleteAccount();
    expect(ctx.controller.getSnapshot().deletionStatus).toBe(stage);
    expect(ctx.controller.offlineAccountOwner()).toBeNull();
    ctx.setFailure(null);
    ctx.auth.initialize
      .mockClear()
      .mockRejectedValue(new ProviderAuthError('AUTH'));
    const restarted = ctx.create();
    restarted.setAccountDataRemover(remove);
    await restarted.initialize();
    expect(ctx.auth.initialize).not.toHaveBeenCalled();
    expect(restarted.getSnapshot()).toMatchObject({
      mode: 'welcome',
      account: null,
      deletionStatus: 'deleted',
      hasPending: false,
    });
    expect(ctx.saved()?.deletion).toBeNull();
    expect(ctx.stored.size).toBe(0);
    expect(ctx.auth.signOut).toHaveBeenCalledTimes(1);
  },
);

it('does not open another provider or map a late provider result after disposal', async () => {
  const ctx = setup();
  const pending = deferred<ProviderSession>();
  ctx.auth.signIn.mockReturnValue(pending.promise);
  await ctx.controller.initialize();
  const signingIn = ctx.controller.signIn('apple');
  await Promise.resolve();
  await Promise.resolve();
  ctx.controller.dispose();
  pending.resolve(session);
  await signingIn;
  expect(ctx.calls).toEqual([]);
});

it('retains stored data and safe feedback when native/provider configuration is unavailable', async () => {
  const ctx = setup();
  ctx.auth.signIn.mockRejectedValueOnce(new ProviderAuthError('CONFIGURATION'));
  await ctx.controller.initialize();
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot().message).toContain(
    'continue on this phone',
  );
  expect(ctx.calls).toEqual([]);
});

it('keeps the frozen legacy proof for an exact Auth-link retry after its response is lost', async () => {
  const ctx = setup();
  const legacyToken = 'a'.repeat(64);
  await ctx.vault.write({
    deviceId: uuid(2),
    selectedId: null,
    session: { token: legacyToken, info: legacyInfo },
    pending: null,
    savedKey: null,
    registration: null,
  });
  await ctx.controller.initialize();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'signed-out',
    collectionId: account.userId,
  });
  ctx.setFailure(new ApiError('NETWORK'));
  // Freeze a proof from an earlier successful GET before the lost exchange.
  ctx.stored.set(
    'justgo.auth.legacy-link-proof.v1',
    JSON.stringify({
      ownerId: account.userId,
      authUserId: session.authUserId,
      token: legacyToken,
    }),
  );
  await ctx.controller.signIn('apple');
  expect(ctx.calls.at(-1)).toMatchObject({
    path: '/auth/session',
    body: { legacySessionToken: legacyToken },
  });
  ctx.setFailure(null);
  await ctx.controller.retry();
  expect(ctx.calls.filter((call) => call.path === '/sessions/current')).toEqual(
    [],
  );
  expect(ctx.controller.getSnapshot().account?.userId).toBe(account.userId);
  expect(ctx.stored.size).toBe(0);
});

it('keeps a signout storage failure fenced from all subsequent authenticated requests', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('google');
  ctx.storage.write.mockRejectedValueOnce(new ProviderAuthError('STORAGE'));
  expect(await ctx.controller.signOut()).toBe(false);
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.offlineAccountOwner()).toBeNull();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'signed-out',
    account: null,
    collectionId: account.userId,
  });
  expect(await ctx.controller.signOut()).toBe(true);
});

it('finishes an existing legacy deletion receipt without any bootstrap or provider account creation', async () => {
  const ctx = setup();
  await ctx.vault.write({
    deviceId: uuid(2),
    selectedId: null,
    session: { token: 'a'.repeat(64), info: legacyInfo },
    pending: {
      kind: 'delete',
      userId: account.userId,
      receipt: {
        userId: account.userId,
        deletedAt: '2026-10-20T20:00:00.000Z',
        credentialDigests: [],
      },
    },
    savedKey: null,
    registration: null,
  });
  const remove = jest.fn(async () => {});
  ctx.controller.setAccountDataRemover(remove);
  await ctx.controller.initialize();
  expect(remove).toHaveBeenCalledWith(account.userId);
  expect(ctx.calls).toEqual([]);
  expect(ctx.auth.signIn).not.toHaveBeenCalled();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'welcome',
    account: null,
    deletionStatus: 'deleted',
  });
});

it('links providers only within the verified canonical owner and rejects a different returned Auth subject', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.auth.linkIdentity.mockResolvedValueOnce({
    ...session,
    linkedProviders: ['apple', 'google'],
  });
  await ctx.controller.linkProvider('google');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    account,
    hasPending: false,
  });
  expect(
    ctx.calls.filter(
      (call) => call.method === 'POST' && call.path === '/auth/session',
    ),
  ).toHaveLength(1);
  ctx.auth.linkIdentity.mockResolvedValueOnce({
    ...session,
    authUserId: uuid(999),
  });
  await ctx.controller.linkProvider('google');
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    account: null,
    collectionId: account.userId,
    mode: 'signed-out',
  });
});

it('shows a retryable startup error without replacing unreadable saved ownership, then recovers after unlocking', async () => {
  const ctx = setup();
  ctx.storage.read.mockRejectedValueOnce(new ProviderAuthError('STORAGE'));
  await ctx.controller.initialize();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    initialized: true,
    needsWelcome: true,
    account: null,
    collectionId: null,
  });
  expect(ctx.storage.write).not.toHaveBeenCalled();
  expect(ctx.calls).toEqual([]);
  await ctx.controller.retry();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    initialized: true,
    collectionId: uuid(1),
    mode: 'welcome',
  });
  expect(ctx.auth.signIn).not.toHaveBeenCalled();
});

it('does not reuse revoked legacy credentials after linking, logging out and signing in again', async () => {
  const ctx = setup();
  const legacyToken = 'a'.repeat(64);
  await ctx.vault.write({
    deviceId: uuid(2),
    selectedId: null,
    session: { token: legacyToken, info: legacyInfo },
    pending: null,
    savedKey: null,
    registration: null,
  });
  ctx.stored.set(
    'justgo.auth.legacy-link-proof.v1',
    JSON.stringify({
      ownerId: account.userId,
      authUserId: session.authUserId,
      token: legacyToken,
    }),
  );
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  expect(ctx.saved()?.linkedLegacyOwnerIds).toEqual([account.userId]);
  await ctx.controller.signOut();
  await ctx.controller.signIn('apple');
  expect(ctx.controller.currentSession()?.userId).toBe(account.userId);
  expect(
    ctx.calls.filter((call) => call.path === '/sessions/current'),
  ).toHaveLength(0);
  expect(
    ctx.calls
      .filter((call) => call.path === '/auth/session' && call.method === 'POST')
      .at(-1)?.body,
  ).toEqual({ deviceId: uuid(2) });
});

it.each(['NOT_FOUND', 'INVALID_REQUEST'] as const)(
  'keeps the account and local collection after a definitive %s deletion rejection',
  async (code) => {
    const ctx = setup();
    const remove = jest.fn(async () => {});
    ctx.controller.setAccountDataRemover(remove);
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    ctx.setFailure(new ApiError(code));
    await ctx.controller.deleteAccount();
    expect(ctx.controller.getSnapshot()).toMatchObject({
      account,
      collectionId: account.userId,
      deletionStatus: null,
      hasPending: false,
    });
    expect(ctx.controller.getSnapshot().message).toContain(
      'Your account has not been deleted.',
    );
    expect(ctx.controller.currentSession()?.userId).toBe(account.userId);
    expect(remove).not.toHaveBeenCalled();
    expect(ctx.stored.size).toBe(0);
  },
);

it('retains the same journal on logout and never re-adopts a consumed guest source', async () => {
  const ctx = setup();
  const merge = jest.fn(async () => {});
  ctx.controller.setGuestDataMerger(merge);
  await ctx.controller.initialize();
  await ctx.controller.continueAsGuest();
  const guestId = ctx.saved()!.guestId;
  await ctx.controller.signIn('apple');
  await ctx.controller.signOut();
  expect(ctx.controller.getSnapshot().collectionId).toBe(account.userId);
  expect(merge).toHaveBeenCalledTimes(1);
  await ctx.controller.signIn('apple');
  expect(merge).toHaveBeenCalledTimes(1);
  expect(merge).toHaveBeenCalledWith(guestId, account.userId, {
    userId: account.userId,
    token: session.accessToken,
  });
});

it('selects the durable destination before source retirement and resumes cleanup after restart', async () => {
  const ctx = setup();
  const retire = jest.fn(async () => {
    throw new Error('Storage locked');
  });
  ctx.controller.setGuestDataRetirer(retire);
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  expect(ctx.saved()).toMatchObject({
    collection: { kind: 'account', id: account.userId },
    guestAdoption: { ownerId: account.userId, status: 'copied' },
  });
  expect(ctx.controller.getSnapshot().collectionId).toBe(account.userId);
  const restarted = ctx.create();
  const mergedAgain = jest.fn();
  restarted.setGuestDataMerger(mergedAgain);
  await restarted.initialize();
  expect(ctx.saved()?.guestAdoption?.status).toBe('consumed');
  expect(restarted.getSnapshot().collectionId).toBe(account.userId);
  expect(mergedAgain).not.toHaveBeenCalled();
});

it('retires an already copied source before unavailable Auth while keeping its destination journal selected', async () => {
  const ctx = setup();
  ctx.controller.setGuestDataRetirer(
    jest.fn(async () => {
      throw new Error('Storage locked');
    }),
  );
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  expect(ctx.saved()?.guestAdoption?.status).toBe('copied');
  const guestId = ctx.saved()!.guestId;
  ctx.auth.initialize.mockRejectedValue(new ProviderAuthError('AUTH'));
  const restarted = ctx.create();
  const retire = jest.fn(async () => {});
  const merge = jest.fn(async () => {});
  restarted.setGuestDataRetirer(retire);
  restarted.setGuestDataMerger(merge);
  await restarted.initialize();
  expect(retire).toHaveBeenCalledWith(guestId);
  expect(merge).not.toHaveBeenCalled();
  expect(ctx.saved()?.guestAdoption?.status).toBe('consumed');
  expect(restarted.getSnapshot()).toMatchObject({
    collectionId: account.userId,
    mode: 'signed-out',
    account: null,
  });
});

it('upgrades parked guest writing only after the renewed sign-in disclosure', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  await ctx.storage.write({ ...ctx.saved()!, guestAdoption: null });
  const restarted = ctx.create();
  const merge = jest.fn(async () => {});
  restarted.setGuestDataMerger(merge);
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    account: null,
    collectionId: account.userId,
    mode: 'signed-out',
  });
  expect(merge).not.toHaveBeenCalled();
  await restarted.signIn('apple');
  expect(merge).toHaveBeenCalledWith(ctx.saved()!.guestId, account.userId, {
    userId: account.userId,
    token: session.accessToken,
  });
  expect(ctx.saved()?.guestAdoption?.status).toBe('consumed');
});

it('rejects a different account in an account-owned import or deletion sign-in flow', async () => {
  const ctx = setup();
  const merge = jest.fn();
  ctx.controller.setGuestDataMerger(merge);
  await ctx.controller.initialize();
  await ctx.controller.signIn('google', { expectedOwnerId: uuid(99) });
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.getSnapshot().collectionId).toBe(uuid(1));
  expect(merge).not.toHaveBeenCalled();
});

it('keeps an interrupted adoption bound to its first verified owner', async () => {
  const ctx = setup();
  const merge = jest.fn().mockRejectedValue(new Error('Connection lost'));
  ctx.controller.setGuestDataMerger(merge);
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.setAccount({ ...account, userId: uuid(51) });
  await ctx.controller.signIn('google');
  expect(merge).toHaveBeenCalledTimes(1);
  expect(ctx.saved()?.guestAdoption?.ownerId).toBe(account.userId);
  expect(ctx.controller.getSnapshot().collectionId).toBe(uuid(1));
});

it('deleting an adopted account creates a fresh empty guest identity rather than reopening its source', async () => {
  const ctx = setup();
  ctx.controller.setAccountDataRemover(jest.fn(async () => {}));
  await ctx.controller.initialize();
  const oldGuest = ctx.saved()!.guestId;
  await ctx.controller.signIn('apple');
  await ctx.controller.deleteAccount();
  expect(ctx.saved()?.guestId).not.toBe(oldGuest);
  expect(ctx.saved()?.guestAdoption).toBeNull();
  expect(ctx.saved()?.collection.id).toBe(ctx.saved()?.guestId);
});

it('reflects verified provider links, protects the last method and clears switches on logout', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  expect(ctx.controller.getSnapshot().linkedProviders).toEqual(['apple']);
  ctx.auth.linkIdentity.mockResolvedValueOnce({
    ...session,
    linkedProviders: ['apple', 'google'],
  });
  await ctx.controller.linkProvider('google');
  expect(ctx.controller.getSnapshot().linkedProviders).toEqual([
    'apple',
    'google',
  ]);
  ctx.auth.unlinkIdentity.mockResolvedValueOnce({
    ...session,
    linkedProviders: ['google'],
  });
  await ctx.controller.unlinkProvider('apple');
  expect(ctx.controller.getSnapshot().linkedProviders).toEqual(['google']);
  ctx.auth.unlinkIdentity.mockRejectedValueOnce(
    new ProviderAuthError('LAST_PROVIDER'),
  );
  await ctx.controller.unlinkProvider('google');
  expect(ctx.controller.getSnapshot().linkedProviders).toEqual(['google']);
  expect(ctx.controller.getSnapshot().message).toContain('Use Log out');
  await ctx.controller.signOut();
  expect(ctx.controller.getSnapshot().linkedProviders).toEqual([]);
});

it('switches the active provider for one linked subject only after fresh auth and revokes the old app session', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const merge = jest.fn(async () => {});
  ctx.controller.setGuestDataMerger(merge);
  const next = {
    ...session,
    accessToken: 'synthetic-google-token',
    linkedProviders: ['apple', 'google'] as const,
  };
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.setProvider(next);
    ctx.auth.subscribe.mock.calls[0]![0](next);
    return next;
  });
  const offset = ctx.calls.length;
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    provider: 'google',
    account: { userId: account.userId },
    linkedProviders: ['apple', 'google'],
  });
  expect(
    ctx.calls.slice(offset).map(({ path, token }) => [path, token]),
  ).toEqual([
    ['/auth/logout', session.accessToken],
    ['/auth/session', next.accessToken],
  ]);
  expect(merge).not.toHaveBeenCalled();
  expect(ctx.saved()?.provider).toBe('google');
  expect(JSON.stringify(ctx.saved())).not.toContain(session.accessToken);
  expect(JSON.stringify(ctx.saved())).not.toContain(next.accessToken);
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot().provider).toBe('google');
  restarted.dispose();
  ctx.controller.dispose();
});

it.each(['cancel', 'failure'] as const)(
  'retains the original account and provider on switch %s, including restart',
  async (outcome) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    const before = ctx.controller.getSnapshot().collectionId;
    if (outcome === 'cancel') ctx.auth.signIn.mockResolvedValueOnce(null);
    else ctx.auth.signIn.mockRejectedValueOnce(new ProviderAuthError('AUTH'));
    const offset = ctx.calls.length;
    await ctx.controller.signIn('google');
    expect(ctx.controller.getSnapshot()).toMatchObject({
      provider: 'apple',
      account: { userId: account.userId },
      collectionId: before,
    });
    expect(ctx.calls.slice(offset)).toEqual([]);
    expect(ctx.saved()?.pendingSignIn).toBeNull();
    expect(ctx.stored.size).toBe(0);
    const restarted = ctx.create();
    await restarted.initialize();
    expect(restarted.getSnapshot().provider).toBe('apple');
    restarted.dispose();
    ctx.controller.dispose();
  },
);

it('does not adopt or relabel an unchanged SDK session after interrupted browser switching', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.auth.signIn.mockResolvedValueOnce('redirecting');
  await ctx.controller.signIn('google');
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    provider: 'apple',
    account: { userId: account.userId },
  });
  expect(ctx.saved()?.pendingSignIn).toBeNull();
  expect(ctx.calls.filter(({ path }) => path === '/auth/logout')).toEqual([]);
  restarted.dispose();
  ctx.controller.dispose();
});

it('restores the source quietly and marks the switch cancelled after a provider cancel callback', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  expect(ctx.controller.getSnapshot().switchCancelled).toBe(false);
  ctx.auth.signIn.mockResolvedValueOnce('redirecting');
  await ctx.controller.signIn('google');
  // The cancel callback leaves the SDK on the source session it already held.
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    account,
    provider: 'apple',
    message: '',
    hasPending: false,
    switchCancelled: true,
  });
  await restarted.retry();
  expect(restarted.getSnapshot()).toMatchObject({
    account,
    switchCancelled: false,
  });
  restarted.dispose();
  ctx.controller.dispose();
});

it('resumes confirmed callback switching with the old bearer only in secure storage', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.auth.signIn.mockResolvedValueOnce('redirecting');
  await ctx.controller.signIn('google');
  const next = {
    ...session,
    accessToken: 'synthetic-browser-new-token',
    freshSignIn: true,
  };
  ctx.setProvider(next);
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot().provider).toBe('google');
  expect(ctx.calls.find(({ path }) => path === '/auth/logout')?.token).toBe(
    session.accessToken,
  );
  expect(ctx.stored.size).toBe(0);
  restarted.dispose();
  ctx.controller.dispose();
});

it('fences the replaced SDK session until old-session revocation succeeds after restart', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const next = { ...session, accessToken: 'synthetic-new-token' };
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.setProvider(next);
    return next;
  });
  ctx.setFailure(new ApiError('UNAVAILABLE'));
  await ctx.controller.signIn('google');
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.offlineAccountOwner()).toBeNull();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    account: null,
    provider: null,
    collectionId: account.userId,
    hasPending: true,
  });
  expect(ctx.saved()?.pendingSignIn).toMatchObject({
    switching: true,
    authenticated: true,
  });
  expect(
    [...ctx.stored.values()].some((value) =>
      value.includes(session.accessToken),
    ),
  ).toBe(true);
  ctx.setFailure(null);
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    provider: 'google',
    account: { userId: account.userId },
  });
  expect(ctx.stored.size).toBe(0);
  restarted.dispose();
  ctx.controller.dispose();
});

it('keeps previous-owner data out of a different signed-in account and does not re-adopt consumed guest data', async () => {
  const ctx = setup();
  const merge = jest.fn(async (guest: string, owner: string) => {
    expect(guest).toBe(uuid(1));
    expect(owner).toBe(account.userId);
  });
  ctx.controller.setGuestDataMerger(merge);
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const next = {
    ...session,
    authUserId: uuid(41),
    accessToken: 'synthetic-other-owner-token',
    linkedProviders: ['google'] as const,
  };
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.setProvider(next);
    return next;
  });
  ctx.setAccount({
    ...account,
    userId: uuid(51),
    authUserId: next.authUserId,
    sessionId: uuid(61),
  });
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    provider: 'google',
    collectionId: uuid(51),
    account: { userId: uuid(51) },
  });
  expect(merge).toHaveBeenCalledTimes(1);
  expect(merge.mock.calls[0]?.[1]).toBe(account.userId);
  expect(ctx.calls.find(({ path }) => path === '/auth/logout')?.token).toBe(
    session.accessToken,
  );
  ctx.controller.dispose();
});

it('retains a retryable destination intent when app adoption fails after source revocation', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const next = { ...session, accessToken: 'synthetic-new-provider-token' };
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.setProvider(next);
    return next;
  });
  const original = ctx.api.request;
  jest.spyOn(ctx.api, 'request').mockImplementation(async (...args) => {
    if (args[0] === 'POST' && args[1] === '/auth/session')
      throw new ApiError('UNAVAILABLE');
    return original(...args);
  });
  await ctx.controller.signIn('google');
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.getSnapshot().collectionId).toBe(account.userId);
  expect(ctx.saved()?.pendingSignIn).toMatchObject({
    provider: 'google',
    authenticated: true,
  });
  expect(ctx.stored.size).toBe(0);
  jest.restoreAllMocks();
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    provider: 'google',
    account: { userId: account.userId },
  });
  restarted.dispose();
  ctx.controller.dispose();
});

it('keeps SDK replacement fenced when saving its authenticated intent fails', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const next = { ...session, accessToken: 'synthetic-new-google-token' };
  ctx.setVerifiedAccount(next.accessToken, new ApiError('UNAUTHORIZED'));
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.setProvider(next);
    return next;
  });
  const write = ctx.storage.write.getMockImplementation()!;
  ctx.storage.write.mockImplementation(async (state) => {
    if (state.pendingSignIn?.authenticated)
      throw new ProviderAuthError('STORAGE');
    return write(state);
  });
  await ctx.controller.signIn('google');
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    account: null,
    provider: null,
    collectionId: account.userId,
  });
  expect(ctx.saved()?.pendingSignIn).toMatchObject({
    switching: true,
    authenticated: false,
  });
  ctx.storage.write.mockImplementation(write);
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.currentSession()).toBeNull();
  expect(restarted.getSnapshot().provider).toBeNull();
  expect(restarted.getSnapshot().message).toContain('Please sign in again');
  restarted.dispose();
  ctx.controller.dispose();
});

it('restores a legacy provider hint while preserving exact completed provider metadata on newer accounts', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  await ctx.storage.write({ ...ctx.saved()!, provider: undefined });
  ctx.setProvider({
    ...session,
    provider: 'google',
    linkedProviders: ['apple', 'google'],
  });
  const legacy = ctx.create();
  await legacy.initialize();
  expect(legacy.getSnapshot().provider).toBe('google');
  await ctx.storage.write({ ...ctx.saved()!, provider: 'apple' });
  const current = ctx.create();
  await current.initialize();
  expect(current.getSnapshot().provider).toBe('apple');
  legacy.dispose();
  current.dispose();
  ctx.controller.dispose();
});

it('fences a same-subject SDK replacement notification before provider authorization resolves', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const next = {
    ...session,
    accessToken: 'synthetic-new-same-subject-token',
    linkedProviders: ['apple', 'google'] as const,
  };
  const authorization = deferred<ProviderSession>();
  const notified = deferred<void>();
  ctx.auth.signIn.mockImplementationOnce(() => {
    ctx.setProvider(next);
    ctx.auth.subscribe.mock.calls[0]![0](next);
    notified.resolve();
    return authorization.promise;
  });
  const offset = ctx.calls.length;
  const switching = ctx.controller.signIn('google');
  await notified.promise;
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    account: null,
    provider: null,
    busy: true,
    collectionId: account.userId,
  });
  expect(ctx.calls.slice(offset)).toEqual([]);
  authorization.resolve(next);
  await switching;
  expect(
    ctx.calls.slice(offset).map(({ path, token }) => [path, token]),
  ).toEqual([
    ['/auth/logout', session.accessToken],
    ['/auth/session', next.accessToken],
  ]);
  expect(ctx.controller.getSnapshot()).toMatchObject({
    provider: 'google',
    account: { userId: account.userId },
  });
  expect(ctx.controller.currentSession()?.token).toBe(next.accessToken);
  ctx.controller.dispose();
});

it.each(['cancel', 'reject'] as const)(
  'keeps SDK sign-out divergence fenced after provider %s',
  async (outcome) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    ctx.auth.signIn.mockImplementationOnce(async () => {
      ctx.setProvider(null);
      ctx.auth.subscribe.mock.calls[0]![0](null);
      if (outcome === 'reject') throw new ProviderAuthError('AUTH');
      return null;
    });
    await ctx.controller.signIn('google');
    expect(ctx.controller.currentSession()).toBeNull();
    expect(ctx.controller.getSnapshot()).toMatchObject({
      account: null,
      provider: null,
      collectionId: account.userId,
    });
    expect(ctx.saved()?.pendingSignIn).toMatchObject({
      switching: true,
      authenticated: false,
    });
    expect(
      [...ctx.stored.values()].some((value) =>
        value.includes(session.accessToken),
      ),
    ).toBe(true);
    ctx.controller.dispose();
  },
);

it('continues normal same-subject token refresh when no switch is pending', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.auth.subscribe.mock.calls[0]![0]({
    ...session,
    accessToken: 'synthetic-ordinary-refresh-token',
  });
  expect(ctx.controller.getSnapshot()).toMatchObject({
    provider: 'apple',
    account: { userId: account.userId },
  });
  expect(ctx.controller.currentSession()?.token).toBe(
    'synthetic-ordinary-refresh-token',
  );
  ctx.controller.dispose();
});

it.each(['cancel', 'reject'] as const)(
  'restores the original app session after its bearer refreshes during switch %s',
  async (outcome) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    const refreshed = {
      ...session,
      accessToken: 'synthetic-source-refreshed-token',
    };
    ctx.setVerifiedAccount(refreshed.accessToken, account);
    const authorization = deferred<ProviderSession | null>();
    const notified = deferred<void>();
    ctx.auth.signIn.mockImplementationOnce(() => {
      ctx.setProvider(refreshed);
      ctx.auth.subscribe.mock.calls[0]![0](refreshed);
      notified.resolve();
      return authorization.promise;
    });
    const offset = ctx.calls.length;
    const switching = ctx.controller.signIn('google');
    await notified.promise;
    expect(ctx.controller.currentSession()).toBeNull();
    if (outcome === 'cancel') authorization.resolve(null);
    else authorization.reject(new ProviderAuthError('AUTH'));
    await switching;
    expect(ctx.controller.getSnapshot()).toMatchObject({
      provider: 'apple',
      account,
      collectionId: account.userId,
    });
    expect(ctx.controller.currentSession()?.token).toBe(refreshed.accessToken);
    expect(ctx.saved()?.pendingSignIn).toBeNull();
    expect(ctx.stored.size).toBe(0);
    expect(
      ctx.calls
        .slice(offset)
        .map(({ method, path, token }) => [method, path, token]),
    ).toEqual([['GET', '/auth/session', refreshed.accessToken]]);
    ctx.controller.dispose();
  },
);

it('restores an interrupted source-token refresh on restart without adopting the requested provider', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.auth.signIn.mockResolvedValueOnce('redirecting');
  await ctx.controller.signIn('google');
  const refreshed = {
    ...session,
    accessToken: 'synthetic-restarted-source-token',
  };
  ctx.setProvider(refreshed);
  ctx.setVerifiedAccount(refreshed.accessToken, account);
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    provider: 'apple',
    account,
    hasPending: false,
  });
  expect(restarted.currentSession()?.token).toBe(refreshed.accessToken);
  expect(ctx.auth.signIn).toHaveBeenCalledTimes(2);
  expect(ctx.calls.filter(({ path }) => path === '/auth/logout')).toEqual([]);
  expect(ctx.saved()?.pendingSignIn).toBeNull();
  expect(ctx.stored.size).toBe(0);
  restarted.dispose();
  ctx.controller.dispose();
});

it.each(['cancel', 'restart'] as const)(
  'does not restore a replaced same-subject app session after switch %s',
  async (stage) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    const replacement = {
      ...session,
      accessToken: 'synthetic-registered-other-session',
    };
    ctx.setVerifiedAccount(replacement.accessToken, {
      ...account,
      sessionId: uuid(61),
    });
    ctx.auth.signIn.mockImplementationOnce(async () => {
      if (stage === 'restart') return 'redirecting';
      ctx.setProvider(replacement);
      ctx.auth.subscribe.mock.calls[0]![0](replacement);
      return null;
    });
    await ctx.controller.signIn('google');
    const checked = stage === 'restart' ? ctx.create() : ctx.controller;
    if (stage === 'restart') {
      ctx.setProvider(replacement);
      await checked.initialize();
    }
    expect(checked.currentSession()).toBeNull();
    expect(checked.getSnapshot()).toMatchObject({
      account: null,
      provider: null,
      collectionId: account.userId,
    });
    expect(ctx.saved()?.pendingSignIn).toMatchObject({
      switching: true,
      authenticated: false,
    });
    expect(
      [...ctx.stored.values()].some((value) =>
        value.includes(session.accessToken),
      ),
    ).toBe(true);
    checked.dispose();
    ctx.controller.dispose();
  },
);

it('keeps a late token replacement fenced while verifying a refreshed source session', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const refreshed = {
    ...session,
    accessToken: 'synthetic-source-verification-token',
  };
  const verification = deferred<typeof account>();
  const requested = deferred<void>();
  ctx.setVerifiedAccount(refreshed.accessToken, () => {
    requested.resolve();
    return verification.promise;
  });
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.setProvider(refreshed);
    ctx.auth.subscribe.mock.calls[0]![0](refreshed);
    return null;
  });
  const switching = ctx.controller.signIn('google');
  await requested.promise;
  expect(ctx.controller.currentSession()).toBeNull();
  const replacement = {
    ...session,
    accessToken: 'synthetic-late-replacement-token',
  };
  // A same-subject replacement during a switch is a different Supabase
  // session, so the server reports another app session for it.
  ctx.setVerifiedAccount(replacement.accessToken, {
    ...account,
    sessionId: uuid(61),
  });
  ctx.setProvider(replacement);
  ctx.auth.subscribe.mock.calls[0]![0](replacement);
  verification.resolve(account);
  await switching;
  expect(
    ctx.calls.some(
      ({ method, path, token }) =>
        method === 'GET' &&
        path === '/auth/session' &&
        token === replacement.accessToken,
    ),
  ).toBe(true);
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.getSnapshot()).toMatchObject({
    account: null,
    provider: null,
    collectionId: account.userId,
  });
  expect(ctx.saved()?.pendingSignIn).toMatchObject({
    switching: true,
    authenticated: false,
  });
  expect(
    [...ctx.stored.values()].some((value) =>
      value.includes(session.accessToken),
    ),
  ).toBe(true);
  ctx.controller.dispose();
});

it.each([false, true])(
  'clears an orphan switch proof during accepted deletion with retryable storage cleanup=%s',
  async (failOnce) => {
    const ctx = setup();
    ctx.controller.setAccountDataRemover(jest.fn(async () => {}));
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    const key = 'justgo.auth.provider-switch-proof.v1';
    ctx.stored.set(
      key,
      JSON.stringify({
        token: 'synthetic-orphan-source-token',
        authUserId: session.authUserId,
      }),
    );
    const remove = ctx.secureStorage.removeItem.getMockImplementation()!;
    let failed = false;
    ctx.secureStorage.removeItem.mockImplementation(async (item) => {
      if (failOnce && item === key && !failed) {
        failed = true;
        throw new ProviderAuthError('STORAGE');
      }
      await remove(item);
    });
    await ctx.controller.deleteAccount();
    if (failOnce) {
      expect(ctx.controller.getSnapshot().deletionStatus).toBe('cleanup');
      expect(ctx.saved()?.deletion?.receipt?.userId).toBe(account.userId);
      expect(ctx.stored.has(key)).toBe(true);
      await ctx.controller.retry();
    }
    expect(ctx.controller.getSnapshot().deletionStatus).toBe('deleted');
    expect(ctx.stored.has(key)).toBe(false);
    expect(ctx.stored.size).toBe(0);
    expect(
      ctx.calls.filter(
        ({ method, path }) => method === 'DELETE' && path === '/account',
      ),
    ).toHaveLength(1);
    ctx.controller.dispose();
  },
);

it('keeps an older install’s inferred provider across an SDK refresh, so a cancelled switch never reads as completed', async () => {
  const ctx = setup();
  const first = ctx.create();
  await first.initialize();
  await first.signIn('apple');
  first.dispose();
  // Installs from before the active provider was saved have none stored.
  await ctx.storage.write({ ...ctx.saved()!, provider: undefined });
  ctx.setProvider({
    ...session,
    provider: 'google',
    linkedProviders: ['apple', 'google'],
  });
  const controller = ctx.create();
  const notifyProvider = ctx.auth.subscribe.mock.lastCall![0];
  await controller.initialize();
  expect(controller.getSnapshot().provider).toBe('google');
  // Ordinary SDK refresh: its projection carries no display provider.
  notifyProvider({
    ...session,
    accessToken: 'refreshed-provider-token',
    linkedProviders: ['apple', 'google'],
  });
  ctx.auth.signIn.mockResolvedValueOnce(null);
  await controller.signIn('apple');
  expect(controller.getSnapshot()).toMatchObject({
    provider: 'google',
    hasPending: false,
  });
  expect(controller.getSnapshot().account).not.toBeNull();
  controller.dispose();
});

it('re-verifies a source the server rejected while the switch sheet was open before restoring it', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const verifications = () =>
    ctx.calls.filter(
      ({ method, path, token }) =>
        method === 'GET' &&
        path === '/auth/session' &&
        token === session.accessToken,
    ).length;
  const before = verifications();
  ctx.setVerifiedAccount(session.accessToken, new ApiError('SESSION_REVOKED'));
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.controller.rejectSession(session.accessToken, 'SESSION_REVOKED');
    return null;
  });
  await ctx.controller.signIn('google');
  expect(verifications()).toBe(before + 1);
  expect(ctx.controller.currentSession()).toBeNull();
  expect(ctx.controller.getSnapshot().account).toBeNull();
  ctx.controller.dispose();
});

it('keeps a cancelled sign-in silent when it began signed out after an interrupted switch', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  // The app stops while the switch's provider sheet is open.
  ctx.auth.signIn.mockResolvedValueOnce('redirecting');
  await ctx.controller.signIn('google');
  ctx.controller.dispose();
  // On restart the SDK has no session, so the account shows signed out.
  ctx.setProvider(null);
  const restarted = ctx.create();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toMatchObject({
    account: null,
    mode: 'signed-out',
    message: '',
  });
  ctx.auth.signIn.mockResolvedValueOnce(null);
  await restarted.signIn('apple');
  expect(restarted.getSnapshot()).toMatchObject({
    message: '',
    directSignInFailure: false,
  });
  restarted.dispose();
});

it('explains a cancelled switch that lost the active login while its sheet was open', async () => {
  const ctx = setup();
  const notifyProvider = ctx.auth.subscribe.mock.calls[0]![0];
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.setProvider(null);
    notifyProvider(null);
    return null;
  });
  await ctx.controller.signIn('google');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    account: null,
    message: 'Please sign in again. Your saved data was kept.',
    directSignInFailure: true,
  });
  ctx.controller.dispose();
});

it.each(['returns no session', 'throws CANCELLED'] as const)(
  'keeps the source login published when the switch sheet %s',
  async (outcome) => {
    const ctx = setup();
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    const published: (string | null)[] = [];
    const unsubscribe = ctx.controller.subscribe(() => {
      published.push(ctx.controller.getSnapshot().account?.userId ?? null);
    });
    if (outcome === 'returns no session')
      ctx.auth.signIn.mockResolvedValueOnce(null);
    else
      ctx.auth.signIn.mockRejectedValueOnce(new ProviderAuthError('CANCELLED'));
    await ctx.controller.signIn('google');
    unsubscribe();
    // Unpublishing the account would read as an owner change downstream.
    expect(published).not.toContain(null);
    expect(ctx.controller.currentSession()?.token).toBe(session.accessToken);
    expect(ctx.saved()?.pendingSignIn).toBeNull();
    expect(ctx.stored.has('justgo.auth.provider-switch-proof.v1')).toBe(false);
    ctx.controller.dispose();
  },
);

it('clears a link an older build left unfinished once a sign-in is verified', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.controller.dispose();
  await ctx.storage.write({
    ...ctx.saved()!,
    pendingLink: {
      provider: 'google',
      ownerId: account.userId,
      authUserId: account.authUserId,
    },
  });
  const restarted = ctx.create();
  await restarted.initialize();
  await restarted.signIn('google');
  expect(ctx.saved()?.pendingLink).toBeNull();
  expect(restarted.getSnapshot()).toMatchObject({
    hasPending: false,
    provider: 'google',
  });
  expect(restarted.getSnapshot().account).not.toBeNull();
  restarted.dispose();
});

const proofKey = 'justgo.auth.provider-switch-proof.v1';
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const switchDestination: ProviderSession = {
  authUserId: uuid(41),
  accessToken: 'synthetic-destination-token',
  expiresAt: session.expiresAt,
  linkedProviders: ['google'],
  provider: 'google',
};
const leaveSwitchProof = async (ctx: ReturnType<typeof setup>) => {
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  // The network drops after the destination sheet completes, so revoking the
  // source app session fails and the switch stops with its proof still saved.
  ctx.auth.signIn.mockImplementationOnce(async () => {
    ctx.setProvider(switchDestination);
    ctx.setFailure(new ApiError('UNAVAILABLE'));
    return switchDestination;
  });
  await ctx.controller.signIn('google');
  expect(JSON.parse(ctx.stored.get(proofKey) ?? 'null')).toEqual({
    token: session.accessToken,
    authUserId: session.authUserId,
  });
  expect(ctx.saved()?.pendingSignIn).toMatchObject({
    switching: true,
    authenticated: true,
  });
  ctx.setFailure(null);
};

it('revokes a leftover switch proof with the source bearer before logging out the current session (#254)', async () => {
  const ctx = setup();
  await leaveSwitchProof(ctx);
  const before = ctx.calls.length;
  expect(await ctx.controller.signOut()).toBe(true);
  expect(
    ctx.calls
      .slice(before)
      .filter(({ path }) => path === '/auth/logout')
      .map(({ method, token, body }) => ({ method, token, body })),
  ).toEqual([
    { method: 'POST', token: session.accessToken, body: { scope: 'session' } },
    {
      method: 'POST',
      token: switchDestination.accessToken,
      body: { scope: 'session' },
    },
  ]);
  expect(ctx.stored.has(proofKey)).toBe(false);
  expect(ctx.controller.getSnapshot()).toMatchObject({
    mode: 'signed-out',
    account: null,
  });
  ctx.controller.dispose();
});

it('keeps logout pending and the switch proof stored when revoking the source session fails (#279)', async () => {
  const ctx = setup();
  await leaveSwitchProof(ctx);
  const request = ctx.api.request;
  ctx.api.request = async (method, path, schema, body, token, signal) => {
    const response = await request(method, path, schema, body, token, signal);
    if (path === '/auth/logout' && token === session.accessToken)
      throw new ApiError('UNAVAILABLE');
    return response;
  };
  const before = ctx.calls.length;
  expect(await ctx.controller.signOut()).toBe(false);
  expect(
    ctx.calls
      .slice(before)
      .filter(({ path }) => path === '/auth/logout')
      .map(({ token }) => token),
  ).toEqual([session.accessToken]);
  expect(ctx.saved()?.logoutPending).toBe(true);
  expect(JSON.parse(ctx.stored.get(proofKey) ?? 'null')).toEqual({
    token: session.accessToken,
    authUserId: session.authUserId,
  });
  expect(ctx.auth.signOut).not.toHaveBeenCalled();
  ctx.controller.dispose();
});

it('re-verifies a source the server rejects while a cancelled switch restores it', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  const verifications = () =>
    ctx.calls.filter(
      ({ method, path, token }) =>
        method === 'GET' &&
        path === '/auth/session' &&
        token === session.accessToken,
    ).length;
  const before = verifications();
  // The server now rejects the source bearer.
  ctx.setVerifiedAccount(session.accessToken, new ApiError('SESSION_REVOKED'));
  // Hold the restore's proof clear, so an in-flight sync request can finish.
  const gate = deferred<void>();
  let clearing = false;
  ctx.secureStorage.removeItem.mockImplementation(async (key: string) => {
    if (key === proofKey) {
      clearing = true;
      await gate.promise;
    }
    ctx.stored.delete(key);
  });
  ctx.auth.signIn.mockResolvedValueOnce(null);
  const switching = ctx.controller.signIn('google');
  for (let i = 0; i < 50 && !clearing; i++) await flush();
  expect(clearing).toBe(true);
  // The account stayed published, so a sync request still used the source
  // token, and AccountClient reports the server's rejection.
  expect(ctx.controller.currentSession()?.token).toBe(session.accessToken);
  ctx.controller.rejectSession(session.accessToken, 'SESSION_REVOKED');
  expect(ctx.controller.getSnapshot()).toMatchObject({
    account: null,
    message: 'Please sign in again. Saved data remains on this phone.',
  });
  gate.resolve();
  await switching;
  const after = {
    verificationsSinceRejection: verifications() - before,
    currentSessionToken: ctx.controller.currentSession()?.token ?? null,
    publishedAccount: ctx.controller.getSnapshot().account?.userId ?? null,
    message: ctx.controller.getSnapshot().message,
  };
  // Intent: a server-rejected source bearer is restored only after
  // GET /auth/session verifies it. The server rejects it, so it stays fenced.
  expect(after).toEqual({
    verificationsSinceRejection: 1,
    currentSessionToken: null,
    publishedAccount: null,
    message: expect.stringMatching(/sign in again/),
  });
  ctx.controller.dispose();
});

it.each(['sheet (control)', 'reading', 'clearing'] as const)(
  'keeps the login when an SDK refresh of the same session lands during a cancelled switch (%s)',
  async (phase) => {
    const ctx = setup();
    const notifyProvider = ctx.auth.subscribe.mock.calls[0]![0];
    await ctx.controller.initialize();
    await ctx.controller.signIn('apple');
    // Same Supabase session, new access token: the server verifies it as the
    // same owner, Auth subject and app session.
    const refreshed = { ...session, accessToken: 'refreshed-provider-token' };
    ctx.setVerifiedAccount(refreshed.accessToken, account);
    const refresh = () => {
      ctx.setProvider(refreshed);
      notifyProvider(refreshed);
    };
    if (phase === 'sheet (control)')
      ctx.auth.signIn.mockImplementationOnce(async () => {
        refresh();
        return null;
      });
    else ctx.auth.signIn.mockResolvedValueOnce(null);
    if (phase === 'reading') {
      let reads = 0;
      ctx.secureStorage.getItem.mockImplementation(async (key: string) => {
        // signIn reads the proof once before the sheet; the restore reads it next.
        if (key === proofKey && ++reads === 2) refresh();
        return ctx.stored.get(key) ?? null;
      });
    } else if (phase === 'clearing')
      ctx.secureStorage.removeItem.mockImplementation(async (key: string) => {
        if (key === proofKey) refresh();
        ctx.stored.delete(key);
      });
    await ctx.controller.signIn('google');
    const result = {
      account: ctx.controller.getSnapshot().account?.userId ?? null,
      currentSessionToken: ctx.controller.currentSession()?.token ?? null,
      offlineAccountOwner: ctx.controller.offlineAccountOwner(),
      message: ctx.controller.getSnapshot().message,
      directSignInFailure: ctx.controller.getSnapshot().directSignInFailure,
      hasPending: ctx.controller.getSnapshot().hasPending,
    };
    // Intent: a cancel before the SDK replaces its session keeps the old login;
    // a changed source is restored after /auth/session verifies it. The
    // control (refresh while the sheet is open) shows that outcome.
    expect(result).toEqual({
      account: account.userId,
      currentSessionToken: refreshed.accessToken,
      offlineAccountOwner: account.userId,
      message: '',
      directSignInFailure: false,
      hasPending: false,
    });
    ctx.controller.dispose();
  },
);

it('keeps the source published when a web switch redirect is abandoned with Back', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.auth.signIn.mockResolvedValueOnce('redirecting');
  await ctx.controller.signIn('google');
  expect(ctx.saved()?.pendingSignIn?.switching).toBe(true);
  const published: (string | null)[] = [];
  const unsubscribe = ctx.controller.subscribe(() => {
    published.push(ctx.controller.getSnapshot().account?.userId ?? null);
  });
  // The page comes back without a callback, and the SDK still holds the source.
  await ctx.controller.retry({ background: true });
  unsubscribe();
  expect(published).not.toContain(null);
  expect(ctx.controller.currentSession()?.token).toBe(session.accessToken);
  expect(ctx.saved()?.pendingSignIn).toBeNull();
  ctx.controller.dispose();
});
