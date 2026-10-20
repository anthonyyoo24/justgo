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
  removeCredential: jest.fn(),
};
const originalPlatform = Platform.OS;
beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
  native.readState.mockResolvedValue(JSON.stringify(state));
  native.listCredentials.mockResolvedValue([credential]);
  native.removeCredential.mockResolvedValue(undefined);
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

it.each(['pending', 'cleanup', 'deleted'] as const)(
  'preserves %s deletion state together with newer phone-transfer metadata',
  async (stage) => {
    const stored = {
      ...state,
      accountDeleted: stage === 'deleted',
      pending:
        stage === 'deleted'
          ? null
          : {
              kind: 'delete',
              userId: state.deviceId,
              receipt:
                stage === 'pending'
                  ? null
                  : {
                      userId: state.deviceId,
                      deletedAt: '2026-10-14T10:00:00.000Z',
                      credentialDigests: [credential.secret],
                    },
            },
      ignoredCredentialIds: [credential.id],
      cancelledTransfers: [
        {
          kind: 'transfer',
          credentialId: credential.id,
          input: {
            id: credential.id,
            deviceId: state.deviceId,
            sessionId: credential.id,
            sessionToken: credential.secret,
            credential: credential.secret,
            code: 'ABCDEF0123456789',
            claimSecret: credential.secret,
          },
        },
      ],
    };
    native.readState.mockResolvedValue(JSON.stringify(stored));
    const vault = createVault();
    const restored = await vault.read();
    expect(restored).toEqual(stored);
    await vault.write(restored!);
    expect(JSON.parse(native.writeState.mock.calls[0]![0])).toEqual(stored);
  },
);

it.each([
  { ignoredCredentialIds: ['invalid'] },
  { cancelledTransfers: [{ kind: 'transfer', credentialId: credential.id }] },
])('rejects malformed recovery metadata %p', async (metadata) => {
  native.readState.mockResolvedValue(JSON.stringify({ ...state, ...metadata }));
  await expect(createVault().read()).rejects.toThrow();
});

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
it('removes only a validated credential and detects older binaries before deletion', async () => {
  const vault = createVault();
  await vault.remove!(credential.id);
  expect(native.removeCredential).toHaveBeenCalledWith(credential.id);
  await expect(vault.remove!('invalid')).rejects.toThrow();
  native.removeCredential.mockRejectedValueOnce(new Error('Keychain locked'));
  await expect(vault.remove!(credential.id)).rejects.toThrow('Keychain locked');
  jest
    .mocked(requireOptionalNativeModule)
    .mockReturnValue({ ...native, removeCredential: undefined });
  expect(createVault().remove).toBeUndefined();
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

function legacyBootstrapState() {
  return {
    ...state,
    selectedId: credential.id,
    accountDeleted: false,
    ignoredCredentialIds: [credential.id],
    cancelledTransfers: [],
    savedKey: { ...credential, registered: true },
    registration: credential,
    pending: {
      kind: 'bootstrap' as const,
      credentialId: credential.id,
      secret: credential.secret,
      proposal: {
        deviceId: state.deviceId,
        sessionId: '00000000-0000-4000-8000-000000000002',
        sessionToken: 'b'.repeat(64),
      },
      acceptance: {
        termsVersion: 'legacy-unused',
        privacyVersion: 'legacy-unused',
        analyticsScopeVersion: 'legacy-unused',
      },
    },
  };
}

it('removes only legacy bootstrap legal metadata and durably preserves the original recovery proof', async () => {
  const stored = legacyBootstrapState();
  native.readState.mockResolvedValue(JSON.stringify(stored));
  const clean = {
    ...stored,
    pending: {
      kind: stored.pending.kind,
      credentialId: stored.pending.credentialId,
      secret: stored.pending.secret,
      proposal: stored.pending.proposal,
    },
  };
  const vault = createVault();
  await expect(vault.read()).resolves.toEqual(clean);
  expect(native.writeState).toHaveBeenCalledTimes(1);
  expect(JSON.parse(native.writeState.mock.calls[0]![0])).toEqual(clean);
  await expect(vault.credentials()).resolves.toEqual([credential]);
  expect(native.addCredential).not.toHaveBeenCalled();
  expect(native.removeCredential).not.toHaveBeenCalled();
});

it('fails safely when stripping legacy legal metadata cannot be persisted, then retries without changing credentials', async () => {
  const stored = legacyBootstrapState();
  const locked = new Error('Keychain locked');
  native.readState.mockResolvedValue(JSON.stringify(stored));
  native.writeState.mockRejectedValueOnce(locked);
  const vault = createVault();
  await expect(vault.read()).rejects.toBe(locked);
  expect(native.addCredential).not.toHaveBeenCalled();
  expect(native.removeCredential).not.toHaveBeenCalled();
  await expect(vault.credentials()).resolves.toEqual([credential]);
  const clean = await vault.read();
  expect(clean?.pending).not.toHaveProperty('acceptance');
  expect(clean?.pending).toMatchObject({
    credentialId: stored.pending.credentialId,
    secret: stored.pending.secret,
    proposal: stored.pending.proposal,
  });
  expect(native.writeState).toHaveBeenCalledTimes(2);
  expect(native.writeState.mock.calls[0]![0]).toBe(
    native.writeState.mock.calls[1]![0],
  );
});

it('leaves a clean bootstrap proof unchanged without another native write', async () => {
  const stored = legacyBootstrapState();
  const clean = {
    ...stored,
    pending: {
      kind: stored.pending.kind,
      credentialId: stored.pending.credentialId,
      secret: stored.pending.secret,
      proposal: stored.pending.proposal,
    },
  };
  native.readState.mockResolvedValue(JSON.stringify(clean));
  await expect(createVault().read()).resolves.toEqual(clean);
  expect(native.writeState).not.toHaveBeenCalled();
});

it('does not rewrite a recovery intent or replace its device proof', async () => {
  const stored = legacyBootstrapState();
  const recovery = {
    ...stored,
    pending: {
      kind: 'recover',
      credentialId: credential.id,
      proposal: stored.pending.proposal,
    },
  };
  native.readState.mockResolvedValue(JSON.stringify(recovery));
  await expect(createVault().read()).resolves.toEqual(recovery);
  expect(native.writeState).not.toHaveBeenCalled();
  expect(native.removeCredential).not.toHaveBeenCalled();
});
