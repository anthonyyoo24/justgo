import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking, type PressableProps } from 'react-native';
import type { ReactElement } from 'react';
import type { LinkProps } from 'expo-router';
import { AcceptanceScreen } from './AcceptanceScreen';

const owner = '00000000-0000-4000-8000-000000000001';
let mockIdentity = {
  initialized: true,
  needsWelcome: true,
  busy: false,
  account: null as { userId: string } | null,
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
  message: '',
};
let mockLegal = {
  terms: 'https://justgo.example/terms' as string | null,
  privacy: 'https://justgo.example/privacy' as string | null,
  development: false,
};
const mockContinueAsGuest = jest.fn(async () => undefined);
const mockNavigate = jest.fn();
const mockAccess = jest.fn(() => ({ verified: false, isPending: true }));
let mockAwaitingPreparation = false;

jest.mock('../identity/welcome/WelcomeTransition', () => ({
  useWelcomeTransition: () => mockAwaitingPreparation,
}));

jest.mock('../providers/AppProvider', () => ({
  useIdentity: () => mockIdentity,
  useAccess: mockAccess,
  useRuntime: () => ({
    identity: {
      getSnapshot: () => mockIdentity,
      continueAsGuest: mockContinueAsGuest,
    },
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
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    Link: ({
      children,
      asChild,
      href,
      onPress,
      ...props
    }: Omit<LinkProps, 'ref'>) =>
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
    needsWelcome: true,
    busy: false,
    account: null,
    deletionStatus: null,
    message: '',
  };
  mockLegal = {
    terms: 'https://justgo.example/terms',
    privacy: 'https://justgo.example/privacy',
    development: false,
  };
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

function connect(userId = owner) {
  mockIdentity.account = { userId };
  mockIdentity.needsWelcome = false;
}

it('shows direct document links without mutations and enters guest mode only after Continue', async () => {
  const screen = await render(<AcceptanceScreen />);
  expect(screen.getByRole('header', { name: 'Terms & Privacy' })).toBeTruthy();
  expect(mockContinueAsGuest).not.toHaveBeenCalled();
  expect(Linking.openURL).not.toHaveBeenCalled();
  for (const name of ['Terms of Service', 'Privacy Policy']) {
    await fireEvent.press(screen.getByRole('link', { name }), {
      preventDefault: jest.fn(),
    });
  }
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(2));
  expect(mockContinueAsGuest).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(screen.queryByText('Account & data')).toBeNull();
  expect(screen.queryByText('Account & recovery')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(mockContinueAsGuest).toHaveBeenCalledTimes(1));
});

it('sends an existing account through the access gate without changing its collection', async () => {
  connect();
  const screen = await render(<AcceptanceScreen />);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(mockContinueAsGuest).not.toHaveBeenCalled();
  expect(mockAccess).not.toHaveBeenCalled();
});

it('keeps Continue busy until the native deck preparation cover is shown', async () => {
  connect();
  mockAwaitingPreparation = true;
  const screen = await render(<AcceptanceScreen />);
  expect(screen.getByRole('header', { name: 'Terms & Privacy' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(
    screen.getByRole('progressbar', { name: 'Preparing your challenges' }),
  ).toBeTruthy();
  expect(screen.queryByText('Redirect: /access')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockContinueAsGuest).not.toHaveBeenCalled();
  mockAwaitingPreparation = false;
  await screen.rerender(<AcceptanceScreen />);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
});

it.each(['pending', 'cleanup'] as const)(
  'prioritizes %s deletion over navigation and guest entry',
  async (status) => {
    connect();
    mockIdentity.deletionStatus = status;
    const screen = await render(<AcceptanceScreen />);
    expect(screen.getByText('Redirect: /delete-account')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(mockContinueAsGuest).not.toHaveBeenCalled();
  },
);

it.each(['initialization', 'guest entry'] as const)(
  'blocks guest entry during %s',
  async (pending) => {
    if (pending === 'initialization') mockIdentity.initialized = false;
    else mockIdentity.busy = true;
    const screen = await render(<AcceptanceScreen />);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();
    expect(
      screen.getByRole('progressbar', { name: 'Preparing your challenges' }),
    ).toBeTruthy();
    await fireEvent.press(button);
    expect(mockContinueAsGuest).not.toHaveBeenCalled();
  },
);

it('keeps failed guest entry retryable without adding account controls', async () => {
  mockIdentity.message = 'Couldn’t connect. Please try again.';
  const screen = await render(<AcceptanceScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent(mockIdentity.message);
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(mockContinueAsGuest).toHaveBeenCalledTimes(1));
});

it('keeps first-use and post-deletion entry free of account controls', async () => {
  const screen = await render(<AcceptanceScreen />);
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  mockIdentity.deletionStatus = 'deleted';
  mockIdentity.message = 'Your account has been deleted.';
  await screen.rerender(<AcceptanceScreen />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

it('opens development documents without release notices and reports link failures without native details or identity mutations', async () => {
  mockLegal.development = true;
  jest
    .mocked(Linking.openURL)
    .mockRejectedValueOnce(new Error('private native details'));
  const screen = await render(<AcceptanceScreen />);
  expect(
    screen.queryByText(/Development legal drafts|not final release documents/i),
  ).toBeNull();
  await fireEvent.press(
    screen.getByRole('link', { name: 'Terms of Service' }),
    {
      preventDefault: jest.fn(),
    },
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t open the Terms of Service. Please try again.',
    ),
  );
  expect(screen.queryByText(/private native details/)).toBeNull();
  await fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }), {
    preventDefault: jest.fn(),
  });
  await waitFor(() =>
    expect(Linking.openURL).toHaveBeenLastCalledWith(mockLegal.privacy),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(mockContinueAsGuest).not.toHaveBeenCalled();
});

it('reports an unavailable document while preserving Continue', async () => {
  mockLegal.privacy = null;
  const screen = await render(<AcceptanceScreen />);
  await fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t open the Privacy Policy. Please try again.',
    ),
  );
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(mockContinueAsGuest).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

it('clears an earlier document error before guest entry and preserves entry failures', async () => {
  mockLegal.terms = null;
  const screen = await render(<AcceptanceScreen />);
  await fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t open the Terms of Service. Please try again.',
    ),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(mockContinueAsGuest).toHaveBeenCalledTimes(1);
  mockIdentity.message = 'Couldn’t connect. Please try again.';
  await screen.rerender(<AcceptanceScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent(mockIdentity.message);
});

it.each(['guest entry', 'another document'] as const)(
  'ignores an earlier document failure after starting %s',
  async (nextAction) => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
    jest.mocked(Linking.openURL).mockReturnValueOnce(pending);
    const screen = await render(<AcceptanceScreen />);
    await fireEvent.press(
      screen.getByRole('link', { name: 'Terms of Service' }),
      {
        preventDefault: jest.fn(),
      },
    );
    if (nextAction === 'guest entry') {
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      mockIdentity.message = 'Couldn’t connect. Please try again.';
      await screen.rerender(<AcceptanceScreen />);
    } else {
      await fireEvent.press(
        screen.getByRole('link', { name: 'Privacy Policy' }),
        {
          preventDefault: jest.fn(),
        },
      );
      await waitFor(() =>
        expect(Linking.openURL).toHaveBeenLastCalledWith(mockLegal.privacy),
      );
    }
    await act(async () => {
      reject(new Error('late native detail'));
      await Promise.resolve();
    });
    if (nextAction === 'guest entry')
      expect(screen.getByRole('alert')).toHaveTextContent(mockIdentity.message);
    else expect(screen.queryByRole('alert')).toBeNull();
  },
);

it('ignores a late document failure after the screen unmounts', async () => {
  let reject!: (reason: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  jest.mocked(Linking.openURL).mockReturnValueOnce(pending);
  const screen = await render(<AcceptanceScreen />);
  await fireEvent.press(
    screen.getByRole('link', { name: 'Terms of Service' }),
    {
      preventDefault: jest.fn(),
    },
  );
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  await screen.unmount();
  await act(async () => {
    reject(new Error('late native detail'));
    await Promise.resolve();
  });
});
