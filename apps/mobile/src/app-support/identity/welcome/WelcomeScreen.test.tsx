import { act, fireEvent, render } from '@testing-library/react-native';
import { ManagedIdentityController } from '../auth/managed-controller';
import type { ManagedAuth } from '../auth/types';
import type { ManagedIdentityState } from '../auth/managed-state';
import { createMemoryVault } from '../storage';
import { WelcomeScreen } from './WelcomeScreen';

const mockPush = jest.fn();
const mockBeginEntry = jest.fn();
jest.mock('./WelcomeTransition', () => ({
  useBeginWelcomeEntry: () => mockBeginEntry,
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    useRouter: () => ({ push: mockPush }),
  };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const controllers: ManagedIdentityController[] = [];
beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  for (const controller of controllers) controller.dispose();
  controllers.length = 0;
});

async function setup(deleted = false) {
  let sequence = 1;
  const id = () =>
    `00000000-0000-4000-8000-${(sequence++).toString().padStart(12, '0')}`;
  const vault = createMemoryVault();
  if (deleted)
    await vault.write({
      deviceId: id(),
      selectedId: null,
      session: null,
      pending: null,
      savedKey: null,
      registration: null,
      accountDeleted: true,
    });
  let saved: ManagedIdentityState | null = null;
  const storage = {
    read: jest.fn(async () => saved),
    write: jest.fn(async (value: ManagedIdentityState) => {
      saved = value;
    }),
  };
  const api = {
    request: jest.fn(async () => {
      throw new Error('Welcome must not request a server account');
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
  const controller = new ManagedIdentityController({
    auth,
    api,
    storage,
    legacyVault: vault,
    secureStorage: {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    },
    randomId: id,
  });
  controllers.push(controller);
  await controller.initialize();
  return { controller, api, auth, storage, vault };
}

it.each([false, true])(
  'shows managed sign-in and Continue without recovery controls (previously deleted=%s)',
  async (deleted) => {
    const s = await setup(deleted);
    const screen = render(<WelcomeScreen controller={s.controller} />);
    expect(screen.getByText('JustGO')).toBeTruthy();
    expect(screen.getByText('A little courage.\nEvery day.')).toBeTruthy();
    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.props.accessibilityLabel),
    ).toEqual(['Sign in with Apple', 'Sign in with Google', 'Continue']);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(
      screen.queryByText(/By continuing|recovery key|transfer code/i),
    ).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByText('Your account has been deleted.')).toBeNull();
    expect(s.api.request).not.toHaveBeenCalled();
    expect(mockBeginEntry).not.toHaveBeenCalled();
  },
);

it.each(['Apple', 'Google'] as const)(
  'opens the separate %s sign-in page after beginning entry preparation',
  async (provider) => {
    const s = await setup();
    const screen = render(<WelcomeScreen controller={s.controller} />);
    fireEvent.press(
      screen.getByRole('button', { name: `Sign in with ${provider}` }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/account/sign-in',
      params: { provider: provider.toLowerCase() },
    });
    expect(mockBeginEntry.mock.invocationCallOrder[0]).toBeLessThan(
      Number(mockPush.mock.invocationCallOrder[0]),
    );
    expect(s.api.request).not.toHaveBeenCalled();
  },
);

it('opens acceptance on Continue without changing the saved identity', async () => {
  const s = await setup();
  const before = await s.storage.read();
  const screen = render(<WelcomeScreen controller={s.controller} />);
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith('/acceptance');
  expect(mockBeginEntry).toHaveBeenCalledTimes(1);
  expect(mockBeginEntry.mock.invocationCallOrder[0]).toBeLessThan(
    Number(mockPush.mock.invocationCallOrder[0]),
  );
  expect(await s.storage.read()).toEqual(before);
  expect(s.api.request).not.toHaveBeenCalled();
});

it('leaves Welcome once a guest collection has been selected', async () => {
  const s = await setup();
  await s.controller.continueAsGuest();
  const screen = render(<WelcomeScreen controller={s.controller} />);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(s.api.request).not.toHaveBeenCalled();
});

it('keeps all entry controls disabled while provider sign-in is running', async () => {
  const s = await setup();
  let release!: () => void;
  s.auth.signIn = () =>
    new Promise((resolve) => {
      release = () => resolve(null);
    });
  const screen = render(<WelcomeScreen controller={s.controller} />);
  let operation!: Promise<void>;
  await act(async () => {
    operation = s.controller.signIn('apple');
    await Promise.resolve();
  });
  try {
    for (const name of [
      'Sign in with Apple',
      'Sign in with Google',
      'Continue',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      fireEvent.press(button);
    }
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBeginEntry).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      release();
      await operation;
    });
  }
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(s.api.request).not.toHaveBeenCalled();
});

it('keeps a failed local entry retryable without creating a server account', async () => {
  const s = await setup();
  s.storage.write.mockRejectedValueOnce(new Error('Synthetic disk failure'));
  await s.controller.continueAsGuest();
  const screen = render(<WelcomeScreen controller={s.controller} />);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith('/acceptance');
  expect(s.api.request).not.toHaveBeenCalled();
});
