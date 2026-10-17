import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  Linking,
  type AppStateStatus,
} from 'react-native';
import type { LinkProps } from 'expo-router';
import RecoveryRoute from '../../../app/recovery';
import AccountToolRoute from '../../../app/account/[tool]';
import { IdentityController } from '../controller';
import { createIdentityApi, IdentityClientError } from '../api';
import { createMemoryVault } from '../storage';
import { showMessageToast } from '../../../platform/toast/Toast';
import { supportContact, contactFailureMessage } from '../../contact';

let mockController: IdentityController;
let mockTool = 'keys';
let mockFocused = true;
const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  dismissTo: jest.fn(),
  push: jest.fn(),
};
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    useRouter: () => mockRouter,
    useNavigationContainerRef: () => ({
      getCurrentRoute: () => ({
        key: mockFocused ? 'recovery' : 'other-screen',
      }),
    }),
    useLocalSearchParams: () => ({ tool: mockTool }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      const focused = mockFocused;
      React.useEffect(() => {
        if (focused) return callback();
      }, [callback, focused]);
    },
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    Link: ({ href, asChild, children, ...props }: LinkProps) =>
      asChild ? (
        React.cloneElement(
          children as React.ReactElement<{ onPress: () => void }>,
          { onPress: () => mockRouter.push(href) },
        )
      ) : (
        <Text
          {...props}
          accessibilityRole="link"
          onPress={() => mockRouter.push(href)}
        >
          {children}
        </Text>
      ),
  };
});
jest.mock('../../providers/AppProvider', () => {
  const React = require('react') as typeof import('react');
  return {
    useRuntime: () => ({ identity: mockController }),
    useIdentity: () =>
      React.useSyncExternalStore(
        mockController.subscribe,
        mockController.getSnapshot,
        mockController.getSnapshot,
      ),
  };
});
jest.mock('../vault', () => ({ createVault: jest.fn() }));
jest.mock('../../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));

const otherDeviceId = '20000000-0000-4000-8000-000000000002';
const userId = '30000000-0000-4000-8000-000000000003';
async function connected() {
  let sequence = 10;
  const vault = createMemoryVault();
  const keys: {
    id: string;
    kind: 'key';
    createdAt: string;
    revokedAt: string | null;
  }[] = [];
  let session: {
    userId: string;
    deviceId: string;
    sessionId: string;
    expiresAt: string;
  };
  const removed = new Set<string>();
  const controls: {
    holdKey: Promise<void> | null;
    holdRefresh: Promise<void> | null;
    holdRequest: { path: string; method: string; gate: Promise<void> } | null;
  } = { holdKey: null, holdRefresh: null, holdRequest: null };
  const fetcher = jest.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const path = url.toString().split('/v1')[1]!;
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if (
        controls.holdRequest?.path === path &&
        controls.holdRequest.method === init?.method
      )
        await controls.holdRequest.gate;
      let result: object;
      if (path === '/sessions' && init?.method === 'POST') {
        const pending = (await vault.read())?.pending;
        const proposal =
          body.kind === 'transfer' && pending?.kind === 'transfer'
            ? pending.input
            : body;
        session = {
          userId:
            body.kind === 'transfer'
              ? '30000000-0000-4000-8000-000000000004'
              : userId,
          deviceId: proposal.deviceId ?? session.deviceId,
          sessionId: proposal.sessionId,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        };
        result = session;
      } else if (path === '/sessions/current') {
        if (controls.holdRefresh) await controls.holdRefresh;
        result = session;
      } else if (path === '/devices')
        result = {
          devices: [session.deviceId, otherDeviceId].map((id) => ({
            id,
            createdAt: new Date(0).toISOString(),
            revokedAt: removed.has(id) ? new Date(0).toISOString() : null,
          })),
        };
      else if (path === '/credentials' && init?.method === 'GET')
        result = { credentials: keys };
      else if (path === '/credentials') {
        if (body.kind === 'key') {
          if (controls.holdKey) await controls.holdKey;
          if (!keys.some((k) => k.id === body.id))
            keys.push({
              id: body.id,
              kind: 'key',
              createdAt: new Date(0).toISOString(),
              revokedAt: null,
            });
        }
        result = { ok: true };
      } else if (path.startsWith('/credentials/')) {
        keys.find((k) => k.id === path.split('/').at(-1))!.revokedAt = new Date(
          0,
        ).toISOString();
        result = { ok: true };
      } else if (path.startsWith('/devices/')) {
        removed.add(path.split('/').at(-1)!);
        result = { ok: true };
      } else if (path === '/transfers')
        result = {
          id: body.id,
          status: 'waiting',
          verification: '012345',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        };
      else if (path.startsWith('/transfers/') && init?.method === 'DELETE')
        result = { status: 'cancelled' };
      else if (path === '/transfer-inspections')
        result = {
          id: otherDeviceId,
          status: 'waiting',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        };
      else if (path === '/transfer-approvals') result = { ok: true };
      else throw new Error(`Unexpected test path: ${path}`);
      return { ok: true, json: async () => result } as Response;
    },
  );
  mockController = new IdentityController(
    vault,
    createIdentityApi('http://localhost:3000', fetcher as typeof fetch),
    {
      id: () =>
        `10000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
      secret: () => 'a'.repeat(64),
    },
  );
  await mockController.initialize();
  await mockController.createAccount();
  return { fetcher, controls, vault };
}
beforeEach(() => {
  mockTool = 'keys';
  mockFocused = true;
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
});

it('explains transfer entry for phones with and without an account', async () => {
  const { fetcher } = await connected();
  mockTool = 'transfer';
  const source = render(<AccountToolRoute />);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  expect(
    source.getByText(
      /Open JustGO on your new phone and choose “Transfer from another device.”/,
    ),
  ).toBeTruthy();
  expect(
    source.getByText(
      /If that phone already has an account, go to Settings → Account & recovery → Recovery keys → Recover an existing account first/,
    ),
  ).toBeTruthy();
  source.unmount();

  mockController = new IdentityController(
    createMemoryVault(),
    createIdentityApi('http://localhost:3000', fetcher as typeof fetch),
  );
  await mockController.initialize();
  const newPhone = render(<RecoveryRoute />);
  expect(
    newPhone.getByRole('button', { name: 'Transfer from another device' }),
  ).toBeEnabled();
  expect(newPhone.queryByRole('link', { name: 'Recovery keys' })).toBeNull();
  newPhone.unmount();
});

it('preserves transfer input when the system text size changes', async () => {
  await connected();
  mockTool = 'transfer';
  const originalWindow = Dimensions.get('window');
  const screen = render(<AccountToolRoute />);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  const input = screen.getByLabelText('Transfer code');
  fireEvent.changeText(input, 'TEST-CODE');
  try {
    act(() =>
      Dimensions.set({ window: { ...originalWindow, fontScale: 3.57 } }),
    );
    expect(screen.getByLabelText('Transfer code') === input).toBe(true);
    expect(input.props.value).toBe('TEST-CODE');
    expect(
      screen.getByRole('button', { name: 'Review transfer' }),
    ).toBeEnabled();
  } finally {
    act(() => Dimensions.set({ window: originalWindow }));
  }
});

it('uses grouped account sections, opens focused routes and returns to Settings', async () => {
  await connected();
  const screen = render(<RecoveryRoute />);
  expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual([
    'Account & recovery',
    'Account',
    'Recovery',
    'Devices',
  ]);
  expect(screen.getByText('Private account')).toBeTruthy();
  expect(screen.getByText('No email or password.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Back to app' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Get help' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Refresh account' })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Renew this session' }),
  ).toBeNull();
  for (const [label, path] of [
    ['Recovery keys', '/account/keys'],
    ['Move to another phone', '/account/transfer'],
    ['Devices', '/account/devices'],
    ['Troubleshooting', '/account/troubleshooting'],
  ] as const) {
    fireEvent.press(screen.getByRole('link', { name: label }));
    expect(mockRouter.push).toHaveBeenLastCalledWith(path);
  }
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/settings');
});

it('keeps private support available from disconnected recovery with safe failure feedback and retry', async () => {
  await connected();
  mockController.rejectSession(
    mockController.currentSession()!.token,
    'SESSION_REVOKED',
  );
  const open = jest
    .spyOn(Linking, 'openURL')
    .mockRejectedValueOnce(new Error('private native detail'))
    .mockResolvedValueOnce(undefined);
  const screen = render(<RecoveryRoute />);
  expect(screen.queryByRole('link', { name: 'Back to app' })).toBeNull();
  mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/settings');
  fireEvent.press(screen.getByRole('button', { name: 'Get help' }));
  await waitFor(() =>
    expect(showMessageToast).toHaveBeenCalledWith(
      'activity',
      contactFailureMessage,
    ),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Get help' }));
  await waitFor(() => expect(open).toHaveBeenNthCalledWith(2, supportContact));
  open.mockRestore();
});

it.each([
  ['keys', 'Show recovery key'],
  ['transfer', 'Review transfer'],
  ['devices', `Revoke device ${otherDeviceId.slice(0, 8)}`],
  ['troubleshooting', 'Refresh account'],
])(
  'quietly refreshes %s while preserving its action guard',
  async (tool, label) => {
    const { controls } = await connected();
    let finish!: () => void;
    controls.holdRefresh = new Promise((resolve) => {
      finish = resolve;
    });
    mockTool = tool;
    const screen = render(<AccountToolRoute />);
    try {
      await waitFor(() => expect(mockController.getSnapshot().busy).toBe(true));
      expect(screen.queryByText('Connecting securely…')).toBeNull();
      expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    } finally {
      await act(async () => finish());
      await waitFor(() =>
        expect(mockController.getSnapshot().busy).toBe(false),
      );
      screen.unmount();
    }
  },
);

it('shows feedback for a manual refresh even when a focus refresh overlaps', async () => {
  const { controls } = await connected();
  mockTool = 'troubleshooting';
  const screen = render(<AccountToolRoute />);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  let finish!: () => void;
  controls.holdRefresh = new Promise((resolve) => {
    finish = resolve;
  });
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Refresh account' }));
    expect(
      screen.getByRole('progressbar', { name: 'Refresh account in progress' }),
    ).toBeTruthy();
    expect(screen.queryByText('Connecting securely…')).toBeNull();
    mockFocused = false;
    screen.rerender(<AccountToolRoute />);
    mockFocused = true;
    screen.rerender(<AccountToolRoute />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  } finally {
    await act(async () => finish());
    await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
    expect(screen.queryByText('Connecting securely…')).toBeNull();
    screen.unmount();
  }
});

it.each([
  'renew',
  'revoke-key',
  'revoke-device',
  'review',
  'approve',
  'retry',
] as const)(
  'shows only the %s action spinner and restores the control when finished',
  async (action) => {
    const { controls, fetcher } = await connected();
    if (action === 'revoke-key') await mockController.saveKey();
    if (action === 'retry')
      fetcher.mockRejectedValueOnce(new Error('synthetic network failure'));
    mockTool =
      action === 'revoke-key'
        ? 'keys'
        : action === 'revoke-device'
          ? 'devices'
          : action === 'review' || action === 'approve'
            ? 'transfer'
            : 'troubleshooting';
    const screen = render(<AccountToolRoute />);
    await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
    if (action === 'review' || action === 'approve') {
      fireEvent.changeText(
        screen.getByLabelText('Transfer code'),
        'ABCDEF0123456789',
      );
      if (action === 'approve') {
        fireEvent.press(
          screen.getByRole('button', { name: 'Review transfer' }),
        );
        await screen.findByLabelText('Verification digits');
        fireEvent.changeText(
          screen.getByLabelText('Verification digits'),
          '012345',
        );
      }
    }
    const keyId = mockController
      .getSnapshot()
      .recoveryKeys.find((k) => k.kind === 'key')?.id;
    const details = {
      renew: ['Renew this session', '/sessions', 'POST'],
      'revoke-key': [
        `Revoke recovery key ${keyId?.slice(0, 8)}`,
        `/credentials/${keyId}`,
        'DELETE',
      ],
      'revoke-device': [
        `Revoke device ${otherDeviceId.slice(0, 8)}`,
        `/devices/${otherDeviceId}`,
        'DELETE',
      ],
      review: ['Review transfer', '/transfer-inspections', 'POST'],
      approve: ['Approve this device', '/transfer-approvals', 'POST'],
      retry: ['Retry connection', '/sessions/current', 'GET'],
    } as const;
    const [label, path, method] = details[action];
    let finish!: () => void;
    controls.holdRequest = {
      path,
      method,
      gate: new Promise((resolve) => {
        finish = resolve;
      }),
    };
    try {
      fireEvent.press(screen.getByRole('button', { name: label }));
      if (action === 'revoke-key' || action === 'revoke-device')
        fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() =>
        expect(
          fetcher.mock.calls.some(
            ([url, init]) =>
              url.toString().endsWith(path) && init?.method === method,
          ),
        ).toBe(true),
      );
      expect(
        screen.getByRole('progressbar', { name: `${label} in progress` }),
      ).toBeTruthy();
      expect(screen.getAllByRole('progressbar')).toHaveLength(1);
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
      expect(screen.queryByText('Connecting securely…')).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: label }));
    } finally {
      await act(async () => finish());
      await waitFor(() =>
        expect(mockController.getSnapshot().busy).toBe(false),
      );
      expect(screen.queryByRole('progressbar')).toBeNull();
      screen.unmount();
    }
  },
);

it('reveals only requested keys, hides them on background and cancels revocation safely', async () => {
  const { fetcher } = await connected();
  let background: ((next: AppStateStatus) => void) | undefined;
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, cb) => {
      background = cb;
      return { remove: jest.fn() };
    });
  const screen = render(<AccountToolRoute />);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: 'Show recovery key' }));
  await waitFor(() =>
    expect(screen.getByText(/aaaaaaaa aaaaaaaa/)).toBeTruthy(),
  );
  act(() => background!('background'));
  expect(screen.queryByText(/aaaaaaaa aaaaaaaa/)).toBeNull();
  expect(mockController.getSnapshot().key).toBeNull();
  const key = mockController
    .getSnapshot()
    .recoveryKeys.find((k) => k.kind === 'key')!;
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke recovery key ${key.id.slice(0, 8)}`,
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(
    false,
  );
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke recovery key ${key.id.slice(0, 8)}`,
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(screen.getByText('No recovery keys yet.')).toBeTruthy(),
  );
  expect(mockController.getSnapshot().account?.userId).toBe(userId);
  listener.mockRestore();
});

it('keeps a late key response hidden after navigation focus is lost', async () => {
  const { controls } = await connected();
  let finish!: () => void;
  controls.holdKey = new Promise((resolve) => {
    finish = resolve;
  });
  const screen = render(<AccountToolRoute />);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: 'Show recovery key' }));
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(true));
  expect(
    screen.getByRole('progressbar', { name: 'Show recovery key in progress' }),
  ).toBeTruthy();
  expect(screen.queryByText('Connecting securely…')).toBeNull();
  mockFocused = false;
  screen.rerender(<AccountToolRoute />);
  await act(async () => {
    finish();
  });
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  mockFocused = true;
  screen.rerender(<AccountToolRoute />);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  expect(screen.queryByText(/aaaaaaaa aaaaaaaa/)).toBeNull();
  screen.unmount();
});

it('identifies this phone, confirms removal and sends revoked sessions to recovery', async () => {
  const { fetcher } = await connected();
  mockTool = 'devices';
  const deviceId = mockController.getSnapshot().account!.deviceId;
  const screen = render(<AccountToolRoute />);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  expect(screen.getByText(`This phone · ${deviceId.slice(0, 8)}`)).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke device ${otherDeviceId.slice(0, 8)}`,
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(
    false,
  );
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke device ${otherDeviceId.slice(0, 8)}`,
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.getByText('Access removed')).toBeTruthy());
  expect(mockController.getSnapshot().account?.deviceId).toBe(deviceId);
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke device ${deviceId.slice(0, 8)}`,
    }),
  );
  expect(screen.getByText(/This will sign this phone out/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(screen.getByText('Redirect: /recovery')).toBeTruthy(),
  );
  expect(
    fetcher.mock.calls.some(
      ([url, init]) =>
        url.toString().endsWith(`/devices/${deviceId}`) &&
        init?.method === 'DELETE',
    ),
  ).toBe(true);
  screen.unmount();
  const recovery = render(<RecoveryRoute />);
  expect(
    recovery.getByRole('button', { name: 'Recover an existing account' }),
  ).toBeTruthy();
  expect(recovery.queryByText('Private account')).toBeNull();
});

it('keeps session maintenance in Troubleshooting and falls back to the account page', async () => {
  const { fetcher } = await connected();
  mockTool = 'troubleshooting';
  const previous = mockController.getSnapshot().account!.sessionId;
  const screen = render(<AccountToolRoute />);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: 'Renew this session' }));
  await waitFor(() =>
    expect(mockController.getSnapshot().account?.sessionId).not.toBe(previous),
  );
  expect(
    fetcher.mock.calls.some(
      ([, init]) =>
        init?.body && JSON.parse(init.body as string).kind === 'renewal',
    ),
  ).toBe(true);
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  fireEvent.press(
    screen.getByRole('link', { name: 'Recover an existing account' }),
  );
  expect(mockRouter.push).toHaveBeenLastCalledWith('/account/recover');
  mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/recovery');
});

it('offers explicit existing-account recovery and rejects unknown tool URLs', async () => {
  await connected();
  mockTool = 'recover';
  const screen = render(<AccountToolRoute />);
  expect(screen.getByLabelText('Recovery key').props.secureTextEntry).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: 'Refresh account' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Recover with key' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Get help' })).toBeNull();
  expect(screen.queryByText('JustGO · Your account, kept private')).toBeNull();
  mockTool = 'toString';
  screen.rerender(<AccountToolRoute />);
  expect(screen.getByText('Redirect: /recovery')).toBeTruthy();
});

it('confirms receiving a transfer from a connected account, preserves Cancel and finishes recovery', async () => {
  const { fetcher, controls, vault } = await connected();
  const original = mockController.getSnapshot().account;
  const originalCredentials = await vault.credentials();
  mockTool = 'recover';
  const screen = render(<AccountToolRoute />);
  const transfer = () =>
    screen.getByRole('button', { name: 'Transfer from another device' });
  const transferRequests = () =>
    fetcher.mock.calls.filter(([url]) => url.toString().endsWith('/transfers'));
  fireEvent.press(transfer());
  expect(
    screen.getByText(/Transfer an account from another device/),
  ).toBeTruthy();
  expect(screen.queryByText('Transfer from another device')).toBeNull();
  expect(mockController.getSnapshot().account).toEqual(original);
  expect(transferRequests()).toHaveLength(0);
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(transfer()).toBeEnabled();
  expect(mockController.getSnapshot().account).toEqual(original);
  expect(transferRequests()).toHaveLength(0);

  const recoveryInput = screen.getByLabelText('Recovery key');
  let release!: () => void;
  controls.holdRequest = {
    path: '/transfers',
    method: 'POST',
    gate: new Promise<void>((resolve) => {
      release = resolve;
    }),
  };
  try {
    fireEvent.press(transfer());
    fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(transferRequests()).toHaveLength(1));
    expect(screen.queryByText('Transfer from another device')).toBeNull();
    expect(screen.getByLabelText('Recovery key')).toBe(recoveryInput);
    expect(
      screen.getByText(/Transfer an account from another device/),
    ).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    expect(confirm.props.accessibilityState.busy).toBe(true);
    expect(
      screen.getByRole('progressbar', { name: 'Confirm in progress' }),
    ).toBeTruthy();
    expect(
      within(confirm).getByRole('progressbar', { name: 'Confirm in progress' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(
      screen.queryByRole('progressbar', {
        name: 'Transfer from another device in progress',
      }),
    ).toBeNull();
    expect(screen.queryByText(/Enter this transfer code/)).toBeNull();
    fireEvent.press(confirm);
    expect(transferRequests()).toHaveLength(1);
  } finally {
    await act(async () => release());
    await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  }
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  expect(screen.getByText('012345')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Transfer from another device' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry connection' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Start a new transfer' }),
  ).toBeEnabled();
  expect(screen.queryByLabelText('Recovery key')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Create a separate empty account' }),
  ).toBeNull();
  expect(await vault.credentials()).toEqual(
    expect.arrayContaining(originalCredentials),
  );
  let finishLists!: () => void;
  controls.holdRequest = {
    path: '/devices',
    method: 'GET',
    gate: new Promise<void>((resolve) => {
      finishLists = resolve;
    }),
  };
  try {
    fireEvent.press(
      screen.getByRole('button', { name: 'Check approval & finish' }),
    );
    await waitFor(() =>
      expect(mockController.getSnapshot().account?.userId).toBe(
        '30000000-0000-4000-8000-000000000004',
      ),
    );
    expect(mockController.getSnapshot().busy).toBe(true);
    expect(screen.queryByText('Redirect: /recovery')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  } finally {
    await act(async () => finishLists());
    await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  }
  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith('/recovery'),
  );
  expect(mockController.getSnapshot().account?.userId).toBe(
    '30000000-0000-4000-8000-000000000004',
  );
  expect(await vault.credentials()).toEqual(
    expect.arrayContaining(originalCredentials),
  );
  expect(mockRouter.replace).toHaveBeenCalledWith('/recovery');
});

it.each(['TRANSFER_PENDING', 'NETWORK', 'TRANSFER_EXPIRED'] as const)(
  'keeps recovery actions usable after %s without duplicate transfer controls',
  async (code) => {
    const { fetcher } = await connected();
    await mockController.startTransfer();
    mockTool = 'recover';
    const screen = render(<AccountToolRoute />);
    try {
      fetcher.mockRejectedValueOnce(new IdentityClientError(code));
      fireEvent.press(
        screen.getByRole('button', { name: 'Check approval & finish' }),
      );
      await waitFor(() =>
        expect(mockController.getSnapshot().busy).toBe(false),
      );
      expect(screen.getByText('012345')).toBeTruthy();
      expect(
        screen.getByText(
          code === 'TRANSFER_PENDING'
            ? /Waiting for approval/
            : code === 'NETWORK'
              ? /Couldn’t connect/
              : /This transfer expired/,
        ),
      ).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Transfer from another device' }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Retry connection' }),
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Start a new transfer' }),
      ).toBeEnabled();
      const finishing = screen.getByRole('button', {
        name: 'Check approval & finish',
      });
      expect(finishing).toBeEnabled();
      if (code !== 'TRANSFER_EXPIRED') {
        fireEvent.press(finishing);
        await waitFor(() =>
          expect(mockRouter.replace).toHaveBeenCalledWith('/recovery'),
        );
      } else {
        const previousTransferId = mockController.getSnapshot().transfer!.id;
        fireEvent.press(
          screen.getByRole('button', { name: 'Start a new transfer' }),
        );
        await waitFor(() =>
          expect(mockController.getSnapshot().busy).toBe(false),
        );
        expect(mockController.getSnapshot().transfer!.id).not.toBe(
          previousTransferId,
        );
        expect(screen.queryByText(/This transfer expired/)).toBeNull();
      }
    } finally {
      await act(async () => mockController.cancelTransfer());
      screen.unmount();
    }
  },
);

it.each(['failure', 'back'] as const)(
  'clears Confirm loading safely after %s during transfer start',
  async (outcome) => {
    const { controls, vault, fetcher } = await connected();
    const original = mockController.getSnapshot().account;
    let release!: () => void, reject!: (error: Error) => void;
    controls.holdRequest = {
      path: '/transfers',
      method: 'POST',
      gate: new Promise<void>((resolve, fail) => {
        release = resolve;
        reject = fail;
      }),
    };
    mockTool = 'recover';
    const screen = render(<AccountToolRoute />);
    try {
      fireEvent.press(
        screen.getByRole('button', { name: 'Transfer from another device' }),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() =>
        expect(
          fetcher.mock.calls.some(([url]) =>
            url.toString().endsWith('/transfers'),
          ),
        ).toBe(true),
      );
      expect(
        within(screen.getByRole('button', { name: 'Confirm' })).getByRole(
          'progressbar',
          { name: 'Confirm in progress' },
        ),
      ).toBeTruthy();
      if (outcome === 'failure') {
        await act(async () =>
          reject(new Error('Synthetic transfer start failure')),
        );
        await waitFor(() =>
          expect(screen.getByText(/Couldn’t connect/)).toBeTruthy(),
        );
        expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(
          screen.getByRole('button', { name: 'Transfer from another device' }),
        ).toBeEnabled();
        expect(
          screen.getByRole('button', { name: 'Retry connection' }),
        ).toBeEnabled();
      } else {
        fireEvent.press(screen.getByRole('button', { name: 'Back' }));
        expect(mockRouter.dismissTo).toHaveBeenCalledWith('/recovery');
        screen.unmount();
        await mockController.cancelTransfer();
        await act(async () => release());
        expect((await vault.read())!.pending).toBeNull();
        expect(mockController.getSnapshot().transfer).toBeNull();
      }
      expect(mockController.getSnapshot().account).toEqual(original);
    } finally {
      await act(async () => release());
      if (outcome === 'failure') screen.unmount();
      await mockController.cancelTransfer();
    }
  },
);

it('does not navigate for a late transfer result after leaving the recovery screen', async () => {
  const { controls, vault } = await connected();
  const original = mockController.getSnapshot().account;
  await mockController.startTransfer();
  mockTool = 'recover';
  const screen = render(<AccountToolRoute />);
  let release!: () => void;
  controls.holdRequest = {
    path: '/sessions',
    method: 'POST',
    gate: new Promise<void>((resolve) => {
      release = resolve;
    }),
  };
  try {
    fireEvent.press(
      screen.getByRole('button', { name: 'Check approval & finish' }),
    );
    await waitFor(() => expect(mockController.getSnapshot().busy).toBe(true));
    mockFocused = false;
    screen.rerender(<AccountToolRoute />);
  } finally {
    await act(async () => release());
    await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  }
  await mockController.cancelTransfer();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockController.getSnapshot().account).toEqual(original);
  expect((await vault.read())!.pending).toBeNull();
});

it.each(['back', 'focus loss'] as const)(
  'keeps the outgoing transfer screen stable after %s while cancellation finishes',
  async (exit) => {
    const { controls } = await connected();
    await mockController.startTransfer();
    let release!: () => void;
    controls.holdRequest = {
      path: `/transfers/${mockController.getSnapshot().transfer!.id}`,
      method: 'DELETE',
      gate: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    mockTool = 'recover';
    const screen = render(<AccountToolRoute />);
    try {
      const code = screen.getByText('012345');
      if (exit === 'back')
        fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      else {
        mockFocused = false;
        screen.rerender(<AccountToolRoute />);
      }
      await waitFor(() =>
        expect(mockController.getSnapshot().cancellationPending).toBe(true),
      );
      expect(screen.getByText('012345')).toBe(code);
      expect(
        screen.getByRole('button', { name: 'Check approval & finish' }),
      ).toBeDisabled();
      expect(screen.queryByLabelText('Recovery key')).toBeNull();
      expect(mockController.getSnapshot().transfer).toBeNull();
      await act(async () => {
        release();
        await mockController.cancelTransfer();
      });
      expect(screen.getByText('012345')).toBe(code);
    } finally {
      await act(async () => {
        release();
        await mockController.cancelTransfer();
      });
      screen.unmount();
    }
  },
);

it('hides outgoing transfer codes if the app backgrounds during navigation', async () => {
  await connected();
  let onState!: (state: AppStateStatus) => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      onState = listener;
      return { remove: jest.fn() };
    });
  await mockController.startTransfer();
  mockTool = 'recover';
  const screen = render(<AccountToolRoute />);
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('012345')).toBeTruthy();
    act(() => onState('inactive'));
    expect(screen.queryByText('012345')).toBeNull();
  } finally {
    await act(async () => mockController.cancelTransfer());
    screen.unmount();
  }
});

it('keeps the account hub quiet during cancellation and reports a settled cleanup failure', async () => {
  const { controls } = await connected();
  const screen = render(<RecoveryRoute />);
  const account = screen.getByText('Account');
  const recovery = screen.getByText('Recovery');
  const devices = screen.getByRole('header', { name: 'Devices' });
  await act(async () => mockController.startTransfer());
  let release!: () => void, reject!: (error: Error) => void;
  controls.holdRequest = {
    path: `/transfers/${mockController.getSnapshot().transfer!.id}`,
    method: 'DELETE',
    gate: new Promise<void>((resolve, fail) => {
      release = resolve;
      reject = fail;
    }),
  };
  try {
    act(() => {
      void mockController.cancelTransfer();
    });
    await waitFor(() =>
      expect(mockController.getSnapshot().cancellationPending).toBe(true),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      reject(new Error('Synthetic cancellation outage'));
      await mockController.cancelTransfer();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Server confirmation is pending/,
    );
    expect(screen.getByText('Account')).toBe(account);
    expect(screen.getByText('Recovery')).toBe(recovery);
    expect(screen.getByRole('header', { name: 'Devices' })).toBe(devices);
  } finally {
    controls.holdRequest = null;
    await act(async () => {
      release();
      await mockController.cancelTransfer();
      await mockController.retry();
    });
    screen.unmount();
  }
});

it.each(['back', 'focus loss', 'inactive', 'background', 'unmount'] as const)(
  'cancels an unfinished receiving transfer on %s and reopens the normal account hub',
  async (exit) => {
    const { vault, fetcher } = await connected();
    const original = mockController.getSnapshot().account;
    let appState: ((state: AppStateStatus) => void) | undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appState = listener;
        return { remove: jest.fn() };
      });
    await mockController.startTransfer();
    const pending = (await vault.read())!.pending;
    if (pending?.kind !== 'transfer')
      throw new Error('Missing transfer fixture');
    mockTool = 'recover';
    const screen = render(<AccountToolRoute />);
    expect(screen.getByText('012345')).toBeTruthy();
    if (exit === 'back') {
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/recovery');
    } else if (exit === 'focus loss') {
      mockFocused = false;
      screen.rerender(<AccountToolRoute />);
    } else if (exit === 'unmount') screen.unmount();
    else act(() => appState!(exit));
    await act(async () => {
      await mockController.cancelTransfer();
    });
    expect((await vault.read())!.pending).toBeNull();
    expect(mockController.getSnapshot().transfer).toBeNull();
    expect(mockController.getSnapshot().account).toEqual(original);
    expect(
      fetcher.mock.calls.filter(
        ([url, init]) =>
          url.toString().endsWith(`/transfers/${pending.input.id}`) &&
          init?.method === 'DELETE',
      ),
    ).toHaveLength(1);
    if (exit !== 'unmount') screen.unmount();
    mockFocused = true;
    const reopened = render(<RecoveryRoute />);
    expect(
      reopened.getByRole('link', { name: 'Move to another phone' }),
    ).toBeTruthy();
    expect(reopened.queryByText('012345')).toBeNull();
    reopened.unmount();
  },
);

it('keeps the connected account after a network error and retries its connection', async () => {
  const { fetcher } = await connected();
  fetcher.mockRejectedValueOnce(new Error('synthetic network failure'));
  mockTool = 'troubleshooting';
  const screen = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(screen.getByText(/Couldn’t connect/)).toBeTruthy(),
  );
  expect(screen.queryByText('Connecting securely…')).toBeNull();
  expect(mockController.getSnapshot().busyInBackground).toBe(false);
  expect(mockController.getSnapshot().account?.userId).toBe(userId);
  fireEvent.press(screen.getByRole('button', { name: 'Retry connection' }));
  await waitFor(() => expect(mockController.getSnapshot().busy).toBe(false));
  expect(screen.queryByText(/Couldn’t connect/)).toBeNull();
  expect(mockController.getSnapshot().account?.userId).toBe(userId);
});
