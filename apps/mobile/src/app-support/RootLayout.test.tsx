import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import RootLayout, { ErrorBoundary } from '../app/_layout';
import { RouteErrorScreen } from './fallbacks/RouteErrorScreen';

let mockIdentity = {
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
  busy: false,
  account: null as { userId: string } | null,
};
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
  useRuntime: () => ({ challenges: { refresh: mockRefreshChallenges } }),
}));
jest.mock('./identity/welcome/WelcomePreparationCover', () => ({
  WelcomePreparationCover: ({ onShow }: { onShow: () => void }) => {
    const { View } = require('react-native') as typeof import('react-native');
    return <View testID="welcome-cover" onLayout={onShow} />;
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
  mockIdentity = { deletionStatus: null, busy: false, account: null };
  mockVerified = true;
  mockPending = false;
});

it('uses the retryable crash screen as the root error boundary', () => {
  expect(ErrorBoundary).toBe(RouteErrorScreen);
});

it('keeps swipe-back disabled on the bottom-exit-only Reflection route', () => {
  render(<RootLayout />);
  expect(mockStackScreenOptions.get('(challenge)/reflection')).toMatchObject({
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
    mockIdentity = { deletionStatus: 'deleted', busy, account: null };
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
  mockIdentity = { deletionStatus: null, busy: false, account: null };
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
    mockIdentity = { deletionStatus, busy: false, account: null };
    const screen = render(<RootLayout />);
    expect(screen.getByText('delete-account')).toBeTruthy();
    expect(screen.queryByText('welcome')).toBeNull();
    expect(screen.queryByText('(tabs)')).toBeNull();
    expect(screen.queryByText('(challenge)/challenge')).toBeNull();
  },
);

it('retains the welcome route and background through replacement access loading', () => {
  mockIdentity = { deletionStatus: 'deleted', busy: false, account: null };
  const screen = render(<RootLayout />);
  mockIdentity = {
    deletionStatus: null,
    busy: false,
    account: { userId: 'replacement' },
  };
  mockVerified = false;
  mockPending = true;
  screen.rerender(<RootLayout />);
  expect(
    screen.getByText('welcome', { includeHiddenElements: true }),
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
    backgroundColor: '#122E45',
  });
  mockVerified = true;
  mockPending = false;
  screen.rerender(<RootLayout />);
  expect(
    screen.getByText('welcome', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(
    screen.queryByText('(tabs)', { includeHiddenElements: true }),
  ).toBeNull();
  fireEvent(screen.getByTestId('welcome-cover'), 'layout');
  expect(
    screen.queryByText('welcome', { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    screen.getByText('(tabs)', { includeHiddenElements: true }),
  ).toBeTruthy();
  // The destination mounts under the visible cover before it can be revealed.
  expect(screen.queryByText('(tabs)')).toBeNull();
  expect(screen.getByTestId('welcome-cover')).toBeTruthy();
});
