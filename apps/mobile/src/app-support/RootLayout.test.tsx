import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import RootLayout, { ErrorBoundary } from '../app/_layout';
import { RouteErrorScreen } from './fallbacks/RouteErrorScreen';

let mockIdentity = {
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
  busy: false,
  account: null as { userId: string } | null,
  needsWelcome: false,
};
let mockAcceptanceStatus:
  'accepted' | 'loading' | 'required' | 'error' | 'disconnected' = 'accepted';
let mockVerified = true;
let mockPending = false;
const mockRefreshChallenges = jest.fn(async () => {});
const mockStackScreenOptions = new Map<string, unknown>();
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./providers/AppProvider', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => children,
  useIdentity: () => mockIdentity,
  useAccess: () => ({ verified: mockVerified, isPending: mockPending }),
  useAcceptance: () => ({ status: mockAcceptanceStatus }),
  useRuntime: () => ({ challenges: { refresh: mockRefreshChallenges } }),
}));
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
  mockStackScreenOptions.clear();
  mockIdentity = {
    deletionStatus: null,
    busy: false,
    account: null,
    needsWelcome: false,
  };
  mockAcceptanceStatus = 'accepted';
  mockVerified = true;
  mockPending = false;
});

it('uses the retryable crash screen as the root error boundary', () => {
  expect(ErrorBoundary).toBe(RouteErrorScreen);
});

it.each([
  '(challenge)/challenge',
  '(challenge)/success',
  '(challenge)/reflection',
])('keeps swipe-back disabled on the explicit-action-only %s route', (name) => {
  render(<RootLayout />);
  expect(mockStackScreenOptions.get(name)).toMatchObject({
    gestureEnabled: false,
  });
});

it('removes old account routes after deletion and keeps them removed through replacement loading or failure', () => {
  const screen = render(<RootLayout />);
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
    screen.rerender(<RootLayout />);
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
  screen.rerender(<RootLayout />);
  expect(screen.queryByText('welcome')).toBeNull();
  expect(screen.getByText('settings')).toBeTruthy();
  expect(screen.queryByText('(tabs)')).toBeNull();
  mockVerified = true;
  screen.rerender(<RootLayout />);
  expect(screen.getByText('(tabs)')).toBeTruthy();
});

it.each(['pending', 'cleanup'] as const)(
  'keeps %s cleanup available while closing product routes despite a stale access result',
  (deletionStatus) => {
    mockIdentity = {
      deletionStatus,
      busy: false,
      account: null,
      needsWelcome: false,
    };
    const screen = render(<RootLayout />);
    expect(screen.getByText('delete-account')).toBeTruthy();
    expect(screen.queryByText('welcome')).toBeNull();
    expect(screen.queryByText('(tabs)')).toBeNull();
    expect(screen.queryByText('(challenge)/challenge')).toBeNull();
  },
);

it('removes Welcome immediately after creation while Terms covers the destination until native onShow', () => {
  mockIdentity = {
    deletionStatus: 'deleted',
    busy: false,
    account: null,
    needsWelcome: false,
  };
  const screen = render(<RootLayout />);
  mockIdentity = {
    deletionStatus: null,
    busy: false,
    account: { userId: 'replacement' },
    needsWelcome: false,
  };
  mockVerified = false;
  mockPending = true;
  screen.rerender(<RootLayout />);
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
  screen.rerender(<RootLayout />);
  expect(
    screen.queryByText('welcome', { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    screen.queryByText('(tabs)', { includeHiddenElements: true }),
  ).toBeNull();
  fireEvent(screen.getByTestId('acceptance-cover'), 'layout');
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

it.each(['loading', 'required', 'error'] as const)(
  'closes product routes for %s acceptance while retaining account and data tools',
  (status) => {
    mockIdentity.account = { userId: 'existing-account' };
    mockAcceptanceStatus = status;
    const screen = render(<RootLayout />);
    expect(screen.getByText('acceptance')).toBeTruthy();
    for (const name of [
      'settings',
      'recovery',
      'delete-account',
      'account/recover',
      'account/keys',
    ])
      expect(screen.getByText(name)).toBeTruthy();
    for (const name of [
      '(tabs)',
      '(challenge)/challenge',
      '(challenge)/success',
      '(challenge)/reflection',
    ])
      expect(screen.queryByText(name)).toBeNull();
    mockAcceptanceStatus = 'accepted';
    screen.rerender(<RootLayout />);
    expect(screen.getByText('(tabs)')).toBeTruthy();
  },
);

it('offers welcome and acceptance on a new installation before any account exists', () => {
  mockIdentity.needsWelcome = true;
  mockAcceptanceStatus = 'disconnected';
  const screen = render(<RootLayout />);
  expect(screen.getByText('welcome')).toBeTruthy();
  expect(screen.getByText('acceptance')).toBeTruthy();
  expect(screen.queryByText('(tabs)')).toBeNull();
  expect(screen.getByTestId('navigation')).toHaveStyle({
    backgroundColor: '#122E45',
  });
});
