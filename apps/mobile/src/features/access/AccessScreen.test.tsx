import { fireEvent, render } from '@testing-library/react-native';
import { AccessScreen } from './AccessScreen';
import { useAccess, useIdentity } from '../shell/AppProvider';
jest.mock('../shell/AppProvider', () => ({
  useAccess: jest.fn(),
  useIdentity: jest.fn(),
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Link: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
  };
});
const access = useAccess as jest.Mock;
const identity = useIdentity as jest.Mock;
beforeEach(() => {
  identity.mockReturnValue({
    initialized: true,
    busy: false,
    account: { userId: 'a' },
  });
});
it('keeps unavailable access closed and offers retry and recovery without a welcome questionnaire', () => {
  const refetch = jest.fn();
  access.mockReturnValue({
    isPending: false,
    verified: false,
    data: { status: 'unavailable' },
    refetch,
  });
  const screen = render(<AccessScreen />);
  expect(screen.getByText('We can’t verify access yet.')).toBeTruthy();
  expect(screen.getByText('Account & recovery')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Check access again' }));
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
});
it('distinguishes unpaid from unavailable without inventing a purchase action', () => {
  access.mockReturnValue({
    isPending: false,
    verified: false,
    data: { status: 'unpaid' },
    refetch: jest.fn(),
  });
  const screen = render(<AccessScreen />);
  expect(screen.getByText(/Purchases aren’t available/)).toBeTruthy();
  expect(screen.queryByText('We can’t verify access yet.')).toBeNull();
});
it('enters tabs only with verified access and returns to recovery when identity disappears', () => {
  access.mockReturnValue({ verified: true });
  const screen = render(<AccessScreen />);
  expect(screen.getByText('Redirect: /(tabs)')).toBeTruthy();
  identity.mockReturnValue({ initialized: true, busy: false, account: null });
  screen.rerender(<AccessScreen />);
  expect(screen.getByText('Redirect: /recovery')).toBeTruthy();
});
