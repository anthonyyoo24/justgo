import { createManagedAuth } from './managed-auth';
import type { ProviderSession } from './types';

// These cases run the real supabase-js client, so a library update that
// changes how a local sign-out treats storage and the network fails here.
// managed-auth.test.ts fakes the client and cannot see that.
const mockStore = new Map<string, string>();
jest.mock('./provider-token', () => ({ nativeProviderToken: jest.fn() }));
jest.mock('../../../platform/auth/auth-storage', () => ({
  createAuthStorage: () => ({
    getItem: (key: string) => Promise.resolve(mockStore.get(key) ?? null),
    setItem: (key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      mockStore.delete(key);
      return Promise.resolve();
    },
  }),
}));

const origin = 'https://synthetic-project.supabase.co';
const storageKey = 'justgo.auth.v1';
const userId = '10000000-0000-4000-8000-000000000041';
const storedSession = {
  access_token: 'synthetic-managed-access-token-for-sign-out',
  refresh_token: 'synthetic-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1893456000,
  user: {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00Z',
  },
};

let fetchMock: jest.SpyInstance;
const environment = { ...process.env };

beforeEach(() => {
  mockStore.clear();
  mockStore.set(storageKey, JSON.stringify(storedSession));
  process.env.EXPO_PUBLIC_SUPABASE_URL = origin;
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_synthetic_fixture_key';
  fetchMock = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock.mockRestore();
  process.env = { ...environment };
});

function logoutRequests() {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith(`${origin}/auth/v1/logout`));
}

it('signs out of this phone and revokes the session online', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  const auth = createManagedAuth();
  const seen: (ProviderSession | null)[] = [];
  auth.subscribe((session) => seen.push(session));

  await expect(auth.signOut()).resolves.toBeUndefined();

  expect(logoutRequests()).toEqual([`${origin}/auth/v1/logout?scope=local`]);
  expect(mockStore.has(storageKey)).toBe(false);
  expect(seen.at(-1)).toBeNull();
  auth.dispose();
});

it('clears the stored session offline, reports the failure, and finishes on retry', async () => {
  fetchMock.mockRejectedValue(new TypeError('Network request failed'));
  const auth = createManagedAuth();

  // The phone is signed out even though the revoke request failed.
  await expect(auth.signOut()).rejects.toMatchObject({ code: 'AUTH' });
  expect(mockStore.has(storageKey)).toBe(false);
  expect(logoutRequests()).toHaveLength(1);

  // The controller keeps logoutPending and retries. With no stored session the
  // retry needs no network and succeeds.
  fetchMock.mockClear();
  await expect(auth.signOut()).resolves.toBeUndefined();
  expect(logoutRequests()).toEqual([]);
  auth.dispose();
});

it('clears an expired session offline even though it cannot refresh it', async () => {
  mockStore.set(
    storageKey,
    JSON.stringify({ ...storedSession, expires_at: 1700000000 }),
  );
  fetchMock.mockRejectedValue(new TypeError('Network request failed'));
  jest.useFakeTimers({ now: Date.parse('2026-11-09T12:00:00Z') });
  const auth = createManagedAuth();
  try {
    // Before supabase-js 2.119 a failed refresh kept the expired session, so
    // an offline logout failed on every retry until the phone was back online.
    // The refresh retries with backoff, so the clock runs it to the end.
    const first = auth.signOut();
    const outcome = expect(first).rejects.toMatchObject({ code: 'AUTH' });
    await jest.advanceTimersByTimeAsync(60_000);
    await outcome;
    expect(mockStore.has(storageKey)).toBe(false);
    expect(logoutRequests()).toEqual([]);

    fetchMock.mockClear();
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    auth.dispose();
    jest.useRealTimers();
  }
});
