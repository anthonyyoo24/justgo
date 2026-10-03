import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { createVault } from './vault';
import { type DeviceState } from './storage';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));
const state: DeviceState = {
  deviceId: '00000000-0000-4000-8000-000000000001',
  selectedId: null,
  session: null,
  pending: null,
  savedKey: null,
  registration: null,
};
const credential = { id: state.deviceId, secret: 'a'.repeat(64) };
const native = {
  readState: jest.fn(),
  writeState: jest.fn(),
  listCredentials: jest.fn(),
  addCredential: jest.fn(),
};
const originalPlatform = Platform.OS;
beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
  native.readState.mockResolvedValue(JSON.stringify(state));
  native.listCredentials.mockResolvedValue([credential]);
});
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalPlatform });
});

it('reads and writes validated payloads using the native Keychain module', async () => {
  const vault = createVault();
  expect(vault.kind).toBe('keychain');
  expect(requireOptionalNativeModule).toHaveBeenCalledWith('JustGoKeychain');
  await expect(vault.read()).resolves.toEqual(state);
  await vault.write(state);
  expect(native.writeState).toHaveBeenCalledWith(JSON.stringify(state));
  await expect(vault.credentials()).resolves.toEqual([credential]);
  await vault.add(credential);
  expect(native.addCredential).toHaveBeenCalledWith(
    credential.id,
    credential.secret,
  );
  native.readState.mockResolvedValue(null);
  await expect(vault.read()).resolves.toBeNull();
});

it.each(['not json', '{}', JSON.stringify({ ...state, unexpected: true })])(
  'rejects corrupted saved state %s',
  async (payload) => {
    native.readState.mockResolvedValue(payload);
    await expect(createVault().read()).rejects.toThrow();
  },
);

it('rejects invalid writes and credential payloads before calling native code', async () => {
  const vault = createVault();
  await expect(
    vault.write({ ...state, deviceId: 'invalid' }),
  ).rejects.toThrow();
  expect(native.writeState).not.toHaveBeenCalled();
  await expect(vault.add({ ...credential, secret: 'short' })).rejects.toThrow();
  expect(native.addCredential).not.toHaveBeenCalled();
  native.listCredentials.mockResolvedValue([
    { ...credential, secret: 'short' },
  ]);
  await expect(vault.credentials()).rejects.toThrow();
});

it('fails explicitly when a native build lacks the module', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  const vault = createVault();
  for (const action of [
    () => vault.read(),
    () => vault.write(state),
    () => vault.credentials(),
    () => vault.add(credential),
  ]) {
    await expect(action()).rejects.toThrow('updated iOS development build');
  }
});

it('propagates native read/write/list/add failures to the identity recovery boundary', async () => {
  const locked = new Error('Keychain locked');
  for (const method of Object.values(native)) method.mockRejectedValue(locked);
  const vault = createVault();
  for (const action of [
    () => vault.read(),
    () => vault.write(state),
    () => vault.credentials(),
    () => vault.add(credential),
  ]) {
    await expect(action()).rejects.toBe(locked);
  }
});

it('uses an isolated, nonpersistent, validated vault on web without loading native code', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'web' });
  const vault = createVault();
  expect(vault.kind).toBe('memory');
  await expect(vault.read()).resolves.toBeNull();
  await vault.write(state);
  await vault.add(credential);
  await vault.add(credential);
  const read = (await vault.read())!;
  read.selectedId = credential.id;
  const listed = await vault.credentials();
  listed[0]!.secret = 'changed';
  await expect(vault.read()).resolves.toEqual(state);
  await expect(vault.credentials()).resolves.toEqual([credential]);
  await expect(
    vault.add({ ...credential, secret: 'b'.repeat(64) }),
  ).rejects.toThrow('collision');
  await expect(vault.add({ ...credential, id: 'invalid' })).rejects.toThrow();
  await expect(createVault().read()).resolves.toBeNull();
  await expect(createVault().credentials()).resolves.toEqual([]);
  expect(requireOptionalNativeModule).not.toHaveBeenCalled();
});
