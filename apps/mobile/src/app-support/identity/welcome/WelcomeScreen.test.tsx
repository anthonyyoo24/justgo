import { act, fireEvent, render } from '@testing-library/react-native';
import type { IdentityApi } from '../api';
import { IdentityClientError } from '../api';
import { IdentityController } from '../controller';
import { createMemoryVault } from '../storage';
import { WelcomeScreen } from './WelcomeScreen';

const mockPush = jest.fn();
const mockBeginEntry = jest.fn();
jest.mock('./WelcomeTransition', () => ({
  useBeginWelcomeEntry: () => mockBeginEntry,
}));
beforeEach(() => {
  mockPush.mockClear();
  mockBeginEntry.mockClear();
});

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
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
  getRandomValues: jest.fn(),
}));

async function setup(deleted = true) {
  let sequence = 1;
  const id = () =>
    `00000000-0000-4000-8000-${(sequence++).toString().padStart(12, '0')}`;
  const vault = createMemoryVault();
  await vault.write({
    deviceId: id(),
    selectedId: null,
    session: null,
    pending: null,
    savedKey: null,
    registration: null,
    accountDeleted: deleted,
  });
  const bootstrap = jest.fn(async (body: unknown) => {
    const proposal = body as { deviceId: string; sessionId: string };
    return {
      userId: '00000000-0000-4000-8000-000000000099',
      deviceId: proposal.deviceId,
      sessionId: proposal.sessionId,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
  });
  const api: IdentityApi = {
    request: async (_method, path, schema, body) =>
      schema.parse(
        await (path === '/sessions'
          ? bootstrap(body)
          : path === '/devices'
            ? { devices: [] }
            : { credentials: [] }),
      ),
  };
  const controller = new IdentityController(vault, api, {
    id,
    secret: () => 'a'.repeat(64),
  });
  await controller.initialize();
  return {
    controller,
    vault,
    api,
    bootstrap,
    random: { id, secret: () => 'a'.repeat(64) },
  };
}

it('shows the night-paper welcome copy and only Continue, without recovery or legal copy', async () => {
  const s = await setup();
  const screen = render(<WelcomeScreen controller={s.controller} />);
  expect(screen.getByText('JustGO')).toBeTruthy();
  expect(screen.getByText('A little courage.\nEvery day.')).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(screen.queryByText(/By continuing/)).toBeNull();
  expect(screen.queryByText(/terms of use/i)).toBeNull();
  expect(screen.queryByText(/privacy policy/i)).toBeNull();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
  expect(screen.queryByText('Your account has been deleted.')).toBeNull();
  expect(s.bootstrap).not.toHaveBeenCalled();
  expect(mockBeginEntry).not.toHaveBeenCalled();
});

it('keeps welcome ready when a foreground refresh has no account to reconnect', async () => {
  const s = await setup();
  const screen = render(<WelcomeScreen controller={s.controller} />);
  const updates = jest.fn();
  const unsubscribe = s.controller.subscribe(updates);
  await act(async () => {
    await s.controller.retry({ background: true });
  });
  expect(updates).not.toHaveBeenCalled();
  expect(s.bootstrap).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(s.controller.getSnapshot().deletionStatus).toBe('deleted');
  unsubscribe();
});

it('leaves Welcome as soon as an account exists without rendering a creation loader', async () => {
  const s = await setup();
  await s.controller.createAccount();
  const screen = render(<WelcomeScreen controller={s.controller} />);
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(s.bootstrap).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
});

it('opens acceptance on Continue without creating an account or changing the saved identity', async () => {
  const s = await setup();
  const before = await s.vault.read();
  const screen = render(<WelcomeScreen controller={s.controller} />);
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith('/acceptance');
  expect(mockBeginEntry).toHaveBeenCalledTimes(1);
  expect(mockBeginEntry.mock.invocationCallOrder[0]).toBeLessThan(
    Number(mockPush.mock.invocationCallOrder[0]),
  );
  expect(s.bootstrap).not.toHaveBeenCalled();
  expect(s.controller.getSnapshot().deletionStatus).toBe('deleted');
  expect(await s.vault.read()).toEqual(before);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('preserves a failed creation proof while sending the user back to acceptance to retry', async () => {
  const s = await setup();
  s.bootstrap.mockRejectedValueOnce(new IdentityClientError('NETWORK'));
  await s.controller.createAcceptedAccount();
  const screen = render(<WelcomeScreen controller={s.controller} />);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(s.controller.getSnapshot()).toMatchObject({
    deletionStatus: 'deleted',
    hasPending: true,
    account: null,
  });
  expect((await s.vault.read())?.accountDeleted).toBe(true);
  const before = await s.vault.read();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith('/acceptance');
  expect(s.bootstrap).toHaveBeenCalledTimes(1);
  expect(await s.vault.read()).toEqual(before);
});

it('retains the welcome state and the same accepted creation proof across a failed relaunch', async () => {
  const s = await setup();
  s.bootstrap.mockRejectedValue(new IdentityClientError('NETWORK'));
  await s.controller.createAcceptedAccount();
  const proof = s.bootstrap.mock.calls[0];
  const reopened = new IdentityController(s.vault, s.api, s.random);
  await reopened.initialize();
  expect(reopened.getSnapshot()).toMatchObject({
    initialized: true,
    deletionStatus: 'deleted',
    account: null,
    hasPending: true,
  });
  expect(s.bootstrap.mock.calls[1]).toEqual(proof);
  const screen = render(<WelcomeScreen controller={reopened} />);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith('/acceptance');
  expect(s.bootstrap).toHaveBeenCalledTimes(2);
});

it('also sends a fresh installation to acceptance before issuing any account request', async () => {
  const s = await setup(false);
  expect(s.controller.getSnapshot()).toMatchObject({
    initialized: true,
    needsWelcome: true,
    account: null,
    deletionStatus: null,
  });
  const screen = render(<WelcomeScreen controller={s.controller} />);
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith('/acceptance');
  expect(s.bootstrap).not.toHaveBeenCalled();
  expect(mockBeginEntry).toHaveBeenCalledTimes(1);
});

it('blocks Continue while an accepted account creation request is still running', async () => {
  const s = await setup();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const success = s.bootstrap.getMockImplementation()!;
  s.bootstrap.mockImplementation(async (body) => {
    await pending;
    return success(body);
  });
  let creation!: Promise<void>;
  await act(async () => {
    creation = s.controller.createAcceptedAccount();
    await Promise.resolve();
  });
  const screen = render(<WelcomeScreen controller={s.controller} />);
  const button = screen.getByRole('button', { name: 'Continue' });
  expect(button).toBeDisabled();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByText('Continue')).toBeTruthy();
  fireEvent.press(button);
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockBeginEntry).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await creation;
  });
  expect(s.bootstrap).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Redirect: /access')).toBeTruthy();
});
