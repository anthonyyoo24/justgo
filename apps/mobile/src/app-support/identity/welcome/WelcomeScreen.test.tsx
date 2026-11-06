import { act, fireEvent, render } from '@testing-library/react-native';
import { ManagedIdentityController } from '../auth/managed-controller';
import { ProviderAuthError, type ManagedAuth } from '../auth/types';
import type { ManagedIdentityState } from '../auth/managed-state';
import { createMemoryVault } from '../storage';
import { WelcomeScreen } from './WelcomeScreen';

const mockPush = jest.fn();
const mockBeginEntry = jest.fn();
const mockCancelEntry = jest.fn();
let mockFocused = true;
const mockHandoff = { destination: null, error: '', retry: jest.fn() };
jest.mock('../account/useSignInHandoff', () => ({
  useSignInHandoff: () => mockHandoff,
}));
jest.mock('./WelcomeTransition', () => ({
  useBeginWelcomeEntry: () => mockBeginEntry,
  useCancelWelcomeEntry: () => mockCancelEntry,
}));
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    useRouter: () => ({ push: mockPush }),
    useIsFocused: () => mockFocused,
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = mockFocused;
      React.useEffect(() => {
        if (focused) return effect();
      }, [effect, focused]);
    },
  };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const controllers: ManagedIdentityController[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockHandoff.error = '';
});
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
    const screen = await render(<WelcomeScreen controller={s.controller} />);
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

it.each([
  ['Apple', false],
  ['Google', false],
  ['Apple', true],
  ['Google', true],
] as const)(
  'starts %s directly from Welcome, including after deletion=%s',
  async (provider, deleted) => {
    const s = await setup(deleted);
    const signIn = jest.spyOn(s.auth, 'signIn');
    const screen = await render(<WelcomeScreen controller={s.controller} />);
    expect(
      screen.getByText(/Signing in saves your challenge history/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Saved entries on this phone are included/),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: `Sign in with ${provider}` }),
    );
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith(provider.toLowerCase());
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBeginEntry).not.toHaveBeenCalled();
    expect(mockCancelEntry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByRole('button', { name: `Sign in with ${provider}` }),
    ).toBeEnabled();
    expect(s.api.request).not.toHaveBeenCalled();
  },
);

it('opens acceptance on Continue without changing the saved identity', async () => {
  const s = await setup();
  const before = await s.storage.read();
  const screen = await render(<WelcomeScreen controller={s.controller} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
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
  const screen = await render(<WelcomeScreen controller={s.controller} />);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(s.api.request).not.toHaveBeenCalled();
});

it.each(['pending', 'cleanup'] as const)(
  'resumes %s deletion before offering Welcome sign-in',
  async (deletionStatus) => {
    const s = await setup();
    const snapshot = { ...s.controller.getSnapshot(), deletionStatus };
    jest.spyOn(s.controller, 'getSnapshot').mockReturnValue(snapshot);
    const screen = await render(<WelcomeScreen controller={s.controller} />);
    expect(screen.getByText('Redirect: /delete-account')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Sign in with Apple' }),
    ).toBeNull();
  },
);

it.each(['Apple', 'Google'])(
  'keeps both providers and blocks duplicate actions during %s sign-in until cancellation',
  async (provider) => {
    const s = await setup();
    let release!: () => void;
    s.auth.signIn = jest.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve(null);
        }),
    );
    const screen = await render(<WelcomeScreen controller={s.controller} />);
    await act(async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: `Sign in with ${provider}` }),
      );
    });
    try {
      for (const name of [
        'Sign in with Apple',
        'Sign in with Google',
        'Continue',
      ]) {
        const button = screen.getByRole('button', { name });
        expect(button).toBeDisabled();
        await fireEvent.press(button);
      }
      expect(s.auth.signIn).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('progressbar', {
          name: `Signing in with ${provider}`,
        }),
      ).toBeTruthy();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockBeginEntry).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        release();
      });
    }
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(s.api.request).not.toHaveBeenCalled();
  },
);

it.each(['apple', 'google'] as const)(
  'retains both provider buttons after %s establishes the account while challenges prepare',
  async (provider) => {
    const s = await setup();
    const snapshot = {
      ...s.controller.getSnapshot(),
      mode: 'account' as const,
      provider,
      account: {
        userId: '00000000-0000-4000-8000-000000000101',
        deviceId: '00000000-0000-4000-8000-000000000102',
        sessionId: '00000000-0000-4000-8000-000000000103',
        authUserId: '00000000-0000-4000-8000-000000000104',
        expiresAt: '2027-01-01T00:00:00.000Z',
        dataEpoch: 0,
      },
    };
    jest.spyOn(s.controller, 'getSnapshot').mockReturnValue(snapshot);
    const signIn = jest.spyOn(s.auth, 'signIn');
    const screen = await render(<WelcomeScreen controller={s.controller} />);
    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.props.accessibilityLabel),
    ).toEqual(['Sign in with Apple', 'Sign in with Google', 'Continue']);
    expect(
      screen.getByText(/Signing in saves your challenge history/),
    ).toBeTruthy();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
      await fireEvent.press(button);
    }
    expect(
      screen.getByRole('progressbar', {
        name: `Signing in with ${provider === 'apple' ? 'Apple' : 'Google'}`,
      }),
    ).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    mockHandoff.error =
      'Your challenges couldn’t load. Check your connection and try again.';
    await screen.rerender(<WelcomeScreen controller={s.controller} />);
    expect(screen.getByRole('alert')).toHaveTextContent(mockHandoff.error);
    expect(screen.queryByRole('progressbar')).toBeNull();
    for (const name of [
      'Sign in with Apple',
      'Sign in with Google',
      'Continue',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Retry connection' }),
    );
    expect(mockHandoff.retry).toHaveBeenCalledTimes(1);
    expect(signIn).not.toHaveBeenCalled();
  },
);

it('keeps provider failure on Welcome and allows an explicit retry', async () => {
  const s = await setup();
  s.auth.signIn = jest
    .fn()
    .mockRejectedValueOnce(new ProviderAuthError('CONFIGURATION'))
    .mockResolvedValue(null);
  const screen = await render(<WelcomeScreen controller={s.controller} />);
  const press = async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Sign in with Google' }),
    );
  };
  await press();
  expect(screen.getByRole('alert')).toHaveTextContent(
    /Sign-in isn’t configured/,
  );
  expect(mockPush).not.toHaveBeenCalled();
  await press();
  expect(s.auth.signIn).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not show a late provider failure after leaving and returning to Welcome', async () => {
  const s = await setup();
  let reject: (error: Error) => void = () => {};
  s.auth.signIn = () =>
    new Promise((_resolve, fail) => {
      reject = fail;
    });
  const screen = await render(<WelcomeScreen controller={s.controller} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Sign in with Google' }),
  );
  mockFocused = false;
  await screen.rerender(<WelcomeScreen controller={s.controller} />);
  await act(async () => reject(new ProviderAuthError('CONFIGURATION')));
  mockFocused = true;
  await screen.rerender(<WelcomeScreen controller={s.controller} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Sign in with Google' }),
  ).toBeEnabled();
});

it('offers connection retry for a later controller failure after provider cancellation', async () => {
  const { auth, controller } = await setup();
  const screen = await render(<WelcomeScreen controller={controller} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Sign in with Google' }),
  );
  expect(screen.queryByRole('alert')).toBeNull();

  const initialize = jest
    .spyOn(auth, 'initialize')
    .mockRejectedValueOnce(new ProviderAuthError('STORAGE'));
  await act(() => controller.retry());
  expect(screen.getByRole('alert')).toHaveTextContent(/storage is unavailable/);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Retry connection' }),
  );
  expect(initialize).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps a failed local entry retryable without creating a server account', async () => {
  const s = await setup();
  s.storage.write.mockRejectedValueOnce(new Error('Synthetic disk failure'));
  await s.controller.continueAsGuest();
  const screen = await render(<WelcomeScreen controller={s.controller} />);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith('/acceptance');
  expect(s.api.request).not.toHaveBeenCalled();
});
