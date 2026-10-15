import { createHash } from 'node:crypto';
import { z } from 'zod';
import { IdentityController } from '../controller';
import { createMemoryVault, type CredentialVault } from '../storage';
import { IdentityClientError, type IdentityApi } from '../api';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) => {
    const { createHash } =
      require('node:crypto') as typeof import('node:crypto');
    return createHash('sha256').update(value).digest('hex');
  },
  randomUUID: jest.fn(),
  getRandomValues: jest.fn(),
}));
let sequence = 1;
const id = () =>
  `00000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, '0')}`;
const secret = () => (sequence++).toString(16).padStart(64, '0');
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function setup(
  vault: CredentialVault = { ...createMemoryVault(), kind: 'keychain' },
) {
  const userId = id();
  let info: {
    userId: string;
    deviceId: string;
    sessionId: string;
    expiresAt: string;
  };
  let credential = '';
  const remove = jest.fn(async () => {});
  const deletion = jest.fn(async () => ({
    userId,
    deletedAt: '2026-10-14T10:00:00.000Z',
    credentialDigests: [hash(credential)],
  }));
  const calls = jest.fn(
    async (method: string, path: string, body?: unknown, token?: string) => {
      if (path === '/account') {
        expect(method).toBe('DELETE');
        expect(token).toBeTruthy();
        return deletion();
      }
      if (path === '/devices') return { devices: [] };
      if (path === '/credentials') return { credentials: [] };
      if (path === '/sessions/current') return info;
      const input = body as {
        credential: string;
        deviceId: string;
        sessionId: string;
      };
      credential = input.credential;
      info = {
        userId,
        deviceId: input.deviceId,
        sessionId: input.sessionId,
        expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
      };
      return info;
    },
  );
  const api: IdentityApi = {
    request: async <T>(
      method: string,
      path: string,
      schema: z.ZodType<T>,
      body?: unknown,
      token?: string,
    ) => schema.parse(await calls(method, path, body, token)),
  };
  const controller = new IdentityController(vault, api, { id, secret });
  controller.setAccountDataRemover(remove);
  return { controller, vault, calls, deletion, remove, api, userId };
}
it('confirms once, clears only matching credentials and prevents automatic account recreation after relaunch', async () => {
  const s = setup();
  await s.controller.initialize();
  const other = { id: id(), secret: secret() };
  await s.vault.add(other);
  const recoveryMetadata = {
    ignoredCredentialIds: [other.id],
    cancelledTransfers: [],
  };
  await s.vault.write({ ...(await s.vault.read())!, ...recoveryMetadata });
  s.controller = new IdentityController(s.vault, s.api, { id, secret });
  s.controller.setAccountDataRemover(s.remove);
  await s.controller.initialize();
  await Promise.all([
    s.controller.deleteAccount(),
    s.controller.deleteAccount(),
  ]);
  expect(s.deletion).toHaveBeenCalledTimes(1);
  expect(s.remove).toHaveBeenCalledWith(s.userId);
  expect(await s.vault.credentials()).toEqual([other]);
  expect(await s.vault.read()).toMatchObject({
    ...recoveryMetadata,
    accountDeleted: true,
    session: null,
    pending: null,
    selectedId: null,
    savedKey: null,
    registration: null,
  });
  expect(s.controller.getSnapshot()).toMatchObject({
    deletionStatus: 'deleted',
    account: null,
  });
  const reopened = new IdentityController(s.vault, s.api, { id, secret });
  const before = s.calls.mock.calls.length;
  await reopened.initialize();
  expect(s.calls.mock.calls).toHaveLength(before);
  expect(reopened.getSnapshot().deletionStatus).toBe('deleted');
  await reopened.createAccount();
  expect(reopened.getSnapshot().deletionStatus).toBeNull();
  expect((await s.vault.read())?.accountDeleted).toBe(false);
});
it('persists an uncertain request, disconnects uploads and resumes the same proof after restart', async () => {
  const s = setup();
  await s.controller.initialize();
  const token = s.controller.currentSession()!.token;
  s.deletion.mockRejectedValueOnce(new IdentityClientError('NETWORK'));
  await s.controller.deleteAccount();
  expect(s.controller.currentSession()).toBeNull();
  expect((await s.vault.read())?.pending).toMatchObject({
    kind: 'delete',
    receipt: null,
  });
  const reopened = new IdentityController(s.vault, s.api, { id, secret });
  reopened.setAccountDataRemover(s.remove);
  await reopened.initialize();
  expect(reopened.getSnapshot().deletionStatus).toBe('deleted');
  expect(
    s.calls.mock.calls
      .filter((call) => call[1] === '/account')
      .map((call) => call[3]),
  ).toEqual([token, token]);
});
it('retains confirmed cleanup across storage failure, blocks account replacement and retries without another delete', async () => {
  const s = setup();
  await s.controller.initialize();
  s.remove.mockRejectedValueOnce(new Error('fixture storage failure'));
  await s.controller.deleteAccount();
  expect(s.controller.getSnapshot().deletionStatus).toBe('cleanup');
  expect((await s.vault.read())?.pending).toMatchObject({
    kind: 'delete',
    receipt: { userId: s.userId },
  });
  await s.controller.createAccount();
  expect(s.controller.getSnapshot().account).toBeNull();
  await s.controller.retry();
  expect(s.deletion).toHaveBeenCalledTimes(1);
  expect(s.controller.getSnapshot().deletionStatus).toBe('deleted');
});
it('does not send deletion from a native binary that cannot erase credentials', async () => {
  const vault: CredentialVault = { ...createMemoryVault(), kind: 'keychain' };
  delete vault.remove;
  const s = setup(vault);
  await s.controller.initialize();
  await s.controller.deleteAccount();
  expect(s.deletion).not.toHaveBeenCalled();
  expect(s.controller.getSnapshot().account?.userId).toBe(s.userId);
  expect(s.controller.getSnapshot().message).toContain('Update JustGO');
});
it('keeps local data on a definitive server rejection and rejects a receipt for another account', async () => {
  const s = setup();
  await s.controller.initialize();
  s.deletion.mockRejectedValueOnce(new IdentityClientError('SESSION_REVOKED'));
  await s.controller.deleteAccount();
  expect((await s.vault.read())?.pending).toBeNull();
  expect(s.remove).not.toHaveBeenCalled();
  const other = setup();
  await other.controller.initialize();
  other.deletion.mockResolvedValueOnce({
    userId: id(),
    deletedAt: '2026-10-14T10:00:00.000Z',
    credentialDigests: [],
  });
  await other.controller.deleteAccount();
  expect(other.remove).not.toHaveBeenCalled();
  expect(other.controller.getSnapshot().deletionStatus).toBe('pending');
});
