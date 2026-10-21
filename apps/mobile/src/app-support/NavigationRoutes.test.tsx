import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import {
  act,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import RootLayout from '../app/_layout';
import AccessRoute from '../app/access';
import HomeRoute from '../app/(tabs)/index';
import NotFoundRoute from '../app/+not-found';

let mockSnapshot = {
  identity: {
    initialized: true,
    busy: false,
    account: { userId: 'synthetic-account' } as { userId: string } | null,
    collectionId: 'synthetic-account' as string | null,
    collectionKind: 'account' as 'guest' | 'account',
    deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
    needsWelcome: false,
  },
  access: { verified: true, isPending: false, refetch: jest.fn() },
};
const mockListeners = new Set<() => void>();
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./providers/AppProvider', () => {
  const React = require('react') as typeof import('react');
  function useSnapshot() {
    return React.useSyncExternalStore(
      (listener) => {
        mockListeners.add(listener);
        return () => mockListeners.delete(listener);
      },
      () => mockSnapshot,
      () => mockSnapshot,
    );
  }
  return {
    AppProvider: ({ children }: { children: ReactNode }) => children,
    useIdentity: () => useSnapshot().identity,
    useAccess: () => useSnapshot().access,
  };
});
jest.mock('./identity/welcome/WelcomeTransition', () => ({
  WelcomeTransition: ({ children }: { children: ReactNode }) => children,
  useWelcomeTransition: () => false,
}));
jest.mock('./saving/SavingFeedback', () => ({
  SavingFeedbackShell: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../features/challenges/active/ChallengeActivityProvider', () => ({
  ChallengeActivityProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
jest.mock('../features/challenges/ChallengeScreen', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return { ChallengeScreen: () => <Text>Home ready</Text> };
});
jest.mock('../platform/motion/MotionPreferencesProvider', () => ({
  MotionPreferencesProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
jest.mock('../platform/haptics/HapticsPreferencesProvider', () => ({
  HapticsPreferencesProvider: ({ children }: { children: ReactNode }) =>
    children,
}));

const routes = {
  _layout: RootLayout,
  access: AccessRoute,
  acceptance: () => <Text>Acceptance ready</Text>,
  '(tabs)/_layout': () => <Stack screenOptions={{ animation: 'none' }} />,
  '(tabs)/index': HomeRoute,
  '(tabs)/progress': () => <Text>Progress ready</Text>,
  '(challenge)/challenge': () => <Text>Challenge ready</Text>,
  '(challenge)/success': () => <Text>Success ready</Text>,
  '(challenge)/reflection': () => <Text>Reflection ready</Text>,
  'account/recover': () => <Text>Recover ready</Text>,
  'account/keys': () => <Text>Keys ready</Text>,
  'account/devices': () => <Text>Devices ready</Text>,
  'account/transfer': () => <Text>Transfer ready</Text>,
  'account/troubleshooting': () => <Text>Troubleshooting ready</Text>,
  'account/sign-in': () => <Text>Sign in ready</Text>,
  'auth/callback': () => <Text>Callback ready</Text>,
  settings: () => <Text>Settings ready</Text>,
  data: () => <Text>Data ready</Text>,
  recovery: () => <Text>Recovery ready</Text>,
  'delete-account': () => <Text>Deletion ready</Text>,
  welcome: () => <Text>Welcome ready</Text>,
  preview: () => <Text>Preview ready</Text>,
  '+not-found': NotFoundRoute,
};

beforeEach(() => {
  mockSnapshot = {
    identity: {
      initialized: true,
      busy: false,
      account: { userId: 'synthetic-account' },
      collectionId: 'synthetic-account',
      collectionKind: 'account',
      deletionStatus: null,
      needsWelcome: false,
    },
    access: { verified: true, isPending: false, refetch: jest.fn() },
  };
});

it('opens Home at the sole root URL when access is verified', async () => {
  const navigation = renderRouter(routes, { initialUrl: '/' });
  expect(await screen.findByText('Home ready')).toBeTruthy();
  expect(navigation.getPathname()).toBe('/');
});

it.each(['/challenge', '/success', '/reflection'])(
  'falls back from %s to /access when access is unavailable',
  async (initialUrl) => {
    mockSnapshot.access.verified = false;
    const navigation = renderRouter(routes, { initialUrl });
    expect(await screen.findByText('We can’t verify access yet.')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/access');
  },
);

it('keeps the Home URL available while preventing challenge admission with stale access', async () => {
  mockSnapshot.access.verified = false;
  const navigation = renderRouter(routes, { initialUrl: '/' });
  expect(await screen.findByText('We can’t verify access yet.')).toBeTruthy();
  expect(navigation.getPathname()).toBe('/');
  expect(screen.queryByText('Home ready')).toBeNull();
});

it.each(['guest', 'account'] as const)(
  'keeps the %s local collection readable while signed out and offline',
  async (collectionKind) => {
    mockSnapshot.identity.account = null;
    mockSnapshot.identity.collectionKind = collectionKind;
    mockSnapshot.access.verified = false;
    const navigation = renderRouter(routes, { initialUrl: '/progress' });
    expect(await screen.findByText('Progress ready')).toBeTruthy();
    act(() => router.push('/settings'));
    expect(await screen.findByText('Settings ready')).toBeTruthy();
    act(() => router.push('/challenge'));
    expect(await screen.findByText('Settings ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/settings');
    expect(screen.queryByText('Challenge ready')).toBeNull();
    act(() => router.replace('/'));
    expect(await screen.findByText('We can’t verify access yet.')).toBeTruthy();
    expect(screen.queryByText('Home ready')).toBeNull();
  },
);

it.each(['guest', 'account'] as const)(
  'preserves a cold %s history link while saved identity is loading offline',
  async (collectionKind) => {
    mockSnapshot.identity = {
      ...mockSnapshot.identity,
      initialized: false,
      account: null,
      collectionId: null,
      needsWelcome: true,
    };
    mockSnapshot.access.verified = false;
    const navigation = renderRouter(routes, { initialUrl: '/progress' });
    expect(screen.getByLabelText('Loading saved data')).toBeTruthy();
    expect(screen.queryByText('Welcome ready')).toBeNull();
    act(() => {
      mockSnapshot = {
        ...mockSnapshot,
        identity: {
          ...mockSnapshot.identity,
          initialized: true,
          needsWelcome: false,
          collectionId: 'saved-local-collection',
          collectionKind,
        },
      };
      for (const listener of mockListeners) listener();
    });
    expect(await screen.findByText('Progress ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/progress');
    expect(screen.queryByText('We can’t verify access yet.')).toBeNull();
  },
);

it.each([
  ['/account/recover', 'Recover'],
  ['/account/keys', 'Keys'],
  ['/account/devices', 'Devices'],
  ['/account/transfer', 'Transfer'],
  ['/account/troubleshooting', 'Troubleshooting'],
  ['/settings', 'Settings'],
  ['/data', 'Data'],
  ['/account/sign-in', 'Sign in'],
  ['/auth/callback', 'Callback'],
  ['/recovery', 'Recovery'],
  ['/delete-account', 'Deletion'],
] as const)(
  'keeps %s outside the paid-access guard',
  async (initialUrl, title) => {
    mockSnapshot.access.verified = false;
    const navigation = renderRouter(routes, { initialUrl });
    expect(await screen.findByText(`${title} ready`)).toBeTruthy();
    expect(navigation.getPathname()).toBe(initialUrl);
  },
);

it.each(['/challenge', '/success', '/reflection'])(
  'preserves the grouped public URL %s',
  async (initialUrl) => {
    const navigation = renderRouter(routes, { initialUrl });
    await waitFor(() => expect(navigation.getPathname()).toBe(initialUrl));
  },
);

it.each(['/account/toString', '/account/unknown', '/export-data'])(
  'sends the removed or unknown route %s to not found',
  async (initialUrl) => {
    renderRouter(routes, { initialUrl });
    expect(
      await screen.findByRole('header', { name: 'Page not found' }),
    ).toBeTruthy();
  },
);

it.each([
  [true, true, 'Home ready', '/'],
  [false, true, 'We can’t verify access yet.', '/access'],
  [false, false, 'Recovery ready', '/recovery'],
] as const)(
  'leaves an unknown URL through the access gate (verified=%s, account=%s)',
  async (verified, hasAccount, destination, pathname) => {
    mockSnapshot.access.verified = verified;
    if (!hasAccount) {
      mockSnapshot.identity.account = null;
      mockSnapshot.identity.collectionId = null;
    }
    const navigation = renderRouter(routes, { initialUrl: '/unknown-route' });
    fireEvent.press(await screen.findByRole('button', { name: 'Go home' }));
    expect(await screen.findByText(destination)).toBeTruthy();
    expect(navigation.getPathname()).toBe(pathname);
  },
);

it('removes deleted-account screens from actual navigation history', async () => {
  const navigation = renderRouter(routes, { initialUrl: '/' });
  act(() => router.push('/settings'));
  expect(await screen.findByText('Settings ready')).toBeTruthy();
  act(() => {
    mockSnapshot = {
      ...mockSnapshot,
      identity: {
        ...mockSnapshot.identity,
        account: null,
        deletionStatus: 'deleted',
      },
    };
    for (const listener of mockListeners) listener();
  });
  expect(await screen.findByText('Welcome ready')).toBeTruthy();
  expect(navigation.getPathname()).toBe('/welcome');
  expect(router.canGoBack()).toBe(false);
  expect(screen.queryByText('Settings ready')).toBeNull();
  expect(screen.queryByText('Home ready')).toBeNull();
});

it.each([
  ['/', 'Home'],
  ['/challenge', 'Challenge'],
  ['/success', 'Success'],
  ['/reflection', 'Reflection'],
  ['/progress', 'Progress'],
] as const)(
  'opens %s for a verified account without legal confirmation',
  async (initialUrl, title) => {
    const navigation = renderRouter(routes, { initialUrl });
    expect(await screen.findByText(`${title} ready`)).toBeTruthy();
    expect(navigation.getPathname()).toBe(initialUrl);
    expect(screen.queryByText('Acceptance ready')).toBeNull();
  },
);

it.each([
  ['/settings', 'Settings'],
  ['/recovery', 'Recovery'],
  ['/account/recover', 'Recover'],
  ['/delete-account', 'Deletion'],
] as const)(
  'keeps %s reachable without legal confirmation',
  async (initialUrl, title) => {
    const navigation = renderRouter(routes, { initialUrl });
    expect(await screen.findByText(`${title} ready`)).toBeTruthy();
    expect(navigation.getPathname()).toBe(initialUrl);
  },
);

it('routes a fresh installation to welcome without silently creating an account', async () => {
  mockSnapshot.identity.account = null;
  mockSnapshot.identity.needsWelcome = true;
  const navigation = renderRouter(routes, { initialUrl: '/' });
  expect(await screen.findByText('Welcome ready')).toBeTruthy();
  expect(navigation.getPathname()).toBe('/welcome');
});

it.each(['pending', 'cleanup'] as const)(
  'resumes %s deletion before product access despite stale verification',
  async (deletionStatus) => {
    mockSnapshot.identity.deletionStatus = deletionStatus;
    const navigation = renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Deletion ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/delete-account');
  },
);
