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
function setup() {
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
  const api: IdentityApi = {
    request: async (method, path, schema, body, token) => {
      calls.push({ method, path, body, token });
      if (failure) throw failure;
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
    });
    controller.setGuestDataMerger(jest.fn(async () => {}));
    controller.setGuestDataRetirer(jest.fn(async () => {}));
    return controller;
  };
  const controller = create();
  return {
    controller,
    create,
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

it('persists automatic adoption across a PKCE browser redirect', async () => {
  const ctx = setup();
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
  await callback.initialize();
  expect(merge).toHaveBeenCalledTimes(1);
  expect(callback.getSnapshot().account).toEqual(account);
});

it('fences uploads immediately on offline logout, retains local ownership and retries secure signout after restart', async () => {
  const ctx = setup();
  await ctx.controller.initialize();
  await ctx.controller.signIn('apple');
  ctx.setFailure(new ApiError('NETWORK'));
  expect(await ctx.controller.signOut()).toBe(false);
  expect(ctx.controller.currentSession()).toBeNull();
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
  expect(restarted.getSnapshot()).toMatchObject({
    mode: 'signed-out',
    account: null,
    collectionId: account.userId,
  });
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
