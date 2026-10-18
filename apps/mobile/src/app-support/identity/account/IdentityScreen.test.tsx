import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { IdentityScreen } from './IdentityScreen';
import { AccountToolsScreen } from './AccountToolsScreen';
import { IdentityController } from '../controller';
import { createMemoryVault } from '../storage';
import { AppState, Linking, type AppStateStatus } from 'react-native';
import type { ComponentProps } from 'react';
import { supportContact, contactFailureMessage } from '../../contact';
import { showMessageToast } from '../../../platform/toast/Toast';
import {
  createIdentityApi,
  IdentityClientError,
  type IdentityApi,
} from '../api';

// A screen cannot create a private runtime when its caller omits the controller.
type Assert<T extends true> = T;
export type RequiresSuppliedController = Assert<
  undefined extends ComponentProps<typeof IdentityScreen>['controller']
    ? false
    : true
>;

let mockCurrentRouteKey: string | undefined = 'recovery';
const mockReplace = jest.fn();
beforeEach(() => {
  mockCurrentRouteKey = 'recovery';
  mockReplace.mockClear();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    useNavigationContainerRef: () => ({
      getCurrentRoute: () =>
        mockCurrentRouteKey ? { key: mockCurrentRouteKey } : undefined,
    }),
    useRouter: () => ({
      canGoBack: () => false,
      replace: mockReplace,
      dismissTo: jest.fn(),
      back: jest.fn(),
    }),
    useFocusEffect: (callback: () => void | (() => void)) =>
      React.useEffect(callback, [callback]),
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('expo-crypto', () => ({
  getRandomValues: () => new Uint8Array(32).fill(1),
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));
jest.mock('../../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));
it.each(['pending', 'cleanup'] as const)(
  'routes %s deletion back to cleanup instead of offering account replacement',
  (status) => {
    const controller = new IdentityController(createMemoryVault(), {
      request: jest.fn(),
    });
    const snapshot = { ...controller.getSnapshot(), deletionStatus: status };
    jest.spyOn(controller, 'getSnapshot').mockReturnValue(snapshot);
    const screen = render(<IdentityScreen controller={controller} managed />);
    expect(screen.getByText('Redirect: /delete-account')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Create a new account' }),
    ).toBeNull();
  },
);
it('routes a deleted account to welcome without exposing recovery or settings', () => {
  const controller = new IdentityController(createMemoryVault(), {
    request: jest.fn(),
  });
  jest.spyOn(controller, 'getSnapshot').mockReturnValue({
    ...controller.getSnapshot(),
    initialized: true,
    deletionStatus: 'deleted',
    message: 'Your account has been deleted.',
  });
  const screen = render(<IdentityScreen controller={controller} managed />);
  expect(screen.getByText('Redirect: /welcome')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Create a new account' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Get help' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
});
it('offers private email support from account recovery and keeps it available after failure', async () => {
  const controller = new IdentityController(createMemoryVault(), {
    request: jest.fn(),
  });
  const open = jest
    .spyOn(Linking, 'openURL')
    .mockRejectedValueOnce(new Error('native detail'))
    .mockResolvedValueOnce(undefined);
  const screen = render(<IdentityScreen controller={controller} managed />);
  expect(screen.queryByText('JustGO · Your account, kept private')).toBeNull();
  const help = screen.getByRole('button', { name: 'Get help' });
  fireEvent.press(help);
  await waitFor(() =>
    expect(showMessageToast).toHaveBeenCalledWith(
      'activity',
      contactFailureMessage,
    ),
  );
  expect(help.props.accessibilityState.disabled).toBe(false);
  fireEvent.press(help);
  await waitFor(() => expect(help.props.accessibilityState.busy).toBe(false));
  expect(open).toHaveBeenNthCalledWith(2, supportContact);
  open.mockRestore();
});
it('asks for verification from the new device and submits the entered digits only', async () => {
  const transferId = '00000000-0000-4000-8000-000000000002';
  const fetcher = jest.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : {};
    let result: object;
    if (url.endsWith('/sessions'))
      result = {
        userId: '00000000-0000-4000-8000-000000000003',
        deviceId: body.deviceId,
        sessionId: body.sessionId,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
    else if (url.endsWith('/devices')) result = { devices: [] };
    else if (url.endsWith('/credentials')) result = { credentials: [] };
    else if (url.endsWith('/transfer-inspections'))
      result = {
        id: transferId,
        status: 'waiting',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
    else if (url.endsWith('/transfer-approvals')) {
      if (body.verification !== '012345')
        return {
          headers: new Headers({ 'Content-Type': 'application/json' }),
          ok: false,
          json: async () => ({ code: 'CONFLICT', requestId: 'test' }),
        };
      result = { ok: true };
    } else throw new Error(`Unexpected test route: ${url}`);
    return {
      headers: new Headers({ 'Content-Type': 'application/json' }),
      ok: true,
      json: async () => result,
    };
  });
  const controller = new IdentityController(
    createMemoryVault(),
    createIdentityApi(
      'http://localhost:3000',
      fetcher as unknown as typeof fetch,
    ),
  );
  await controller.initialize();
  await controller.createAccount();
  const screen = render(
    <AccountToolsScreen controller={controller} tool="transfer" />,
  );
  await waitFor(() => expect(controller.getSnapshot().busy).toBe(false));
  expect(screen.getByLabelText('Transfer code')).toBeTruthy();
  fireEvent.changeText(
    screen.getByLabelText('Transfer code'),
    'ABCD-EF01-2345-6789',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Review transfer' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Verification digits')).toBeTruthy(),
  );
  expect(screen.getByLabelText('Verification digits').props.value).toBe('');
  fireEvent.changeText(screen.getByLabelText('Verification digits'), '012345');
  fireEvent.changeText(
    screen.getByLabelText('Transfer code'),
    'ABCD-EF01-2345-6789',
  );
  expect(screen.queryByLabelText('Verification digits')).toBeNull();
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
    fetcher.mock.calls.some(([url]) => url.endsWith('/transfer-approvals')),
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
  fireEvent.press(
    await screen.findByRole('button', { name: 'Create a new account' }),
  );
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
      screen.getByRole('button', { name: 'Create a new account' }),
    ).toBeTruthy(),
  );
  expect(screen.getByText(/Browser testing only/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Create a new account' }));
  await waitFor(() => expect(rejectRequest).toBeDefined());
  expect(
    screen.getByRole('progressbar', {
      name: 'Create a new account in progress',
    }),
  ).toBeTruthy();
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  expect(screen.queryByText('Connecting securely…')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Recover an existing account' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  rejectRequest!(new IdentityClientError('NETWORK'));
  await waitFor(() =>
    expect(screen.getByText(/Couldn’t connect/)).toBeTruthy(),
  );
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Create a new account' }),
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

it.each([
  'key',
  'credential',
  'empty-account',
  'start-transfer',
  'new-transfer',
  'finish-transfer',
] as const)(
  'keeps only the %s control loading until the request finishes',
  async (action) => {
    const vault = createMemoryVault();
    let session: {
      userId: string;
      deviceId: string;
      sessionId: string;
      expiresAt: string;
    };
    let hold: { suffix: string; gate: Promise<void> } | null = null;
    const fetcher = jest.fn(async (url: string, init: RequestInit) => {
      if (hold && url.endsWith(hold.suffix)) await hold.gate;
      const body = init.body ? JSON.parse(init.body as string) : {};
      let result: object;
      if (url.endsWith('/sessions')) {
        const pending = (await vault.read())!.pending;
        const proposal =
          body.kind === 'transfer' && pending?.kind === 'transfer'
            ? pending.input
            : body;
        session = {
          userId: '30000000-0000-4000-8000-000000000003',
          deviceId: proposal.deviceId,
          sessionId: proposal.sessionId,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        };
        result = session;
      } else if (url.endsWith('/sessions/current')) result = session;
      else if (url.endsWith('/devices')) result = { devices: [] };
      else if (url.endsWith('/credentials'))
        result = init.method === 'GET' ? { credentials: [] } : { ok: true };
      else if (url.endsWith('/transfers'))
        result = {
          id: body.id,
          status: 'waiting',
          verification: '012345',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        };
      else if (url.includes('/transfers/') && init.method === 'DELETE')
        result = { status: 'cancelled' };
      else throw new Error('Unexpected synthetic identity action');
      return {
        headers: new Headers({ 'Content-Type': 'application/json' }),
        ok: true,
        json: async () => result,
      };
    });
    let sequence = 10;
    const controller = new IdentityController(
      vault,
      createIdentityApi(
        'http://localhost:3000',
        fetcher as unknown as typeof fetch,
      ),
      {
        id: () =>
          `10000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
        secret: () => (sequence++).toString(16).padStart(64, '0'),
      },
    );
    await controller.initialize();
    const transferAction = action.includes('transfer');
    if (!transferAction) await controller.createAccount();
    if (action === 'new-transfer' || action === 'finish-transfer')
      await controller.startTransfer();
    const screen = render(
      <IdentityScreen
        controller={controller}
        managed
        recoveryOnly={!transferAction}
      />,
    );
    const label = {
      key: 'Recover with key',
      credential: `Recover saved credential 1 (${controller.getSnapshot().credentials[0]?.id.slice(0, 8)})`,
      'empty-account': 'Create a separate empty account',
      'start-transfer': 'Transfer from another device',
      'new-transfer': 'Start a new transfer',
      'finish-transfer': 'Check approval & finish',
    }[action];
    let finish!: () => void;
    hold = {
      suffix:
        action === 'start-transfer' || action === 'new-transfer'
          ? '/transfers'
          : '/sessions',
      gate: new Promise((resolve) => {
        finish = resolve;
      }),
    };
    try {
      if (action === 'key')
        fireEvent.changeText(
          screen.getByLabelText('Recovery key'),
          'a'.repeat(64),
        );
      fireEvent.press(screen.getByRole('button', { name: label }));
      if (action === 'credential' || action === 'empty-account')
        fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(controller.getSnapshot().busy).toBe(true));
      const loadingLabel =
        action === 'credential' || action === 'empty-account'
          ? 'Confirm'
          : label;
      expect(
        screen.getByRole('progressbar', {
          name: `${loadingLabel} in progress`,
        }),
      ).toBeTruthy();
      expect(screen.getAllByRole('progressbar')).toHaveLength(1);
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
      expect(screen.queryByText('Connecting securely…')).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: label }));
    } finally {
      await act(async () => finish());
      await waitFor(() => expect(controller.getSnapshot().busy).toBe(false));
      expect(screen.queryByRole('progressbar')).toBeNull();
      screen.unmount();
      await controller.cancelTransfer();
    }
  },
);

it('keeps creation pending by action ID when arriving credentials change its label', async () => {
  const controller = new IdentityController(createMemoryVault(), {
    request: jest.fn(),
  });
  let snapshot = { ...controller.getSnapshot(), initialized: true };
  jest.spyOn(controller, 'getSnapshot').mockImplementation(() => snapshot);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const create = jest
    .spyOn(controller, 'createAccount')
    .mockImplementation(async () => {
      snapshot = { ...snapshot, busy: true, hasPending: true };
      await pending;
      snapshot = { ...snapshot, busy: false };
    });
  const screen = render(<IdentityScreen controller={controller} managed />);
  try {
    fireEvent.press(
      screen.getByRole('button', { name: 'Create a new account' }),
    );
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    snapshot = {
      ...snapshot,
      credentials: [{ id: '10000000-0000-4000-8000-000000000001' }],
    };
    screen.rerender(<IdentityScreen controller={controller} managed />);
    const renamed = screen.getByRole('button', {
      name: 'Create a separate account',
    });
    expect(renamed).toBeDisabled();
    expect(
      screen.getByRole('progressbar', {
        name: 'Create a separate account in progress',
      }),
    ).toBeTruthy();
    fireEvent.press(renamed);
    expect(create).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      release();
      await pending;
    });
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
    screen.unmount();
  }
});

it('retains a recovery key across temporary closes and clears it on background', async () => {
  let onState: ((state: AppStateStatus) => void) | undefined;
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      onState = callback;
      return { remove: jest.fn() };
    });
  const controller = new IdentityController(createMemoryVault(), {
    request: jest.fn(),
  });
  await controller.initialize();
  const screen = render(<IdentityScreen controller={controller} managed />);
  try {
    fireEvent.press(
      screen.getByRole('button', { name: 'Recover an existing account' }),
    );
    fireEvent.changeText(
      screen.getByLabelText('Recovery key'),
      'private synthetic key',
    );
    fireEvent.press(
      screen.getByRole('button', { name: 'Close recovery options' }),
    );
    expect(screen.queryByLabelText('Recovery key')).toBeNull();
    fireEvent.press(
      screen.getByRole('button', { name: 'Recover an existing account' }),
    );
    expect(screen.getByLabelText('Recovery key').props.value).toBe(
      'private synthetic key',
    );
    await act(async () => {
      onState?.('background');
    });
    expect(screen.getByLabelText('Recovery key').props.value).toBe('');
  } finally {
    screen.unmount();
    listener.mockRestore();
  }
});

function recoveryNavigation(method: 'key' | 'credential') {
  const controller = new IdentityController(createMemoryVault(), {
    request: jest.fn(),
  });
  const account = {
    userId: '40000000-0000-4000-8000-000000000001',
    deviceId: '40000000-0000-4000-8000-000000000002',
    sessionId: '40000000-0000-4000-8000-000000000003',
    expiresAt: '2026-10-18T12:00:00.000Z',
  };
  const credentialId = '40000000-0000-4000-8000-000000000004';
  let snapshot = {
    ...controller.getSnapshot(),
    initialized: true,
    account,
    credentials: [{ id: credentialId }],
  };
  jest.spyOn(controller, 'getSnapshot').mockImplementation(() => snapshot);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const recovery = jest
    .spyOn(controller, method === 'key' ? 'recoverKey' : 'recoverCredential')
    .mockImplementation(async () => {
      snapshot = { ...snapshot, busy: true };
      await pending;
      snapshot = { ...snapshot, busy: false };
    });
  const screen = render(
    <IdentityScreen controller={controller} managed recoveryOnly />,
  );
  const start = () => {
    if (method === 'key') {
      fireEvent.changeText(
        screen.getByLabelText('Recovery key'),
        'a'.repeat(64),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Recover with key' }));
    } else {
      fireEvent.press(
        screen.getByRole('button', {
          name: `Recover saved credential 1 (${credentialId.slice(0, 8)})`,
        }),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    }
  };
  return {
    controller,
    screen,
    recovery,
    start,
    changeAccount: () => {
      snapshot = {
        ...snapshot,
        account: {
          ...account,
          userId: '40000000-0000-4000-8000-000000000005',
          sessionId: '40000000-0000-4000-8000-000000000006',
        },
      };
    },
    fail: () => {
      snapshot = { ...snapshot, message: 'Couldn’t connect. Please retry.' };
    },
    finish: async () => {
      release();
      await pending;
      await Promise.resolve();
    },
  };
}

it.each(['key', 'credential'] as const)(
  'returns %s recovery to the account hub even if an account guard remounts the screen',
  async (method) => {
    const s = recoveryNavigation(method);
    s.start();
    await waitFor(() => expect(s.recovery).toHaveBeenCalledTimes(1));
    s.changeAccount();
    s.screen.unmount();
    const remounted = render(
      <IdentityScreen controller={s.controller} managed recoveryOnly />,
    );
    expect(remounted.queryByText('Redirect: /recovery')).toBeNull();
    await act(s.finish);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/recovery'));
    expect(mockReplace).toHaveBeenCalledTimes(1);
    remounted.unmount();
  },
);

it.each(['key', 'credential'] as const)(
  'does not navigate after late %s recovery when the initiating route has been left',
  async (method) => {
    const s = recoveryNavigation(method);
    s.start();
    await waitFor(() => expect(s.recovery).toHaveBeenCalledTimes(1));
    mockCurrentRouteKey = 'settings';
    s.screen.unmount();
    s.changeAccount();
    await act(s.finish);
    expect(s.controller.getSnapshot().account?.userId).toBe(
      '40000000-0000-4000-8000-000000000005',
    );
    expect(mockReplace).not.toHaveBeenCalled();
  },
);

it.each(['key', 'credential'] as const)(
  'retains the current account and recovery form after %s recovery fails',
  async (method) => {
    const s = recoveryNavigation(method);
    const original = s.controller.getSnapshot().account;
    s.start();
    await waitFor(() => expect(s.recovery).toHaveBeenCalledTimes(1));
    s.fail();
    await act(s.finish);
    s.screen.rerender(
      <IdentityScreen controller={s.controller} managed recoveryOnly />,
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(s.screen.queryByText('Redirect: /recovery')).toBeNull();
    expect(s.controller.getSnapshot().account).toEqual(original);
    expect(s.screen.getByLabelText('Recovery key')).toBeTruthy();
    expect(s.screen.getByText('Couldn’t connect. Please retry.')).toBeTruthy();
  },
);
