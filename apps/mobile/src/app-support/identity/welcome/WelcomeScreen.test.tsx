import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { IdentityApi } from '../api';
import { IdentityClientError } from '../api';
import { IdentityController } from '../controller';
import { createMemoryVault } from '../storage';
import { WelcomeScreen } from './WelcomeScreen';

let mockAwaitingAccess = false;
jest.mock('./WelcomeTransition', () => ({
  useWelcomeTransition: () => mockAwaitingAccess,
}));
beforeEach(() => {
  mockAwaitingAccess = false;
});

jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
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

async function setup() {
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
    accountDeleted: true,
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

it('keeps Continue busy after creation until the first access check finishes', async () => {
  const s = await setup();
  await s.controller.createAccount();
  mockAwaitingAccess = true;
  const screen = render(<WelcomeScreen controller={s.controller} />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(screen.getByLabelText('Creating your account')).toBeTruthy();
  expect(screen.queryByText('Redirect: /')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(s.bootstrap).toHaveBeenCalledTimes(1);
  mockAwaitingAccess = false;
  screen.rerender(<WelcomeScreen controller={s.controller} />);
  expect(screen.getByText('Redirect: /')).toBeTruthy();
});

it('replaces Continue with a spinner, blocks duplicate requests and routes success through normal access checks', async () => {
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
  const screen = render(<WelcomeScreen controller={s.controller} />);
  const button = screen.getByRole('button', { name: 'Continue' });
  fireEvent.press(button);
  await waitFor(() => expect(s.bootstrap).toHaveBeenCalledTimes(1));
  expect(
    screen.getByRole('progressbar', { name: 'Creating your account' }),
  ).toBeTruthy();
  expect(button).toBeDisabled();
  expect(screen.queryByText('Continue')).toBeNull();
  fireEvent.press(button);
  expect(s.bootstrap).toHaveBeenCalledTimes(1);
  expect(s.controller.getSnapshot().deletionStatus).toBe('deleted');
  await act(async () => {
    release();
    await pending;
  });
  await waitFor(() => expect(screen.getByText('Redirect: /')).toBeTruthy());
  expect((await s.vault.read())?.accountDeleted).toBe(false);
  screen.unmount();
});

it('shows a creation error on welcome and retries the saved proof without creating another account', async () => {
  const s = await setup();
  s.bootstrap.mockRejectedValueOnce(new IdentityClientError('NETWORK'));
  const screen = render(<WelcomeScreen controller={s.controller} />);
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(s.controller.getSnapshot()).toMatchObject({
    deletionStatus: 'deleted',
    hasPending: true,
    account: null,
  });
  expect((await s.vault.read())?.accountDeleted).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.getByText('Redirect: /')).toBeTruthy());
  expect(s.bootstrap).toHaveBeenCalledTimes(2);
  expect(s.bootstrap.mock.calls[1]).toEqual(s.bootstrap.mock.calls[0]);
});

it('retains the welcome state across a failed replacement and failed relaunch, then resumes the same request', async () => {
  const s = await setup();
  s.bootstrap.mockRejectedValue(new IdentityClientError('NETWORK'));
  await s.controller.createAccount();
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
});
