import { act, fireEvent, render } from '@testing-library/react-native';
import { ManagedAccountScreen } from './ManagedAccountScreen';
import { ProviderLogo } from '../../../components/auth/ProviderLogo';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  canGoBack: () => false,
};
const mockIdentity = {
  signIn: jest.fn(),
  signOut: jest.fn(),
  linkProvider: jest.fn(),
  unlinkProvider: jest.fn(),
  retry: jest.fn(),
};
let mockState = {
  account: null as { userId: string } | null,
  linkedProviders: [] as ('apple' | 'google')[],
  initialized: true,
  busy: false,
  hasPending: false,
  message: null as string | null,
  collectionKind: 'guest' as 'guest' | 'account',
};
jest.mock('../../providers/AppProvider', () => ({
  useIdentity: () => mockState,
  useRuntime: () => ({ identity: mockIdentity }),
}));
jest.mock('../../../platform/motion/motion', () => ({
  useReduceMotion: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    account: null,
    linkedProviders: [],
    initialized: true,
    busy: false,
    hasPending: false,
    message: null,
    collectionKind: 'guest',
  };
});

it('shows two branded login switches while signed out without a separate guest or status section', () => {
  mockState.collectionKind = 'account';
  mockState.linkedProviders = ['google']; // Retained metadata never implies a current login.
  const screen = render(<ManagedAccountScreen />);
  expect(screen.getByRole('header', { name: 'Login methods' })).toBeTruthy();
  for (const label of ['Apple', 'Google']) {
    expect(screen.getByRole('switch', { name: label })).toHaveProp(
      'accessibilityState',
      {
        checked: false,
        disabled: false,
        busy: false,
      },
    );
  }
  expect(
    screen.UNSAFE_getAllByType(ProviderLogo).map((logo) => logo.props.provider),
  ).toEqual(['apple', 'google']);
  for (const text of [
    'Signed in',
    'On this phone',
    'View guest data',
    'Link Apple',
    'Link Google',
    'Log out',
    'Delete account',
  ]) {
    expect(screen.queryByText(text)).toBeNull();
  }
  fireEvent.press(screen.getByRole('switch', { name: 'Google' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/account/sign-in',
    params: { provider: 'google' },
  });
  expect(mockIdentity.linkProvider).not.toHaveBeenCalled();
});

it('reflects verified connections and delegates connect/disconnect without optimistic status changes', () => {
  mockState.account = { userId: 'owner' };
  mockState.linkedProviders = ['google'];
  const screen = render(<ManagedAccountScreen />);
  expect(screen.getByRole('switch', { name: 'Apple' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
  expect(screen.getByRole('switch', { name: 'Google' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
  fireEvent.press(screen.getByRole('switch', { name: 'Apple' }));
  fireEvent.press(screen.getByRole('switch', { name: 'Google' }));
  expect(mockIdentity.linkProvider).toHaveBeenCalledWith('apple');
  expect(mockIdentity.unlinkProvider).toHaveBeenCalledWith('google');
  expect(screen.getByRole('switch', { name: 'Apple' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
  expect(screen.getByRole('switch', { name: 'Google' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
  mockState.linkedProviders = ['google', 'apple'];
  screen.rerender(<ManagedAccountScreen />);
  expect(screen.getByRole('switch', { name: 'Apple' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
});

it('shows separate logout and red deletion actions, preserving explicit logout confirmation', () => {
  mockState.account = { userId: 'owner' };
  mockState.linkedProviders = ['apple'];
  const screen = render(<ManagedAccountScreen />);
  expect(screen.getByRole('link', { name: 'Delete account' })).toBeTruthy();
  expect(screen.getByText('Delete account')).toHaveStyle({ color: '#B3261E' });
  fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
  expect(mockIdentity.signOut).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(mockIdentity.signOut).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
  fireEvent.press(screen.getByRole('button', { name: 'Confirm log out' }));
  expect(mockIdentity.signOut).toHaveBeenCalledTimes(1);
});

it('disables operations while busy and keeps failure/last-method feedback contextual', () => {
  mockState.account = { userId: 'owner' };
  mockState.linkedProviders = ['apple'];
  mockState.busy = true;
  const screen = render(<ManagedAccountScreen />);
  fireEvent.press(screen.getByRole('switch', { name: 'Google' }));
  expect(mockIdentity.linkProvider).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Delete account' })).toBeDisabled();
  mockState.busy = false;
  mockState.message =
    'Keep one login method connected. Use Log out to end this session.';
  mockState.hasPending = true;
  screen.rerender(<ManagedAccountScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent(mockState.message);
  act(() =>
    fireEvent.press(screen.getByRole('button', { name: 'Retry connection' })),
  );
  expect(mockIdentity.retry).toHaveBeenCalledTimes(1);
});
