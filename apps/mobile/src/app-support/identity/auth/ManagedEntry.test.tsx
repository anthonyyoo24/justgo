import { act, fireEvent, render } from '@testing-library/react-native';
import { ManagedIdentityController } from './managed-controller';
import { createMemoryVault } from '../storage';
import {
  managedIdentityStateSchema,
  type ManagedIdentityState,
} from './managed-state';
import type { ManagedAuth } from './types';
import { WelcomeScreen } from '../welcome/WelcomeScreen';
import { AcceptanceScreen } from '../../acceptance/AcceptanceScreen';
import { ProviderSignInScreen } from '../account/ProviderSignInScreen';
import AuthCallbackRoute from '../../../app/auth/callback';

let mockController: ManagedIdentityController;
let mockProvider = 'apple';
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => false,
};
const mockBegin = jest.fn();
jest.mock('../../providers/AppProvider', () => ({
  useRuntime: () => ({ identity: mockController }),
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
}));
jest.mock('../../../lib/legal-links', () => ({
  getLegalLinks: () => ({
    terms: 'https://justgo.example/terms',
    privacy: 'https://justgo.example/privacy',
  }),
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({ provider: mockProvider }),
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
  return { api };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockProvider = 'apple';
});
afterEach(() => mockController?.dispose());

it('places the Apple and Google logo actions above the unchanged Continue button', async () => {
  const ctx = await setup();
  const screen = render(<WelcomeScreen controller={mockController} />);
  expect(
    screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel),
  ).toEqual(['Sign in with Apple', 'Sign in with Google', 'Continue']);
  fireEvent.press(screen.getByRole('button', { name: 'Sign in with Apple' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/account/sign-in',
    params: { provider: 'apple' },
  });
  expect(ctx.api.request).not.toHaveBeenCalled();
});
it('opens Terms on Continue and enters durable guest mode without a server account', async () => {
  const ctx = await setup();
  const welcome = render(<WelcomeScreen controller={mockController} />);
  fireEvent.press(welcome.getByRole('button', { name: 'Continue' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/acceptance');
  welcome.unmount();
  const terms = render(<AcceptanceScreen />);
  fireEvent.press(terms.getByRole('button', { name: 'Continue' }));
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
    const screen = render(<ProviderSignInScreen />);
    expect(
      screen.getByText(
        /Signing in saves your challenge history, feelings and reflections/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Your saved entries on this phone will be included/),
    ).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await act(async () =>
      fireEvent.press(
        screen.getByRole('button', {
          name: `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}`,
        }),
      ),
    );
    expect(signIn).toHaveBeenCalledWith(provider, {});
  },
);

it('lets an incomplete web callback restart provider sign-in after a consumed or failed PKCE exchange', async () => {
  await setup();
  const screen = render(<AuthCallbackRoute />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Sign-in was not completed. Your saved data was kept.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(mockRouter.replace).toHaveBeenCalledWith('/account/sign-in');
});
