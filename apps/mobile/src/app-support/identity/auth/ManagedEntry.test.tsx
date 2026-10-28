import { act, fireEvent, render } from '@testing-library/react-native';
import { ManagedIdentityController } from './managed-controller';
import { createMemoryVault } from '../storage';
import {
  managedIdentityStateSchema,
  type ManagedIdentityState,
} from './managed-state';
import { ProviderAuthError, type ManagedAuth } from './types';
import { WelcomeScreen } from '../welcome/WelcomeScreen';
import { AcceptanceScreen } from '../../acceptance/AcceptanceScreen';
import { ProviderSignInScreen } from '../account/ProviderSignInScreen';
import AuthCallbackRoute from '../../../app/auth/callback';

let mockController: ManagedIdentityController;
let mockProvider = 'apple';
let mockFocused = true;
const mockAccess = { verified: false, isPending: true, isFetching: true };
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => false,
};
const mockBegin = jest.fn();
const mockCancelEntry = jest.fn();
jest.mock('../../providers/AppProvider', () => ({
  useRuntime: () => ({ identity: mockController }),
  useAccess: () => mockAccess,
  useJournal: () => null,
  useIdentity: () => {
    const React = require('react') as typeof import('react');
    return React.useSyncExternalStore(
      mockController.subscribe,
      mockController.getSnapshot,
      mockController.getSnapshot,
    );
  },
}));
jest.mock('../welcome/WelcomeTransition', () => ({
  useBeginWelcomeEntry: () => mockBegin,
  useWelcomeTransition: () => false,
  useCancelWelcomeEntry: () => mockCancelEntry,
}));
jest.mock('../../../lib/legal-links', () => ({
  getLegalLinks: () => ({
    terms: 'https://justgo.example/terms',
    privacy: 'https://justgo.example/privacy',
  }),
}));
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    useRouter: () => mockRouter,
    useIsFocused: () => mockFocused,
    useLocalSearchParams: () => ({ provider: mockProvider }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = mockFocused;
      React.useEffect(() => {
        if (focused) return effect();
      }, [effect, focused]);
    },
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
async function setup(parkedOwner?: string) {
  let state: ManagedIdentityState | null = parkedOwner
    ? managedIdentityStateSchema.parse({
        version: 1,
        deviceId: '10000000-0000-4000-8000-000000000002',
        guestId: '10000000-0000-4000-8000-000000000001',
        collection: { kind: 'account', id: parkedOwner },
        mode: 'signed-out',
        account: null,
        pendingSignIn: null,
        logoutPending: false,
        deletion: null,
        deleted: false,
      })
    : null;
  const api = {
    request: jest.fn(async () => {
      throw new Error('Unexpected API request');
    }),
  };
  const auth: ManagedAuth = {
    initialize: async () => null,
    signIn: async () => null,
    linkIdentity: async () => null,
    unlinkIdentity: async () => {
      throw new Error('No provider session');
    },
    refresh: async () => null,
    signOut: async () => {},
    setActive: () => {},
    subscribe: () => () => {},
    dispose: () => {},
  };
  let id = 1;
  mockController = new ManagedIdentityController({
    auth,
    api,
    legacyVault: createMemoryVault(),
    secureStorage: {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    },
    storage: {
      read: async () => state,
      write: async (value) => {
        state = value;
      },
    },
    randomId: () =>
      `10000000-0000-4000-8000-${(id++).toString().padStart(12, '0')}`,
  });
  await mockController.initialize();
  return { api, auth };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockProvider = 'apple';
  mockFocused = true;
});
afterEach(() => mockController?.dispose());

it('places the Apple and Google logo actions above the unchanged Continue button', async () => {
  const ctx = await setup();
  const screen = await render(<WelcomeScreen controller={mockController} />);
  expect(
    screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel),
  ).toEqual(['Sign in with Apple', 'Sign in with Google', 'Continue']);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Sign in with Apple' }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/account/sign-in',
    params: { provider: 'apple' },
  });
  expect(ctx.api.request).not.toHaveBeenCalled();
});
it('opens Terms on Continue and enters durable guest mode without a server account', async () => {
  const ctx = await setup();
  const welcome = await render(<WelcomeScreen controller={mockController} />);
  await fireEvent.press(welcome.getByRole('button', { name: 'Continue' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/acceptance');
  await welcome.unmount();
  const terms = await render(<AcceptanceScreen />);
  await fireEvent.press(terms.getByRole('button', { name: 'Continue' }));
  await terms.findByText('Redirect: /access');
  expect(mockController.getSnapshot()).toMatchObject({
    mode: 'guest',
    account: null,
    collectionKind: 'guest',
  });
  expect(ctx.api.request).not.toHaveBeenCalled();
});
it.each(['apple', 'google'])(
  'discloses automatic phone-data adoption before %s sign-in',
  async (provider) => {
    await setup();
    await mockController.continueAsGuest();
    mockProvider = provider;
    const signIn = jest
      .spyOn(mockController, 'signIn')
      .mockResolvedValue(undefined);
    const screen = await render(<ProviderSignInScreen />);
    expect(
      screen.getByText(
        /Signing in saves your challenge history, feelings and reflections/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Your saved entries on this phone will be included/),
    ).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await act(
      async () =>
        await fireEvent.press(
          screen.getByRole('button', {
            name: `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}`,
          }),
        ),
    );
    expect(signIn).toHaveBeenCalledWith(provider, {});
  },
);

it.each(['apple', 'google'] as const)(
  'keeps %s loading inside its button until native authorization is cancelled',
  async (provider) => {
    const { auth } = await setup();
    let cancel: () => void = () => {};
    auth.signIn = jest.fn(
      () =>
        new Promise<null>((resolve) => {
          cancel = () => resolve(null);
        }),
    );
    mockProvider = provider;
    const label = `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}`;
    const screen = await render(<ProviderSignInScreen />);
    await act(
      async () =>
        await fireEvent.press(screen.getByRole('button', { name: label })),
    );
    expect(
      screen.getByRole('button', { name: label, busy: true }),
    ).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText('Redirect: /access')).toBeNull();
    expect(mockCancelEntry).toHaveBeenCalledTimes(1);
    await act(async () => cancel());
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: label })).toBeEnabled();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  },
);

it.each([
  ['google', 'apple'],
  ['apple', 'google'],
])(
  'does not carry a failed %s sign-in into %s or a later visit',
  async (from, to) => {
    const { auth } = await setup();
    auth.signIn = jest
      .fn()
      .mockRejectedValue(new ProviderAuthError('CONFIGURATION'));
    mockProvider = from;
    const screen = await render(<ProviderSignInScreen />);
    const pressSignIn = async (provider: string) => {
      await act(
        async () =>
          await fireEvent.press(
            screen.getByRole('button', {
              name: `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}`,
            }),
          ),
      );
    };
    await pressSignIn(from);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in isn’t configured in this build yet. You can continue on this phone.',
    );
    mockProvider = to;
    await screen.rerender(<ProviderSignInScreen />);
    expect(screen.queryByRole('alert')).toBeNull();
    await pressSignIn(to);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in isn’t configured in this build yet. You can continue on this phone.',
    );
    mockFocused = false;
    await screen.rerender(<ProviderSignInScreen />);
    mockFocused = true;
    await screen.rerender(<ProviderSignInScreen />);
    expect(screen.queryByRole('alert')).toBeNull();
    auth.signIn = jest.fn().mockResolvedValue(null);
    await pressSignIn(to);
    expect(screen.queryByRole('alert')).toBeNull();
  },
);

it('ignores a late provider failure after leaving the sign-in visit', async () => {
  const { auth } = await setup();
  let rejectSignIn: (error: Error) => void = () => {};
  auth.signIn = jest.fn(
    () =>
      new Promise((_resolve, reject) => {
        rejectSignIn = reject;
      }),
  );
  const screen = await render(<ProviderSignInScreen />);
  await act(
    async () =>
      await fireEvent.press(
        screen.getByRole('button', { name: 'Sign in with Apple' }),
      ),
  );
  mockFocused = false;
  await screen.rerender(<ProviderSignInScreen />);
  await act(async () => rejectSignIn(new ProviderAuthError('CONFIGURATION')));
  mockFocused = true;
  await screen.rerender(<ProviderSignInScreen />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('lets an incomplete web callback restart provider sign-in after a consumed or failed PKCE exchange', async () => {
  await setup();
  const screen = await render(<AuthCallbackRoute />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Sign-in was not completed. Your saved data was kept.',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Back to sign in' }),
  );
  expect(mockRouter.replace).toHaveBeenCalledWith('/account/sign-in');
});
