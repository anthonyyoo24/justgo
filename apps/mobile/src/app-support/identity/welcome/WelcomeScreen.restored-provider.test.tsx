import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import { asyncStorageJournalStorage } from '../../../data/activity/persistence/storage';
import {
  AppProvider,
  createAppRuntime,
  useRuntime,
} from '../../providers/AppProvider';
import { createIdentityApi } from '../api';
import { createMemoryVault } from '../storage';
import { ManagedIdentityController } from '../auth/managed-controller';
import { createManagedIdentityController } from '../auth/create-managed-identity';
import type { ManagedIdentityState } from '../auth/managed-state';
import type {
  ManagedAuth,
  ProviderSession,
  SignInProvider,
} from '../auth/types';
import { WelcomeScreen } from './WelcomeScreen';

jest.mock('expo-crypto', () => {
  let sequence = 10;
  return {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    getRandomValues: (array: Uint8Array) => array.fill(0xbb),
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
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    useRouter: () => ({ push: jest.fn() }),
    useIsFocused: () => true,
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => effect(), [effect]);
    },
  };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const userId = id(1);
const authUserId = id(40);
const account = {
  userId,
  deviceId: id(2),
  sessionId: id(3),
  authUserId,
  expiresAt: '2099-01-01T00:00:00.000Z',
  dataEpoch: 0,
};
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
let runtime: ReturnType<typeof createAppRuntime> | undefined;
let controller: ManagedIdentityController | undefined;

function WelcomeRoute() {
  const current = useRuntime();
  useEffect(() => {
    runtime = current;
  }, [current]);
  return <WelcomeScreen controller={current.identity} />;
}

beforeEach(async () => {
  for (const key of (await asyncStorageJournalStorage.getAllKeys?.()) ?? [])
    await asyncStorageJournalStorage.removeItem(key);
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({
    remove: jest.fn(),
  }));
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = String(input);
    if (path.endsWith('/auth/session')) return response(account);
    if (path.endsWith('/access'))
      return response({
        status: 'verified',
        checkedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    if (path.includes('/completion-restores'))
      return response({ dataEpoch: 0, attempts: [], nextCursor: null });
    if (path.includes('/journal-sync'))
      return response({ dataEpoch: 0, versions: [], nextCursor: null });
    // The deck stays loading, so Welcome keeps showing the handoff spinner.
    if (path.endsWith('/v1/challenges')) return new Promise<Response>(() => {});
    throw new Error(`Unexpected fixture request: ${path}`);
  });
});
afterEach(async () => {
  await act(async () => await cleanup());
  await runtime?.client.queries.cancelQueries();
  runtime?.client.queries.clear();
  runtime?.activity.dispose();
  controller?.dispose();
  runtime = undefined;
  controller = undefined;
  focusManager.setFocused(undefined);
  await act(async () => jest.runOnlyPendingTimersAsync());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// #175: a restored Google account showed the busy spinner on Apple.
it.each(['google', 'apple'] as const)(
  'puts the restored %s account spinner on its provider after a reload (#175)',
  async (provider: SignInProvider) => {
    let saved: ManagedIdentityState = {
      version: 1,
      deviceId: account.deviceId,
      guestId: id(50),
      guestAdoption: { ownerId: userId, status: 'consumed' },
      collection: { kind: 'account', id: userId },
      mode: 'account',
      account,
      pendingSignIn: null,
      pendingLink: null,
      linkedLegacyOwnerIds: [],
      logoutPending: false,
      deletion: null,
      deleted: false,
    };
    const session: ProviderSession = {
      authUserId,
      accessToken: 'synthetic-token',
      expiresAt: account.expiresAt,
      linkedProviders: [provider],
    };
    const auth: ManagedAuth = {
      initialize: async () => session,
      refresh: async () => session,
      signIn: async () => session,
      linkIdentity: async () => session,
      unlinkIdentity: async () => session,
      signOut: async () => {},
      setActive: () => {},
      subscribe: () => () => {},
      dispose: () => {},
    };
    controller = new ManagedIdentityController({
      auth,
      storage: {
        read: async () => saved,
        write: async (next) => {
          saved = next;
        },
      },
      legacyVault: createMemoryVault(),
      api: createIdentityApi('http://localhost:3000', (...args) =>
        fetch(...args),
      ),
      secureStorage: {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      },
    });
    jest.mocked(createManagedIdentityController).mockReturnValue(controller);
    await render(
      <AppProvider>
        <WelcomeRoute />
      </AppProvider>,
    );
    const label = provider === 'apple' ? 'Apple' : 'Google';
    expect(
      await screen.findByLabelText(`Signing in with ${label}`),
    ).toBeTruthy();
    expect(
      screen
        .queryAllByRole('progressbar')
        .map((spinner) => spinner.props.accessibilityLabel),
    ).toEqual([`Signing in with ${label}`]);
  },
);
