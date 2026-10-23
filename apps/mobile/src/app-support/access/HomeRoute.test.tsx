import { render } from '@testing-library/react-native';
import HomeRoute from '../../app/(tabs)/index';
let mockVerified = false;
let mockPending = false;
jest.mock('../providers/AppProvider', () => ({
  useAccess: () => ({ verified: mockVerified, isPending: mockPending }),
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
  };
});
jest.mock('../../features/challenges/ChallengeScreen', () => ({
  ChallengeScreen: () => {
    const { Text } = require('react-native') as typeof import('react-native');
    return <Text>Challenge admission</Text>;
  },
}));
jest.mock('./AccessScreen', () => ({
  AccessScreen: () => {
    const { Text } = require('react-native') as typeof import('react-native');
    return <Text>Fresh access required</Text>;
  },
}));
beforeEach(() => {
  mockVerified = false;
  mockPending = false;
});
it('keeps startup outside the tab scene until access is verified', () => {
  mockPending = true;
  const screen = render(<HomeRoute />);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
  expect(screen.queryByText('Challenge admission')).toBeNull();
  mockVerified = true;
  screen.rerender(<HomeRoute />);
  expect(screen.getByText('Challenge admission')).toBeTruthy();
  expect(screen.queryByText('Redirect: /access')).toBeNull();
});
it('keeps a challenge deck unmounted when access is stale or unavailable', () => {
  const screen = render(<HomeRoute />);
  expect(screen.queryByText('Challenge admission')).toBeNull();
  expect(screen.getByText('Fresh access required')).toBeTruthy();
  mockVerified = true;
  screen.rerender(<HomeRoute />);
  expect(screen.getByText('Challenge admission')).toBeTruthy();
});
