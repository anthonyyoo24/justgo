import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import RootLayout from '../app/_layout';

let mockIdentity = {
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
  busy: false,
};
let mockVerified = true;
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./providers/AppProvider', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => children,
  useIdentity: () => mockIdentity,
  useAccess: () => ({ verified: mockVerified }),
}));
jest.mock('./saving/SavingFeedback', () => ({
  SavingFeedbackShell: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../features/challenges/ChallengeActivityProvider', () => ({
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
        Screen: ({ name }: { name: string }) => <Text>{name}</Text>,
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
  mockIdentity = { deletionStatus: null, busy: false };
  mockVerified = true;
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
    mockIdentity = { deletionStatus: 'deleted', busy };
    screen.rerender(<RootLayout />);
    expect(screen.getByTestId('navigation')).toHaveStyle({
      backgroundColor: '#122E45',
    });
    expect(screen.getByText('index')).toBeTruthy();
    expect(screen.getByText('welcome')).toBeTruthy();
    for (const name of [
      'settings',
      'export-data',
      'delete-account',
      'recovery',
      'account/[tool]',
      '(tabs)',
      'challenge',
      'success',
      'reflection',
      'preview',
    ])
      expect(screen.queryByText(name)).toBeNull();
  }
  mockIdentity = { deletionStatus: null, busy: false };
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
    mockIdentity = { deletionStatus, busy: false };
    const screen = render(<RootLayout />);
    expect(screen.getByText('delete-account')).toBeTruthy();
    expect(screen.queryByText('welcome')).toBeNull();
    expect(screen.queryByText('(tabs)')).toBeNull();
    expect(screen.queryByText('challenge')).toBeNull();
  },
);
