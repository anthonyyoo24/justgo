import { AppState } from 'react-native';
import type { LinkProps } from 'expo-router';
import RecoverAccountRoute from '../../src/app/account/recover';
import RecoveryKeysRoute from '../../src/app/account/keys';
import DevicesRoute from '../../src/app/account/devices';
import TransferAccountRoute from '../../src/app/account/transfer';
import AccountTroubleshootingRoute from '../../src/app/account/troubleshooting';
import { IdentityController } from '../../src/app-support/identity/controller';
import { createIdentityApi } from '../../src/app-support/identity/api';
import { createMemoryVault } from '../../src/app-support/identity/storage';

let mockController: IdentityController;
let mockTool = 'keys';
const accountRoutes = {
  recover: RecoverAccountRoute,
  keys: RecoveryKeysRoute,
  devices: DevicesRoute,
  transfer: TransferAccountRoute,
  troubleshooting: AccountTroubleshootingRoute,
};
function AccountToolRoute() {
  const Route = accountRoutes[mockTool as keyof typeof accountRoutes];
  return <Route />;
}
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
jest.mock('../../src/app-support/providers/AppProvider', () => {
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
jest.mock('../../src/app-support/identity/vault', () => ({
  createVault: jest.fn(),
}));
jest.mock('../../src/platform/toast/Toast', () => ({
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
      return {
        headers: new Headers({ 'Content-Type': 'application/json' }),
        ok: true,
        json: async () => result,
      } as Response;
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
export const harness = {
  get mockController() {
    return mockController;
  },
  set mockController(value: typeof mockController) {
    mockController = value;
  },
  get mockTool() {
    return mockTool;
  },
  set mockTool(value: typeof mockTool) {
    mockTool = value;
  },
  get mockFocused() {
    return mockFocused;
  },
  set mockFocused(value: typeof mockFocused) {
    mockFocused = value;
  },
  get mockRouter() {
    return mockRouter;
  },
};
export { connected, otherDeviceId, userId, AccountToolRoute };
