import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking, type PressableProps } from 'react-native';
import type { ReactElement } from 'react';
import type { LinkProps } from 'expo-router';
import { AcceptanceScreen } from './AcceptanceScreen';

const owner = '00000000-0000-4000-8000-000000000001';
const otherOwner = '00000000-0000-4000-8000-000000000002';
let mockIdentity = {
  initialized: true,
  busy: false,
  account: null as { userId: string } | null,
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
  message: '',
};
let mockReceipt = {
  userId: null as string | null,
  status: 'disconnected' as
    'disconnected' | 'loading' | 'required' | 'error' | 'accepted',
  saving: false,
  message: '',
};
let mockParams: { returnTo?: string; create?: string; from?: string } = {};
let mockLegal = {
  terms: 'https://justgo.example/terms' as string | null,
  privacy: 'https://justgo.example/privacy' as string | null,
  development: false,
};
const mockCreateAcceptedAccount = jest.fn(async () => undefined);
const mockAccept = jest.fn(async () => true);
const mockNavigate = jest.fn();
const mockAccess = jest.fn(() => ({ verified: false, isPending: true }));
const mockRouter = { dismissTo: jest.fn() };
let mockAwaitingPreparation = false;

jest.mock('../identity/welcome/WelcomeTransition', () => ({
  useWelcomeTransition: () => mockAwaitingPreparation,
}));

jest.mock('../providers/AppProvider', () => ({
  useIdentity: () => mockIdentity,
  useAcceptance: () => mockReceipt,
  useAccess: mockAccess,
  useRuntime: () => ({
    identity: {
      getSnapshot: () => mockIdentity,
      createAcceptedAccount: mockCreateAcceptedAccount,
    },
    acceptance: { accept: mockAccept },
  }),
}));
jest.mock('../../lib/legal-links', () => ({ getLegalLinks: () => mockLegal }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => mockRouter,
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    Link: ({ children, asChild, href, onPress, ...props }: LinkProps) =>
      asChild ? (
        React.cloneElement(children as ReactElement<PressableProps>, {
          onPress: (event) => onPress?.(event),
        })
      ) : (
        <Text
          {...props}
          accessibilityRole="link"
          onPress={(event) => {
            onPress?.(event);
            mockNavigate(href);
          }}
        >
          {children}
        </Text>
      ),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAwaitingPreparation = false;
  mockIdentity = {
    initialized: true,
    busy: false,
    account: null,
    deletionStatus: null,
    message: '',
  };
  mockReceipt = {
    userId: null,
    status: 'disconnected',
    saving: false,
    message: '',
  };
  mockParams = {};
  mockLegal = {
    terms: 'https://justgo.example/terms',
    privacy: 'https://justgo.example/privacy',
    development: false,
  };
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

function connect(
  status: typeof mockReceipt.status = 'required',
  userId = owner,
) {
  mockIdentity.account = { userId };
  mockReceipt = { userId, status, saving: false, message: '' };
}

it('only presents the documents on mount and creates an account after explicit I Accept', async () => {
  const screen = render(<AcceptanceScreen />);
  expect(screen.getByRole('header', { name: 'Terms & Privacy' })).toBeTruthy();
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(screen.queryByText('Account & data')).toBeNull();
  expect(screen.queryByText('Account & recovery')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'I Accept' }));
  await waitFor(() =>
    expect(mockCreateAcceptedAccount).toHaveBeenCalledTimes(1),
  );
  expect(mockAccept).not.toHaveBeenCalled();
});

it('accepts for the connected account without replacing it', async () => {
  connect();
  const screen = render(<AcceptanceScreen />);
  expect(mockAccept).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'I Accept' }));
  await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
});

it('reuses the owning account receipt and returns to the public access gate', () => {
  connect('accepted');
  const screen = render(<AcceptanceScreen />);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'I Accept' })).toBeNull();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it('dismisses to the existing recovery hub once rather than replacing it with another hub', () => {
  connect('accepted');
  mockParams = { returnTo: 'recovery' };
  const screen = render(<AcceptanceScreen />);
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/recovery');
  expect(screen.toJSON()).toBeNull();
  screen.rerender(<AcceptanceScreen />);
  expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it('cannot reuse a stale receipt from another account during a recovery change', async () => {
  connect('accepted');
  mockReceipt.userId = otherOwner;
  mockParams = { returnTo: 'recovery' };
  const screen = render(<AcceptanceScreen />);
  expect(screen.queryByText('Redirect: /access')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'I Accept' }));
  await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});

it('hands an accepted account to the public access gate while paid access is still pending', () => {
  connect('accepted');
  // No access query is needed here: the public gate owns pending/paid decisions.
  const screen = render(<AcceptanceScreen />);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
  expect(screen.queryByText('Redirect: /')).toBeNull();
  expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
  expect(mockAccess).not.toHaveBeenCalled();
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it('keeps accepted Terms visible and busy until the native preparation cover is shown', () => {
  connect('accepted');
  mockAwaitingPreparation = true;
  const screen = render(<AcceptanceScreen />);
  expect(screen.getByRole('header', { name: 'Terms & Privacy' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'I Accept' })).toBeDisabled();
  expect(
    screen.getByRole('progressbar', { name: 'Preparing your challenges' }),
  ).toBeTruthy();
  expect(screen.queryByText('Redirect: /access')).toBeNull();
  expect(screen.queryByText('Redirect: /welcome')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'I Accept' }));
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
  mockAwaitingPreparation = false;
  screen.rerender(<AcceptanceScreen />);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
});

it('keeps the current owner while an explicit new-account flow waits for acceptance', async () => {
  connect('accepted');
  mockParams = { create: 'new', from: owner, returnTo: 'recovery' };
  const screen = render(<AcceptanceScreen />);
  expect(screen.getByRole('header', { name: 'Terms & Privacy' })).toBeTruthy();
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockIdentity.account?.userId).toBe(owner);
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'I Accept' }));
  await waitFor(() =>
    expect(mockCreateAcceptedAccount).toHaveBeenCalledTimes(1),
  );
  expect(mockAccept).not.toHaveBeenCalled();
  screen.rerender(<AcceptanceScreen />);
  expect(screen.queryByText('Redirect: /recovery')).toBeNull();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  connect('accepted', otherOwner);
  screen.rerender(<AcceptanceScreen />);
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/recovery');
  expect(screen.toJSON()).toBeNull();
});

it('reuses the newly created account after a route remount instead of prompting another replacement', () => {
  connect('accepted', otherOwner);
  mockParams = { create: 'new', from: owner, returnTo: 'recovery' };
  const screen = render(<AcceptanceScreen />);
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/recovery');
  expect(screen.toJSON()).toBeNull();
  expect(screen.queryByRole('button', { name: 'I Accept' })).toBeNull();
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it.each(['pending', 'cleanup'] as const)(
  'prioritizes %s deletion over an accepted receipt',
  (status) => {
    connect('accepted');
    mockParams = { returnTo: 'recovery' };
    mockIdentity.deletionStatus = status;
    const screen = render(<AcceptanceScreen />);
    expect(screen.getByText('Redirect: /delete-account')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'I Accept' })).toBeNull();
    expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  },
);

it.each([
  'initialization',
  'creation',
  'receipt loading',
  'receipt saving',
] as const)('blocks duplicate acceptance during %s', (pending) => {
  if (pending === 'initialization') mockIdentity.initialized = false;
  if (pending === 'creation') mockIdentity.busy = true;
  if (pending === 'receipt loading') connect('loading');
  if (pending === 'receipt saving') {
    connect();
    mockReceipt.saving = true;
  }
  const screen = render(<AcceptanceScreen />);
  const button = screen.getByRole('button', { name: 'I Accept' });
  expect(button).toBeDisabled();
  expect(screen.getByRole('progressbar')).toBeTruthy();
  fireEvent.press(button);
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it('keeps a failed acceptance retryable without adding account controls', async () => {
  connect('error');
  mockReceipt.message = 'Couldn’t save your acceptance. Please try again.';
  const screen = render(<AcceptanceScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent(mockReceipt.message);
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'I Accept' }));
  await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
});

it('keeps first-use and post-deletion acceptance free of account controls', () => {
  const screen = render(<AcceptanceScreen />);
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  mockIdentity.deletionStatus = 'deleted';
  mockIdentity.message = 'Your account has been deleted.';
  screen.rerender(<AcceptanceScreen />);
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'I Accept' })).toBeEnabled();
});

it('labels development destinations and reports legal failures without exposing native details', async () => {
  mockLegal.development = true;
  jest
    .mocked(Linking.openURL)
    .mockRejectedValueOnce(new Error('private native details'));
  const screen = render(<AcceptanceScreen />);
  expect(
    screen.getByText('Development legal drafts — not final release documents.'),
  ).toBeTruthy();
  const event = { preventDefault: jest.fn() };
  fireEvent.press(
    screen.getByRole('link', { name: 'Terms of Service' }),
    event,
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t open the Terms of Service. Please try again.',
    ),
  );
  expect(Linking.openURL).toHaveBeenCalledWith(mockLegal.terms);
  expect(screen.queryByText(/private native details/)).toBeNull();
  fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }), event);
  await waitFor(() =>
    expect(Linking.openURL).toHaveBeenLastCalledWith(mockLegal.privacy),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(mockCreateAcceptedAccount).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it('reports unconfigured legal links as unavailable while preserving the acceptance page', async () => {
  mockLegal.privacy = null;
  const screen = render(<AcceptanceScreen />);
  fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t open the Privacy Policy. Please try again.',
    ),
  );
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'I Accept' })).toBeEnabled();
});

it('ignores a late legal-link failure after the screen unmounts', async () => {
  let reject!: (reason: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  jest.mocked(Linking.openURL).mockReturnValueOnce(pending);
  const screen = render(<AcceptanceScreen />);
  fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }), {
    preventDefault: jest.fn(),
  });
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  screen.unmount();
  await act(async () => {
    reject(new Error('late native detail'));
    await Promise.resolve();
  });
});
