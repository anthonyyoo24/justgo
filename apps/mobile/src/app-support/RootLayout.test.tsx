import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';
import RootLayout, { ErrorBoundary } from '../app/_layout';

let mockIdentity = {
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
  busy: false,
  account: { userId: 'existing-account' } as { userId: string } | null,
  needsWelcome: false,
};
let mockVerified = true;
let mockPending = false;
const mockRefreshChallenges = jest.fn(async () => {});
const mockStackScreenOptions = new Map<string, unknown>();
let mockFontsLoaded = true;
let mockFontError: Error | null = null;
let mockInitialized = true;
let mockJournalOwner: string | null = 'existing-account';
let mockJournalReady = true;
let mockJournalError: string | null = null;
let mockMotionLoading = false;
let mockHapticsLoading = false;
const mockFontMap = jest.fn();
jest.mock('expo-font', () => ({
  useFonts: (fonts: unknown) => {
    mockFontMap(fonts);
    return [mockFontsLoaded, mockFontError];
  },
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => {}),
}));
jest.mock('./diagnostics/start', () => ({
  errorReporter: { capture: jest.fn() },
}));
jest.mock('../platform/motion/motion', () => ({
  useMotionPreferences: () => ({ loading: mockMotionLoading }),
}));
jest.mock('../platform/haptics/haptics', () => ({
  useHapticPreferences: () => ({ loading: mockHapticsLoading }),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./providers/AppProvider', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => children,
  useIdentity: () => ({ ...mockIdentity, initialized: mockInitialized }),
  useActivityState: () => ({
    repository: mockJournalOwner ? { accountId: mockJournalOwner } : null,
    state: mockJournalOwner
      ? { ready: mockJournalReady, hydrationError: mockJournalError }
      : null,
  }),
  useAccess: () => ({ verified: mockVerified, isPending: mockPending }),
  useRuntime: () => ({ challenges: { refresh: mockRefreshChallenges } }),
}));
const heldWhileRootLoaded = jest.mocked(preventAutoHideAsync).mock.calls.length;
jest.mock('./acceptance/AcceptancePreparationCover', () => ({
  AcceptancePreparationCover: ({ onShow }: { onShow: () => void }) => {
    const { View } = require('react-native') as typeof import('react-native');
    return <View testID="acceptance-cover" onLayout={onShow} />;
  },
}));
jest.mock('./saving/SavingFeedback', () => ({
  SavingFeedbackShell: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../features/challenges/active/ChallengeActivityProvider', () => ({
  ChallengeActivityProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
jest.mock('../platform/motion/MotionPreferencesProvider', () => ({
  MotionPreferencesProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
jest.mock('../platform/haptics/HapticsPreferencesProvider', () => ({
  HapticsPreferencesProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
jest.mock('expo-router', () => {
  const { Text, View } =
    require('react-native') as typeof import('react-native');
  return {
    Stack: Object.assign(
      ({
        children,
        screenOptions,
      }: {
        children: ReactNode;
        screenOptions: { contentStyle: { backgroundColor: string } };
      }) => (
        <View testID="navigation" style={screenOptions.contentStyle}>
          {children}
        </View>
      ),
      {
        Screen: ({ name, options }: { name: string; options?: unknown }) => {
          mockStackScreenOptions.set(name, options);
          return <Text>{name}</Text>;
        },
        Protected: ({
          guard,
          children,
        }: {
          guard: boolean;
          children: ReactNode;
        }) => (guard ? children : null),
      },
    ),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockStackScreenOptions.clear();
  mockIdentity = {
    deletionStatus: null,
    busy: false,
    account: { userId: 'existing-account' },
    needsWelcome: false,
  };
  mockVerified = true;
  mockPending = false;
  mockFontsLoaded = true;
  mockFontError = null;
  mockInitialized = true;
  mockJournalOwner = 'existing-account';
  mockJournalReady = true;
  mockJournalError = null;
  mockMotionLoading = false;
  mockHapticsLoading = false;
});
afterEach(() => jest.restoreAllMocks());

it('keeps the branded loading screen until fonts are ready', async () => {
  mockFontsLoaded = false;
  const screen = await render(<RootLayout />);
  expect(
    screen.getByRole('progressbar', { name: 'Loading JustGO' }),
  ).toBeTruthy();
  expect(screen.queryByTestId('navigation')).toBeNull();
  expect(hideAsync).not.toHaveBeenCalled();
  mockFontsLoaded = true;
  await screen.rerender(<RootLayout />);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByTestId('navigation')).toBeTruthy();
  expect(hideAsync).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
  expect(hideAsync).toHaveBeenCalledTimes(1);
  expect(mockFontMap).toHaveBeenCalledWith({
    Inter_400Regular: expect.anything(),
    Inter_500Medium: expect.anything(),
    Inter_600SemiBold: expect.anything(),
  });
});

it('leaves loading for a font error so launch cannot get stuck behind the logo', async () => {
  mockFontsLoaded = false;
  mockFontError = new Error('font unavailable');
  const screen = await render(<RootLayout />);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The app’s fonts couldn’t load. Please reopen JustGO.',
  );
  expect(hideAsync).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
  expect(hideAsync).toHaveBeenCalledTimes(1);
});

it('holds native splash at module load and exposes the retryable root error boundary after layout', async () => {
  expect(heldWhileRootLoaded).toBe(1);
  const retry = jest.fn(async () => {});
  const screen = await render(
    <ErrorBoundary
      error={new Error('Synthetic startup failure')}
      retry={retry}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'JustGO couldn’t show this screen. Try again, or close and reopen the app.',
  );
  expect(hideAsync).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
  expect(hideAsync).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it('keeps native launch covered until identity, its own journal and both preference providers settle', async () => {
  mockInitialized = false;
  mockJournalOwner = 'previous-account';
  mockJournalReady = false;
  mockMotionLoading = true;
  mockHapticsLoading = true;
  const screen = await render(<RootLayout />);
  await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
  expect(
    screen.getByRole('progressbar', { name: 'Loading saved data' }),
  ).toBeTruthy();
  expect(hideAsync).not.toHaveBeenCalled();
  mockInitialized = true;
  await screen.rerender(<RootLayout />);
  expect(hideAsync).not.toHaveBeenCalled();
  mockJournalReady = true;
  await screen.rerender(<RootLayout />);
  expect(hideAsync).not.toHaveBeenCalled();
  mockJournalOwner = 'existing-account';
  await screen.rerender(<RootLayout />);
  expect(hideAsync).not.toHaveBeenCalled();
  mockMotionLoading = false;
  await screen.rerender(<RootLayout />);
  expect(hideAsync).not.toHaveBeenCalled();
  mockHapticsLoading = false;
  await screen.rerender(<RootLayout />);
  expect(hideAsync).toHaveBeenCalledTimes(1);
  await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
  await screen.rerender(<RootLayout />);
  expect(hideAsync).toHaveBeenCalledTimes(1);
});

it('releases to recovery after a local hydration error and does not add a native surface on web', async () => {
  mockJournalReady = false;
  mockJournalError = 'unreadable';
  const screen = await render(<RootLayout />);
  await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
  expect(hideAsync).toHaveBeenCalledTimes(1);
  await screen.unmount();
  jest.replaceProperty(Platform, 'OS', 'web');
  jest.mocked(hideAsync).mockClear();
  const web = await render(<RootLayout />);
  expect(web.getByTestId('navigation')).toBeTruthy();
  expect(web.queryByTestId('native-startup-surface')).toBeNull();
  expect(hideAsync).not.toHaveBeenCalled();
});

it.each([
  '(challenge)/challenge',
  '(challenge)/success',
  '(challenge)/reflection',
])(
  'keeps swipe-back disabled on the explicit-action-only %s route',
  async (name) => {
    await render(<RootLayout />);
    expect(mockStackScreenOptions.get(name)).toMatchObject({
      gestureEnabled: false,
    });
  },
);

it('removes old account routes after deletion and keeps them removed through replacement loading or failure', async () => {
  const screen = await render(<RootLayout />);
  expect(screen.getByTestId('navigation')).toHaveStyle({
    backgroundColor: '#F9EFE8',
  });
  expect(screen.getByText('settings')).toBeTruthy();
  expect(screen.getByText('(tabs)')).toBeTruthy();
  expect(screen.queryByText('welcome')).toBeNull();
  for (const busy of [false, true, false]) {
    mockIdentity = {
      deletionStatus: 'deleted',
      busy,
      account: null,
      needsWelcome: false,
    };
    await screen.rerender(<RootLayout />);
    expect(screen.getByTestId('navigation')).toHaveStyle({
      backgroundColor: '#122E45',
    });
    expect(screen.getByText('access')).toBeTruthy();
    expect(screen.getByText('welcome')).toBeTruthy();
    for (const name of [
      'settings',
      'delete-account',
      'recovery',
      'account/recover',
      'account/keys',
      'account/devices',
      'account/transfer',
      'account/troubleshooting',
      '(tabs)',
      '(challenge)/challenge',
      '(challenge)/success',
      '(challenge)/reflection',
      'preview',
    ])
      expect(screen.queryByText(name)).toBeNull();
  }
  mockIdentity = {
    deletionStatus: null,
    busy: false,
    account: null,
    needsWelcome: false,
  };
  mockVerified = false;
  await screen.rerender(<RootLayout />);
  expect(screen.queryByText('welcome')).toBeNull();
  expect(screen.getByText('settings')).toBeTruthy();
  expect(screen.queryByText('(tabs)')).toBeNull();
  mockIdentity.account = { userId: 'replacement' };
  mockVerified = true;
  await screen.rerender(<RootLayout />);
  expect(screen.getByText('(tabs)')).toBeTruthy();
});

it.each(['pending', 'cleanup'] as const)(
  'keeps %s cleanup available while closing product routes despite a stale access result',
  async (deletionStatus) => {
    mockIdentity = {
      deletionStatus,
      busy: false,
      account: null,
      needsWelcome: false,
    };
    const screen = await render(<RootLayout />);
    expect(screen.getByText('delete-account')).toBeTruthy();
    expect(screen.queryByText('welcome')).toBeNull();
    expect(screen.queryByText('(tabs)')).toBeNull();
    expect(screen.queryByText('(challenge)/challenge')).toBeNull();
  },
);

it('removes Welcome immediately after creation while Terms covers the destination until native onShow', async () => {
  mockIdentity = {
    deletionStatus: 'deleted',
    busy: false,
    account: null,
    needsWelcome: false,
  };
  const screen = await render(<RootLayout />);
  mockIdentity = {
    deletionStatus: null,
    busy: false,
    account: { userId: 'replacement' },
    needsWelcome: false,
  };
  mockVerified = false;
  mockPending = true;
  await screen.rerender(<RootLayout />);
  expect(
    screen.queryByText('welcome', { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    screen.getByText('acceptance', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(
    screen.queryByText('settings', { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    screen.queryByText('(tabs)', { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    screen.getByTestId('navigation', { includeHiddenElements: true }),
  ).toHaveStyle({
    backgroundColor: '#F9EFE8',
  });
  mockVerified = true;
  mockPending = false;
  await screen.rerender(<RootLayout />);
  expect(
    screen.queryByText('welcome', { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    screen.queryByText('(tabs)', { includeHiddenElements: true }),
  ).toBeNull();
  await fireEvent(screen.getByTestId('acceptance-cover'), 'layout');
  expect(
    screen.queryByText('welcome', { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    screen.getByText('(tabs)', { includeHiddenElements: true }),
  ).toBeTruthy();
  // The destination mounts under the visible cover before it can be revealed.
  expect(screen.queryByText('(tabs)')).toBeNull();
  expect(screen.getByTestId('acceptance-cover')).toBeTruthy();
});

it('keeps verified existing accounts in the product without a legal receipt guard', async () => {
  mockIdentity.account = { userId: 'existing-account' };
  const screen = await render(<RootLayout />);
  for (const name of [
    'settings',
    'recovery',
    'delete-account',
    '(tabs)',
    '(challenge)/challenge',
  ])
    expect(screen.getByText(name)).toBeTruthy();
});

it('offers welcome and Terms on a new installation despite stale verified access', async () => {
  mockIdentity.account = null;
  mockIdentity.needsWelcome = true;
  const screen = await render(<RootLayout />);
  expect(screen.getByText('welcome')).toBeTruthy();
  expect(screen.getByText('acceptance')).toBeTruthy();
  expect(screen.queryByText('(tabs)')).toBeNull();
  expect(screen.getByTestId('navigation')).toHaveStyle({
    backgroundColor: '#122E45',
  });
});
