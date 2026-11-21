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
import RootLayout, { unstable_settings } from '../app/_layout';
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
};
const mockListeners = new Set<() => void>();
// Billing off unless a test sets the app lock.
let mockLock: 'open' | 'checking' | 'locked' | null = null;
const mockAccess = {
  subscribe: (listener: () => void) => {
    mockListeners.add(listener);
    return () => {
      mockListeners.delete(listener);
    };
  },
  status: () => mockLock,
};
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('./startup/AppStartup', () => ({
  AppStartup: ({ children }: { children: ReactNode }) => children,
  StartupSurface: ({ children }: { children: ReactNode }) => children,
}));
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
    useRuntime: () => ({ access: mockLock ? mockAccess : null }),
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
  useChallengeActivity: () => ({ active: null }),
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
  // Without the `access` anchor, SDK 58 resolves a protected cold link to an
  // alphabetical supporting route instead of through hydration and admission.
  _layout: { default: RootLayout, unstable_settings },
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
  locked: () => <Text>Locked ready</Text>,
  'delete-account': () => <Text>Deletion ready</Text>,
  welcome: () => <Text>Welcome ready</Text>,
  preview: () => <Text>Preview ready</Text>,
  '+not-found': NotFoundRoute,
};

beforeEach(() => {
  mockLock = null;
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
  };
});

it('opens Home at the sole root URL with no access check', async () => {
  const navigation = await renderRouter(routes, { initialUrl: '/' });
  expect(await screen.findByText('Home ready')).toBeTruthy();
  expect(navigation.getPathname()).toBe('/');
});

it.each(['/', '/access'])(
  'keeps cold %s startup quiet while identity loads, then enters Home with no access check',
  async (initialUrl) => {
    mockSnapshot.identity = {
      ...mockSnapshot.identity,
      busy: true,
      account: null,
      collectionId: null,
    };
    const navigation = await renderRouter(routes, { initialUrl });
    expect(await screen.findByLabelText('Loading JustGO')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/access');
    expect(screen.queryByText('Home ready')).toBeNull();
    await act(() => {
      mockSnapshot = {
        ...mockSnapshot,
        identity: {
          ...mockSnapshot.identity,
          busy: false,
          account: { userId: 'synthetic-account' },
          collectionId: 'synthetic-account',
        },
      };
      for (const listener of mockListeners) listener();
    });
    expect(await screen.findByText('Home ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/');
    expect(screen.queryByLabelText('Loading JustGO')).toBeNull();
  },
);

it.each(['guest', 'account'] as const)(
  'keeps the %s local collection readable and Home open while signed out and offline',
  async (collectionKind) => {
    mockSnapshot.identity.account = null;
    mockSnapshot.identity.collectionKind = collectionKind;
    const navigation = await renderRouter(routes, { initialUrl: '/progress' });
    expect(await screen.findByText('Progress ready')).toBeTruthy();
    await act(() => router.push('/settings'));
    expect(await screen.findByText('Settings ready')).toBeTruthy();
    await act(() => router.push('/challenge'));
    // Route availability preserves existing local work. The actual challenge
    // screen independently requires an owner-local active start.
    expect(await screen.findByText('Challenge ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/challenge');
    await act(() => router.push('/progress'));
    expect(await screen.findByText('Progress ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/progress');
    await act(() => router.replace('/'));
    expect(await screen.findByText('Home ready')).toBeTruthy();
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
    const navigation = await renderRouter(routes, { initialUrl: '/progress' });
    expect(screen.getByLabelText('Loading saved data')).toBeTruthy();
    expect(screen.queryByText('Welcome ready')).toBeNull();
    await act(() => {
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
  ['/progress', 'Progress'],
  ['/account/sign-in', 'Sign in'],
  ['/auth/callback', 'Callback'],
  ['/recovery', 'Recovery'],
  ['/delete-account', 'Deletion'],
] as const)('opens %s directly', async (initialUrl, title) => {
  const navigation = await renderRouter(routes, { initialUrl });
  expect(await screen.findByText(`${title} ready`)).toBeTruthy();
  expect(navigation.getPathname()).toBe(initialUrl);
});

it.each(['/challenge', '/success', '/reflection'])(
  'preserves the grouped public URL %s',
  async (initialUrl) => {
    const navigation = await renderRouter(routes, { initialUrl });
    await waitFor(() => expect(navigation.getPathname()).toBe(initialUrl));
  },
);

it.each(['/account/toString', '/account/unknown', '/export-data'])(
  'sends the removed or unknown route %s to not found',
  async (initialUrl) => {
    await renderRouter(routes, { initialUrl });
    expect(
      await screen.findByRole('header', { name: 'Page not found' }),
    ).toBeTruthy();
  },
);

it.each([
  [true, 'Home ready', '/'],
  [false, 'Recovery ready', '/recovery'],
] as const)(
  'leaves an unknown URL through the startup route (account=%s)',
  async (hasAccount, destination, pathname) => {
    if (!hasAccount) {
      mockSnapshot.identity.account = null;
      mockSnapshot.identity.collectionId = null;
    }
    const navigation = await renderRouter(routes, {
      initialUrl: '/unknown-route',
    });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Go home' }),
    );
    expect(await screen.findByText(destination)).toBeTruthy();
    expect(navigation.getPathname()).toBe(pathname);
  },
);

it('removes deleted-account screens from actual navigation history', async () => {
  const navigation = await renderRouter(routes, { initialUrl: '/' });
  await act(() => router.push('/settings'));
  expect(await screen.findByText('Settings ready')).toBeTruthy();
  await act(() => {
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
  expect(screen.queryByText('Settings ready')).toBeNull();
  expect(screen.queryByText('Home ready')).toBeNull();
  // SDK 58 seeds the public access anchor. Traversing it must never restore
  // the deleted account's history, and Welcome must consume the final entry.
  expect(router.canGoBack()).toBe(true);
  await act(() => router.back());
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
    const navigation = await renderRouter(routes, { initialUrl });
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
    const navigation = await renderRouter(routes, { initialUrl });
    expect(await screen.findByText(`${title} ready`)).toBeTruthy();
    expect(navigation.getPathname()).toBe(initialUrl);
  },
);

it('routes a fresh installation to welcome without silently creating an account', async () => {
  mockSnapshot.identity.account = null;
  mockSnapshot.identity.needsWelcome = true;
  const navigation = await renderRouter(routes, { initialUrl: '/' });
  expect(await screen.findByText('Welcome ready')).toBeTruthy();
  expect(navigation.getPathname()).toBe('/welcome');
});

it('keeps Welcome mounted after provider authentication while its handoff is pending', async () => {
  mockSnapshot.identity.account = null;
  mockSnapshot.identity.needsWelcome = true;
  const navigation = await renderRouter(routes, { initialUrl: '/welcome' });
  expect(await screen.findByText('Welcome ready')).toBeTruthy();
  await act(() => {
    mockSnapshot = {
      ...mockSnapshot,
      identity: {
        ...mockSnapshot.identity,
        account: { userId: 'authenticated-owner' },
        needsWelcome: false,
      },
    };
    for (const listener of mockListeners) listener();
  });
  expect(navigation.getPathname()).toBe('/welcome');
  expect(screen.getByText('Welcome ready')).toBeTruthy();
  expect(screen.queryByLabelText('Loading JustGO')).toBeNull();
});

it.each(['pending', 'cleanup'] as const)(
  'resumes %s deletion before opening the app',
  async (deletionStatus) => {
    mockSnapshot.identity.deletionStatus = deletionStatus;
    const navigation = await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Deletion ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/delete-account');
  },
);

describe('with billing on', () => {
  const setLock = (lock: 'open' | 'checking' | 'locked') =>
    act(() => {
      mockLock = lock;
      for (const listener of mockListeners) listener();
    });

  it.each(['/', '/progress', '/settings', '/data', '/challenge'])(
    'shows only the locked screen at %s to an owner without verified access',
    async (initialUrl) => {
      mockLock = 'locked';
      const navigation = await renderRouter(routes, { initialUrl });
      expect(await screen.findByText('Locked ready')).toBeTruthy();
      expect(navigation.getPathname()).toBe('/locked');
      for (const ready of [
        'Home ready',
        'Progress ready',
        'Settings ready',
        'Data ready',
        'Challenge ready',
      ])
        expect(screen.queryByText(ready)).toBeNull();
    },
  );

  it('keeps sign-in and deletion reachable from the locked screen', async () => {
    mockLock = 'locked';
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Locked ready')).toBeTruthy();
    await act(() => router.push('/recovery'));
    expect(await screen.findByText('Recovery ready')).toBeTruthy();
    await act(() => router.push('/delete-account'));
    expect(await screen.findByText('Deletion ready')).toBeTruthy();
  });

  it('waits on the loading screen during the first check, then opens Home once access verifies', async () => {
    mockLock = 'checking';
    const navigation = await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByLabelText('Loading JustGO')).toBeTruthy();
    expect(screen.queryByText('Home ready')).toBeNull();
    expect(screen.queryByText('Locked ready')).toBeNull();
    await setLock('open');
    expect(await screen.findByText('Home ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/');
  });

  it('leaves the locked screen for Home once a purchase verifies', async () => {
    mockLock = 'locked';
    const navigation = await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Locked ready')).toBeTruthy();
    await setLock('open');
    expect(await screen.findByText('Home ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/');
    await act(() => router.push('/locked'));
    expect(screen.queryByText('Locked ready')).toBeNull();
  });

  it('keeps a locked owner on the locked screen while a later check runs', async () => {
    mockLock = 'locked';
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Locked ready')).toBeTruthy();
    await setLock('checking');
    expect(screen.getByText('Locked ready')).toBeTruthy();
    expect(screen.queryByLabelText('Loading JustGO')).toBeNull();
  });

  it('locks Home when verified access ends', async () => {
    mockLock = 'open';
    const navigation = await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Home ready')).toBeTruthy();
    await setLock('locked');
    expect(await screen.findByText('Locked ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/locked');
  });
});
