import { createManagedIdentityController } from './create-managed-identity';
import { ManagedIdentityController } from './managed-controller';

jest.mock('./managed-controller', () => ({
  ManagedIdentityController: jest.fn(),
}));
jest.mock('./managed-auth', () => ({ createManagedAuth: () => ({}) }));
jest.mock('./managed-state', () => ({
  createManagedIdentityStorage: () => ({}),
}));
jest.mock('../../../platform/auth/auth-storage', () => ({
  createAuthStorage: () => ({}),
}));
jest.mock('../vault', () => ({ createVault: () => ({}) }));
jest.mock('../api', () => ({ createIdentityApi: () => ({}) }));

const originalFlag = process.env.EXPO_PUBLIC_JUSTGO_DEV_DIAGNOSTICS;
const originalContainer = process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER;
const originalDev = __DEV__;
afterEach(() => {
  if (originalFlag === undefined)
    delete process.env.EXPO_PUBLIC_JUSTGO_DEV_DIAGNOSTICS;
  else process.env.EXPO_PUBLIC_JUSTGO_DEV_DIAGNOSTICS = originalFlag;
  if (originalContainer === undefined)
    delete process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER;
  else process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER = originalContainer;
  Object.defineProperty(global, '__DEV__', {
    value: originalDev,
    writable: true,
    configurable: true,
  });
  jest.clearAllMocks();
});
it.each([
  [true, '1', 'iCloud.com.anthonyyoo.justgo.dev', true],
  [false, '1', 'iCloud.com.anthonyyoo.justgo.dev', false],
  [true, undefined, 'iCloud.com.anthonyyoo.justgo.dev', false],
  [true, '1', 'iCloud.com.anthonyyoo.justgo', false],
  [true, 'false', 'iCloud.com.anthonyyoo.justgo.dev', false],
])(
  'gates local connection references with dev=%s flag=%s container=%s',
  (development, flag, container, expected) => {
    Object.defineProperty(global, '__DEV__', {
      value: development,
      writable: true,
      configurable: true,
    });
    // Expo's virtual env captures this object at import time; keep its identity.
    process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER = container;
    if (flag === undefined)
      delete process.env.EXPO_PUBLIC_JUSTGO_DEV_DIAGNOSTICS;
    else process.env.EXPO_PUBLIC_JUSTGO_DEV_DIAGNOSTICS = flag;
    createManagedIdentityController('https://api.example');
    expect(
      jest.mocked(ManagedIdentityController).mock.calls[0]?.[0]
        .connectionDiagnostics,
    ).toBe(expected);
  },
);
