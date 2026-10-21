import { act, fireEvent, render, within } from '@testing-library/react-native';
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
  deleteAccount: jest.fn(),
  getSnapshot: () => mockState,
  subscribe: (listener: () => void) => {
    mockIdentityListeners.add(listener);
    return () => mockIdentityListeners.delete(listener);
  },
};
const mockIdentityListeners = new Set<() => void>();
let mockState = {
  account: null as { userId: string } | null,
  linkedProviders: [] as ('apple' | 'google')[],
  initialized: true,
  busy: false,
  hasPending: false,
  message: null as string | null,
  collectionKind: 'guest' as 'guest' | 'account',
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
};
jest.mock('../welcome/welcome-artwork', () => ({
  preloadWelcomeArtwork: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../providers/AppProvider', () => ({
  useIdentity: () => mockState,
  useRuntime: () => ({ identity: mockIdentity }),
}));
jest.mock('../../../platform/motion/motion', () => ({
  useReduceMotion: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => () => void) =>
      React.useEffect(effect, [effect]),
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity.deleteAccount.mockResolvedValue(undefined);
  mockIdentity.retry.mockResolvedValue(undefined);
  mockState = {
    account: null,
    linkedProviders: [],
    initialized: true,
    busy: false,
    hasPending: false,
    message: null,
    collectionKind: 'guest',
    deletionStatus: null,
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
  expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Delete account' })).toBeNull();
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
  expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled();
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

it('opens account deletion directly in the shared modal and cancels without navigating or deleting', () => {
  mockState.account = { userId: 'owner' };
  const screen = render(<ManagedAccountScreen />);
  expect(screen.queryByLabelText('Delete your account?')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  const dialog = within(screen.getByLabelText('Delete your account?'));
  expect(
    dialog.getByText(/does not cancel an App Store subscription/),
  ).toBeTruthy();
  expect(screen.queryByText('Continue to deletion')).toBeNull();
  expect(mockIdentity.deleteAccount).not.toHaveBeenCalled();
  expect(mockRouter.push).not.toHaveBeenCalled();
  fireEvent.press(dialog.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Delete your account?')).toBeNull();
  expect(screen.getByRole('button', { name: 'Delete account' })).toBeEnabled();
  expect(mockIdentity.deleteAccount).not.toHaveBeenCalled();
});

it('confirms deletion from Account and keeps a failure inside its modal', async () => {
  mockState.account = { userId: 'owner' };
  const message = 'Couldn’t finish deleting your account. Please try again.';
  mockIdentity.deleteAccount.mockImplementationOnce(async () => {
    mockState.message = message;
  });
  const screen = render(<ManagedAccountScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  const dialog = within(screen.getByLabelText('Delete your account?'));
  await act(async () =>
    fireEvent.press(dialog.getByRole('button', { name: 'Delete' })),
  );
  expect(mockIdentity.deleteAccount).toHaveBeenCalledTimes(1);
  expect(dialog.getByRole('alert')).toHaveTextContent(message);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('keeps a pending deletion available after the authenticated account is cleared', async () => {
  mockState.deletionStatus = 'cleanup';
  mockState.hasPending = true;
  mockState.message = 'Secure storage is unavailable.';
  const screen = render(<ManagedAccountScreen />);
  let dialog = within(screen.getByLabelText('Delete your account?'));
  expect(
    dialog.getByText(/Finish clearing this phone’s account data/),
  ).toBeTruthy();
  fireEvent.press(dialog.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Delete your account?')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry connection' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  expect(screen.getByRole('switch', { name: 'Apple' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  dialog = within(screen.getByLabelText('Delete your account?'));
  await act(async () =>
    fireEvent.press(dialog.getByRole('button', { name: 'Delete' })),
  );
  expect(mockIdentity.retry).toHaveBeenCalledTimes(1);
  expect(mockIdentity.deleteAccount).not.toHaveBeenCalled();
});

it('closes a confirmation when the selected account changes', () => {
  mockState.account = { userId: 'owner' };
  const screen = render(<ManagedAccountScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  mockState.account = { userId: 'other-owner' };
  act(() => mockIdentityListeners.forEach((listener) => listener()));
  screen.rerender(<ManagedAccountScreen />);
  expect(screen.queryByLabelText('Delete your account?')).toBeNull();
  expect(mockIdentity.deleteAccount).not.toHaveBeenCalled();
});
