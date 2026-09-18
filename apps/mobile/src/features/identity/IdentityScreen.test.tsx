import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { IdentityScreen } from './IdentityScreen';
import { IdentityController } from './controller';
import { createMemoryVault } from './storage';
import {
  createIdentityApi,
  IdentityClientError,
  type IdentityApi,
} from './api';

jest.mock('expo-crypto', () => ({
  getRandomValues: () => new Uint8Array(32).fill(1),
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));
jest.mock('./vault', () => ({ createVault: jest.fn() }));
it('asks for verification from the new device and submits the entered digits only', async () => {
  const transferId = '00000000-0000-4000-8000-000000000002';
  const fetcher = jest.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : {};
    let result: object;
    if (url.endsWith('/bootstrap'))
      result = {
        userId: '00000000-0000-4000-8000-000000000003',
        deviceId: body.deviceId,
        sessionId: body.sessionId,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
    else if (url.endsWith('/devices')) result = { devices: [] };
    else if (url.endsWith('/credentials')) result = { credentials: [] };
    else if (url.endsWith('/transfers/inspect'))
      result = {
        id: transferId,
        status: 'waiting',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
    else if (url.endsWith('/transfers/approve')) {
      if (body.verification !== '012345')
        return {
          ok: false,
          json: async () => ({ code: 'CONFLICT', requestId: 'test' }),
        };
      result = { ok: true };
    } else throw new Error(`Unexpected test route: ${url}`);
    return { ok: true, json: async () => result };
  });
  const controller = new IdentityController(
    createMemoryVault(),
    createIdentityApi(
      'http://localhost:3000',
      fetcher as unknown as typeof fetch,
    ),
  );
  const screen = render(<IdentityScreen controller={controller} />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Create a private account' }),
    ).toBeTruthy(),
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Create a private account' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Transfer code')).toBeTruthy(),
  );
  fireEvent.changeText(
    screen.getByLabelText('Transfer code'),
    'ABCD-EF01-2345-6789',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Review transfer' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Verification digits')).toBeTruthy(),
  );
  expect(screen.getByLabelText('Verification digits').props.value).toBe('');
  fireEvent.press(screen.getByRole('button', { name: 'Approve this device' }));
  await waitFor(() =>
    expect(
      screen.getByText(/six verification digits and try again/),
    ).toBeTruthy(),
  );
  expect(
    fetcher.mock.calls.some(([url]) => url.endsWith('/transfers/approve')),
  ).toBe(false);
  fireEvent.changeText(screen.getByLabelText('Verification digits'), '999999');
  fireEvent.press(screen.getByRole('button', { name: 'Approve this device' }));
  await waitFor(() =>
    expect(screen.getByText(/no longer matches/)).toBeTruthy(),
  );
  expect(screen.getByLabelText('Transfer code').props.value).toBe(
    'ABCD-EF01-2345-6789',
  );
  fireEvent.changeText(screen.getByLabelText('Verification digits'), '012345');
  fireEvent(screen.getByLabelText('Verification digits'), 'submitEditing');
  await waitFor(() =>
    expect(screen.getByText(/Transfer approved/)).toBeTruthy(),
  );
  expect(screen.queryByLabelText('Verification digits')).toBeNull();
  expect(screen.getByLabelText('Transfer code').props.value).toBe('');
  expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string)).toEqual({
    code: 'ABCDEF0123456789',
    verification: '012345',
  });
});

it('shows service unavailable for a malformed API address, without blaming secure storage', async () => {
  const fetcher = jest.fn();
  const vault = { ...createMemoryVault(), kind: 'keychain' as const };
  const controller = new IdentityController(
    vault,
    createIdentityApi('not-a-url', fetcher),
  );
  const screen = render(<IdentityScreen controller={controller} />);
  await waitFor(() =>
    expect(screen.getByText(/account service is unavailable/)).toBeTruthy(),
  );
  expect(screen.queryByText(/Secure storage is unavailable/)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it('shows the browser limitation, recovery inputs, busy state and recoverable failure', async () => {
  let rejectRequest: ((error: unknown) => void) | undefined;
  const api: IdentityApi = {
    request: () =>
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
  };
  const controller = new IdentityController(createMemoryVault(), api);
  const screen = render(<IdentityScreen controller={controller} />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Create a private account' }),
    ).toBeTruthy(),
  );
  expect(screen.getByText(/Browser testing only/)).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Create a private account' }),
  );
  await waitFor(() => expect(rejectRequest).toBeDefined());
  expect(
    screen.getByRole('button', { name: 'Recover an existing account' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  rejectRequest!(new IdentityClientError('NETWORK'));
  await waitFor(() =>
    expect(screen.getByText(/Couldn’t connect/)).toBeTruthy(),
  );
  expect(
    screen.queryByRole('button', { name: 'Create a private account' }),
  ).toBeNull();
  fireEvent.press(
    screen.getByRole('button', { name: 'Recover an existing account' }),
  );
  expect(screen.getByLabelText('Recovery key').props.secureTextEntry).toBe(
    true,
  );
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Create a separate empty account' }),
  );
  expect(
    screen.getByText(/Existing accounts and credentials will be kept separate/),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
});

it('shares the app account and makes device tools reachable without a long recovery page', async () => {
  const controller = new IdentityController(
    createMemoryVault(),
    createIdentityApi(
      'http://localhost:3000',
      jest.fn(async (_url, init) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        return {
          ok: true,
          json: async () =>
            _url.toString().endsWith('/bootstrap')
              ? {
                  userId: '00000000-0000-4000-8000-000000000003',
                  deviceId: body.deviceId,
                  sessionId: body.sessionId,
                  expiresAt: new Date(Date.now() + 86400000).toISOString(),
                }
              : _url.toString().endsWith('/devices')
                ? { devices: [] }
                : { credentials: [] },
        } as Response;
      }),
    ),
  );
  await controller.initialize();
  await controller.createAccount();
  const screen = render(<IdentityScreen controller={controller} managed />);
  expect(screen.getByText('Connected')).toBeTruthy();
  expect(screen.queryByText('Your courage.\nYour account.')).toBeNull();
  expect(screen.queryByLabelText('Transfer code')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Device transfer' }));
  expect(screen.getByLabelText('Transfer code')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Manage devices' }));
  expect(screen.getByText('Your devices')).toBeTruthy();
  expect(screen.queryByLabelText('Transfer code')).toBeNull();
});
