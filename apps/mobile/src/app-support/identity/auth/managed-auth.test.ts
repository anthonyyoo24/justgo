import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { createManagedAuth } from './managed-auth';
import { nativeProviderToken } from './provider-token';
import { AuthStorageError } from '../../../platform/auth/secure-storage';
import { deferred } from '../../../../test-support/journal';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./provider-token', () => ({ nativeProviderToken: jest.fn() }));
jest.mock('../../../platform/auth/auth-storage', () => ({
  createAuthStorage: () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  }),
}));
const serverSession = {
  user: {
    id: '10000000-0000-4000-8000-000000000040',
    identities: [{ provider: 'apple', identity_id: 'apple-identity' }],
  },
  access_token: 'synthetic-managed-access-token',
  expires_at: 1893456000,
};
let verifiedUser = serverSession.user;
let mockNotification: (
  event: string,
  session: typeof serverSession | null,
) => void;
const mockAuth = {
  getSession: jest.fn(),
  getUser: jest.fn(),
  linkIdentity: jest.fn(),
  unlinkIdentity: jest.fn(),
  signInWithIdToken: jest.fn(),
  signInWithOAuth: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  refreshSession: jest.fn(),
  signOut: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
  onAuthStateChange: jest.fn(),
};
const unsubscribe = jest.fn();
const originalPlatform = Platform.OS;
const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const originalWindow = global.window;
beforeEach(() => {
  jest.clearAllMocks();
  verifiedUser = serverSession.user;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  mockAuth.getSession.mockResolvedValue({
    data: { session: serverSession },
    error: null,
  });
  mockAuth.getUser.mockImplementation(async () => ({
    data: { user: verifiedUser },
    error: null,
  }));
  mockAuth.signInWithIdToken.mockResolvedValue({
    data: { session: serverSession },
    error: null,
  });
  mockAuth.linkIdentity.mockImplementation(async ({ provider }) => {
    verifiedUser = {
      ...verifiedUser,
      identities: [
        ...verifiedUser.identities,
        { provider, identity_id: `${provider}-identity` },
      ],
    };
    return { data: { session: serverSession }, error: null };
  });
  mockAuth.unlinkIdentity.mockImplementation(async ({ identity_id }) => {
    verifiedUser = {
      ...verifiedUser,
      identities: verifiedUser.identities.filter(
        (identity) => identity.identity_id !== identity_id,
      ),
    };
    return { data: {}, error: null };
  });
  mockAuth.refreshSession.mockResolvedValue({
    data: { session: serverSession },
    error: null,
  });
  mockAuth.signOut.mockResolvedValue({ error: null });
  mockAuth.startAutoRefresh.mockResolvedValue(undefined);
  mockAuth.stopAutoRefresh.mockResolvedValue(undefined);
  mockAuth.onAuthStateChange.mockImplementation((callback) => {
    mockNotification = callback;
    return { data: { subscription: { unsubscribe } } };
  });
  jest
    .mocked(createClient)
    .mockReturnValue({ auth: mockAuth } as unknown as ReturnType<
      typeof createClient
    >);
  jest.mocked(nativeProviderToken).mockResolvedValue({
    token: 'synthetic-id-token',
    nonce: 'raw-apple-nonce',
  });
});
afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: originalPlatform,
  });
  global.window = originalWindow;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined)
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
});

it('uses the configured secure adapter and PKCE without URL-session detection or direct database access', async () => {
  const auth = createManagedAuth();
  expect(await auth.initialize()).toMatchObject({
    authUserId: serverSession.user.id,
    accessToken: serverSession.access_token,
  });
  expect(createClient).toHaveBeenCalledWith(
    'https://synthetic.supabase.co',
    'sb_publishable_fixture',
    expect.objectContaining({
      auth: expect.objectContaining({
        storageKey: 'justgo.auth.v1',
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        autoRefreshToken: false,
      }),
    }),
  );
  await auth.signIn('apple');
  expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
    provider: 'apple',
    token: 'synthetic-id-token',
    nonce: 'raw-apple-nonce',
  });
  auth.dispose();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('does not initialize a provider or create any account during unconfigured guest startup', async () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const auth = createManagedAuth();
  expect(await auth.initialize()).toBeNull();
  expect(createClient).not.toHaveBeenCalled();
  await expect(auth.signIn('google')).rejects.toMatchObject({
    code: 'CONFIGURATION',
  });
});

it('rejects secret/service keys and insecure project URLs before creating a client', async () => {
  for (const [url, key] of [
    ['http://synthetic.supabase.co', 'sb_publishable_test'],
    ['https://synthetic.supabase.co', 'sb_secret_test'],
  ]) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = url;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
    await expect(createManagedAuth().initialize()).rejects.toMatchObject({
      code: 'CONFIGURATION',
    });
  }
  expect(createClient).not.toHaveBeenCalled();
});

it('does not exchange a token after native cancellation and safely maps secure storage failures', async () => {
  jest.mocked(nativeProviderToken).mockResolvedValueOnce(null);
  const auth = createManagedAuth();
  expect(await auth.signIn('apple')).toBeNull();
  expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  mockAuth.getSession.mockRejectedValueOnce(new AuthStorageError());
  await expect(auth.initialize()).rejects.toMatchObject({ code: 'STORAGE' });
});

it('redirects browser sign-in with PKCE and exchanges only the callback code, removing it from the URL first', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const assign = jest.fn();
  const replaceState = jest.fn();
  global.window = {
    location: {
      href: 'https://justgo.example/auth/callback?code=synthetic-code',
      origin: 'https://justgo.example',
      assign,
    },
    history: { replaceState },
  } as unknown as Window & typeof globalThis;
  mockAuth.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://synthetic.supabase.co/auth/v1/authorize' },
    error: null,
  });
  mockAuth.exchangeCodeForSession.mockResolvedValue({
    data: { session: serverSession },
    error: null,
  });
  const auth = createManagedAuth();
  await auth.initialize();
  expect(replaceState).toHaveBeenCalledWith(null, '', '/auth/callback');
  expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith(
    'synthetic-code',
  );
  expect(await auth.signIn('google')).toBe('redirecting');
  expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google',
    options: {
      redirectTo: 'https://justgo.example/auth/callback',
      skipBrowserRedirect: true,
    },
  });
  expect(assign).toHaveBeenCalledTimes(1);
  expect(nativeProviderToken).not.toHaveBeenCalled();
});

it('notifies refreshed sessions without making Auth calls from the SDK callback and stops workers on logout', async () => {
  const auth = createManagedAuth();
  const listener = jest.fn();
  auth.subscribe(listener);
  await auth.initialize();
  const reads = mockAuth.getSession.mock.calls.length;
  const identityReads = mockAuth.getUser.mock.calls.length;
  mockNotification('TOKEN_REFRESHED', {
    ...serverSession,
    access_token: 'new-synthetic-managed-token',
  });
  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({ accessToken: 'new-synthetic-managed-token' }),
  );
  expect(mockAuth.getSession).toHaveBeenCalledTimes(reads);
  expect(mockAuth.getUser).toHaveBeenCalledTimes(identityReads);
  auth.setActive(false);
  await auth.signOut();
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(mockAuth.stopAutoRefresh).toHaveBeenCalled();
});

it('links a native provider to the existing Auth identity instead of signing into another identity', async () => {
  const auth = createManagedAuth();
  await auth.initialize();
  await expect(auth.linkIdentity('google')).resolves.toMatchObject({
    linkedProviders: ['apple', 'google'],
  });
  expect(mockAuth.linkIdentity).toHaveBeenCalledWith({
    provider: 'google',
    token: 'synthetic-id-token',
    nonce: 'raw-apple-nonce',
  });
  expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  expect(mockAuth.getUser).toHaveBeenCalledWith(serverSession.access_token);
});

it('reads actual linked identities at startup and refresh instead of trusting the cached provider list', async () => {
  verifiedUser = {
    ...serverSession.user,
    identities: [
      { provider: 'google', identity_id: 'google-identity' },
      { provider: 'google', identity_id: 'duplicate-google-identity' },
      { provider: 'email', identity_id: 'unsupported-email-identity' },
    ],
  };
  const auth = createManagedAuth();
  await expect(auth.initialize()).resolves.toMatchObject({
    linkedProviders: ['google'],
  });
  await expect(auth.refresh()).resolves.toMatchObject({
    linkedProviders: ['google'],
  });
  auth.dispose();
});

it('unlinks the verified identity and refreshes connections while retaining the same account session', async () => {
  const auth = createManagedAuth();
  await auth.linkIdentity('google');
  const linked = verifiedUser;
  await expect(auth.unlinkIdentity('apple')).resolves.toMatchObject({
    authUserId: serverSession.user.id,
    accessToken: serverSession.access_token,
    linkedProviders: ['google'],
  });
  expect(mockAuth.unlinkIdentity).toHaveBeenCalledWith(linked.identities[0]);
  expect(mockAuth.signOut).not.toHaveBeenCalled();
  auth.dispose();
});

it.each([
  [{ provider: 'apple', identity_id: 'apple-identity' }],
  [
    { provider: 'apple', identity_id: 'apple-identity' },
    { provider: 'email', identity_id: 'email-identity' },
  ],
  [
    { provider: 'apple', identity_id: 'apple-identity' },
    { provider: 'apple', identity_id: 'second-apple-identity' },
  ],
])(
  'keeps the final supported login method even if unsupported or duplicate identities exist (%#)',
  async (...identities) => {
    verifiedUser = { ...serverSession.user, identities };
    const auth = createManagedAuth();
    await expect(auth.unlinkIdentity('apple')).rejects.toMatchObject({
      code: 'LAST_PROVIDER',
    });
    expect(mockAuth.unlinkIdentity).not.toHaveBeenCalled();
    auth.dispose();
  },
);

it('treats an already removed identity as a completed retry and an already linked method as unchanged', async () => {
  const auth = createManagedAuth();
  await expect(auth.unlinkIdentity('google')).resolves.toMatchObject({
    linkedProviders: ['apple'],
  });
  await expect(auth.linkIdentity('apple')).resolves.toMatchObject({
    linkedProviders: ['apple'],
  });
  expect(mockAuth.unlinkIdentity).not.toHaveBeenCalled();
  expect(mockAuth.linkIdentity).not.toHaveBeenCalled();
  expect(nativeProviderToken).not.toHaveBeenCalled();
  auth.dispose();
});

it('rejects unlink without a session and does not remove anything when verification fails', async () => {
  const auth = createManagedAuth();
  mockAuth.getSession.mockResolvedValueOnce({
    data: { session: null },
    error: null,
  });
  await expect(auth.unlinkIdentity('apple')).rejects.toMatchObject({
    code: 'AUTH',
  });
  mockAuth.getUser.mockResolvedValueOnce({
    data: { user: null },
    error: { message: 'synthetic secret' },
  });
  await expect(auth.unlinkIdentity('apple')).rejects.toMatchObject({
    message: 'AUTH',
  });
  expect(mockAuth.unlinkIdentity).not.toHaveBeenCalled();
  auth.dispose();
});

it('leaves the prior connections intact when linking is cancelled or rejected by the provider', async () => {
  const auth = createManagedAuth();
  jest.mocked(nativeProviderToken).mockResolvedValueOnce(null);
  await expect(auth.linkIdentity('google')).resolves.toBeNull();
  expect(mockAuth.linkIdentity).not.toHaveBeenCalled();
  mockAuth.linkIdentity.mockResolvedValueOnce({
    data: { session: null },
    error: { code: 'identity_already_exists' },
  });
  await expect(auth.linkIdentity('google')).rejects.toMatchObject({
    code: 'AUTH',
  });
  await expect(auth.initialize()).resolves.toMatchObject({
    linkedProviders: ['apple'],
  });
  auth.dispose();
});

it('does not report linking success before the new identity is visible in the verified user', async () => {
  mockAuth.linkIdentity.mockResolvedValueOnce({
    data: { session: serverSession },
    error: null,
  });
  const auth = createManagedAuth();
  await expect(auth.linkIdentity('google')).rejects.toMatchObject({
    code: 'AUTH',
  });
  auth.dispose();
});

it('starts browser linking for the current account and verifies identities after its callback', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const assign = jest.fn();
  global.window = {
    location: {
      href: 'https://justgo.example/account',
      origin: 'https://justgo.example',
      assign,
    },
    history: { replaceState: jest.fn() },
  } as unknown as Window & typeof globalThis;
  mockAuth.linkIdentity.mockResolvedValueOnce({
    data: { url: 'https://synthetic.supabase.co/auth/v1/authorize' },
    error: null,
  });
  const auth = createManagedAuth();
  await expect(auth.linkIdentity('google')).resolves.toBe('redirecting');
  expect(mockAuth.linkIdentity).toHaveBeenCalledWith({
    provider: 'google',
    options: {
      redirectTo: 'https://justgo.example/auth/callback',
      skipBrowserRedirect: true,
    },
  });
  expect(assign).toHaveBeenCalledWith(
    'https://synthetic.supabase.co/auth/v1/authorize',
  );
  expect(nativeProviderToken).not.toHaveBeenCalled();
  verifiedUser = {
    ...serverSession.user,
    identities: [
      ...serverSession.user.identities,
      { provider: 'google', identity_id: 'google-identity' },
    ],
  };
  await expect(auth.initialize()).resolves.toMatchObject({
    linkedProviders: ['apple', 'google'],
  });
  auth.dispose();
});

it('keeps an unlink failure retryable and confirms the refreshed result before reporting success', async () => {
  const auth = createManagedAuth();
  await auth.linkIdentity('google');
  mockAuth.unlinkIdentity.mockResolvedValueOnce({
    data: null,
    error: { message: 'synthetic secret' },
  });
  await expect(auth.unlinkIdentity('google')).rejects.toMatchObject({
    message: 'AUTH',
  });
  mockAuth.unlinkIdentity.mockResolvedValueOnce({ data: {}, error: null });
  await expect(auth.unlinkIdentity('google')).rejects.toMatchObject({
    code: 'AUTH',
  });
  await expect(auth.unlinkIdentity('google')).resolves.toMatchObject({
    linkedProviders: ['apple'],
  });
  auth.dispose();
});

it('rejects a different verified subject before altering a login method', async () => {
  verifiedUser = {
    ...serverSession.user,
    id: '10000000-0000-4000-8000-000000000099',
  };
  const auth = createManagedAuth();
  await expect(auth.linkIdentity('google')).rejects.toMatchObject({
    code: 'AUTH',
  });
  await expect(auth.unlinkIdentity('apple')).rejects.toMatchObject({
    code: 'AUTH',
  });
  expect(mockAuth.linkIdentity).not.toHaveBeenCalled();
  expect(mockAuth.unlinkIdentity).not.toHaveBeenCalled();
  auth.dispose();
});

it('rejects a cached session changing during identity verification', async () => {
  mockAuth.getSession.mockResolvedValueOnce({
    data: { session: serverSession },
    error: null,
  });
  mockAuth.getSession.mockResolvedValueOnce({
    data: {
      session: {
        ...serverSession,
        user: {
          ...serverSession.user,
          id: '10000000-0000-4000-8000-000000000099',
        },
      },
    },
    error: null,
  });
  const auth = createManagedAuth();
  await expect(auth.linkIdentity('google')).rejects.toMatchObject({
    code: 'AUTH',
  });
  expect(mockAuth.linkIdentity).not.toHaveBeenCalled();
  auth.dispose();
});

it('does not link a native credential that arrives after sign-out', async () => {
  const credential =
    deferred<Awaited<ReturnType<typeof nativeProviderToken>>>();
  const requested = deferred<void>();
  jest.mocked(nativeProviderToken).mockImplementationOnce(() => {
    requested.resolve();
    return credential.promise;
  });
  const auth = createManagedAuth();
  const linking = auth.linkIdentity('google');
  await requested.promise;
  await auth.signOut();
  credential.resolve({ token: 'synthetic-id-token' });
  await expect(linking).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(mockAuth.linkIdentity).not.toHaveBeenCalled();
  auth.dispose();
});

it('fences a delayed unlink response after disposal', async () => {
  const pending = deferred<{ data: object; error: null }>();
  const requested = deferred<void>();
  const auth = createManagedAuth();
  await auth.linkIdentity('google');
  mockAuth.unlinkIdentity.mockImplementationOnce(() => {
    requested.resolve();
    return pending.promise;
  });
  const unlinking = auth.unlinkIdentity('google');
  await requested.promise;
  auth.dispose();
  pending.resolve({ data: {}, error: null });
  await expect(unlinking).rejects.toMatchObject({ code: 'CANCELLED' });
});
