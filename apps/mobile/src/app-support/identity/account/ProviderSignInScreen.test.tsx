import { asyncStorageJournalStorage } from '../../../data/activity/persistence/storage';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import type { AccessResponse } from '@justgo/contracts';
import { createIdentityApi } from '../api';
import { createMemoryVault } from '../storage';
import { ManagedIdentityController } from '../auth/managed-controller';
import { createManagedIdentityController } from '../auth/create-managed-identity';
import type {
  ManagedIdentityState,
  ManagedIdentityStorage,
} from '../auth/managed-state';
import {
  ProviderAuthError,
  type ManagedAuth,
  type ProviderSession,
} from '../auth/types';
import { AppProvider, useRuntime } from '../../providers/AppProvider';
import { ProviderSignInScreen } from './ProviderSignInScreen';

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
jest.mock('../../../platform/connectivity/connectivity', () => ({
  listenToConnectivity: jest.fn(() => () => {}),
}));
jest.mock('../../../data/activity/persistence/storage', () => {
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
jest.mock('../auth/create-managed-identity', () => ({
  createManagedIdentityController: jest.fn(),
}));
jest.mock('../../../lib/legal-links', () => ({
  getLegalLinks: () => ({
    terms: 'https://justgo.example/terms',
    privacy: 'https://justgo.example/privacy',
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
    useIsFocused: () => true,
    // Settings → Account → the Apple switch, for an account signed in with Google.
    useLocalSearchParams: () => ({ provider: 'apple', switchProvider: '1' }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(effect, [effect]);
    },
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const userId = id(1);
const conflict =
  'That Apple ID or Google account already has its own JustGO account, so it can’t be added to this one. You’re still signed in, and nothing changed.';
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
const originalUrl = process.env.EXPO_PUBLIC_API_URL;
let controller: ManagedIdentityController;
let auth: jest.Mocked<ManagedAuth>;
let onAppState: (value: AppStateStatus) => void;
let runtime: ReturnType<typeof useRuntime> | undefined;

function Screen() {
  runtime = useRuntime();
  return <ProviderSignInScreen />;
}

beforeEach(async () => {
  for (const key of (await asyncStorageJournalStorage.getAllKeys?.()) ?? [])
    await asyncStorageJournalStorage.removeItem(key);
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
  const session = {
    userId,
    deviceId: id(2),
    sessionId: id(3),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  const access: AccessResponse = {
    status: 'verified',
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  // Account A signed in with Google only.
  const providerSession: ProviderSession = {
    authUserId: id(40),
    accessToken: 'a'.repeat(64),
    expiresAt: session.expiresAt,
    linkedProviders: ['google'],
    provider: 'google',
  };
  let stored: ManagedIdentityState = {
    version: 1 as const,
    deviceId: session.deviceId,
    guestId: id(50),
    guestAdoption: { ownerId: userId, status: 'consumed' },
    collectionAdoption: null,
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
  const storage: ManagedIdentityStorage = {
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
    storage,
    legacyVault: createMemoryVault(),
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
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = String(input);
    if (path.endsWith('/auth/session'))
      return response({
        ...session,
        authUserId: providerSession.authUserId,
        dataEpoch: 0,
      });
    if (path.includes('/completion-restores'))
      return response({ dataEpoch: 0, attempts: [], nextCursor: null });
    if (path.includes('/journal-sync'))
      return response({ dataEpoch: 0, versions: [], nextCursor: null });
    if (path.endsWith('/access')) return response(access);
    if (path.includes('/challenges'))
      return response({ challenges: [], nextCursor: null });
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    onAppState = listener;
    return { remove: jest.fn() };
  });
});
afterEach(async () => {
  await act(async () => await cleanup());
  await runtime?.client.queries.cancelQueries();
  runtime?.client.queries.clear();
  runtime?.activity.dispose();
  controller.dispose();
  focusManager.setFocused(undefined);
  await act(async () => jest.runOnlyPendingTimersAsync());
  jest.restoreAllMocks();
  jest.useRealTimers();
  runtime = undefined;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalUrl;
});

async function mount() {
  await render(
    <AppProvider>
      <Screen />
    </AppProvider>,
  );
  await waitFor(() => expect(controller.getSnapshot().account).toBeTruthy());
  await waitFor(() => expect(runtime?.client.queries.isFetching()).toBe(0));
}

/** iOS leaves the app while the native sheet and Face ID are up, then returns. */
async function switchToApple(outcome: () => Promise<ProviderSession | null>) {
  auth.linkIdentity.mockImplementationOnce(async () => {
    onAppState('inactive');
    return outcome();
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Sign in with Apple' }));
    await jest.advanceTimersByTimeAsync(0);
  });
  await waitFor(() => expect(controller.getSnapshot().busy).toBe(false));
}

async function foreground() {
  await act(async () => {
    onAppState('active');
    await jest.advanceTimersByTimeAsync(0);
  });
  await waitFor(() => expect(controller.getSnapshot().busy).toBe(false));
  await waitFor(() => expect(runtime?.client.queries.isFetching()).toBe(0));
}

// #507: the foreground retry after the Apple sheet erased the refusal.
it.failing(
  'keeps the identity-exists refusal on the switch screen after the app returns to the foreground (#507)',
  async () => {
    await mount();
    await switchToApple(async () => {
      throw new ProviderAuthError('IDENTITY_EXISTS');
    });
    expect(screen.getByRole('alert')).toHaveTextContent(conflict);

    await foreground();

    expect(screen.getByRole('alert')).toHaveTextContent(conflict);
    expect(controller.getSnapshot()).toMatchObject({
      account: { userId },
      provider: 'google',
    });
  },
);
