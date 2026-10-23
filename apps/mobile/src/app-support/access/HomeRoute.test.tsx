import { render } from '@testing-library/react-native';
import HomeRoute from '../../app/(tabs)/index';
let mockVerified = false;
jest.mock('../providers/AppProvider', () => ({
  useAccess: () => ({ verified: mockVerified }),
}));
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
it('keeps a challenge deck unmounted when access is stale or unavailable', () => {
  const screen = render(<HomeRoute />);
  expect(screen.queryByText('Challenge admission')).toBeNull();
  expect(screen.getByText('Fresh access required')).toBeTruthy();
  mockVerified = true;
  screen.rerender(<HomeRoute />);
  expect(screen.getByText('Challenge admission')).toBeTruthy();
});
