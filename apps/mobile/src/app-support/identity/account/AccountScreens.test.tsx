import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  ActivityIndicator,
  AppState,
  Linking,
  type AppStateStatus,
} from 'react-native';
import type { LinkProps } from 'expo-router';
import RecoveryRoute from '../../../app/recovery';
import AccountToolRoute from '../../../app/account/[tool]';
import { IdentityController } from '../controller';
import { createIdentityApi } from '../api';
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
  push: jest.fn(),
};
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    useRouter: () => mockRouter,
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
        session = {
          userId,
          deviceId: body.deviceId ?? session.deviceId,
          sessionId: body.sessionId,
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
      } else if (path === '/transfer-inspections')
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
    createMemoryVault(),
    createIdentityApi('http://localhost:3000', fetcher as typeof fetch),
    {
      id: () =>
        `10000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
      secret: () => 'a'.repeat(64),
    },
  );
  await mockController.initialize();
  await mockController.createAccount();
  return { fetcher, controls };
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
