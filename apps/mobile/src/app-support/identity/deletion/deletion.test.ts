import { createHash } from 'node:crypto';
import { z } from 'zod';
import { IdentityController } from '../controller';
import {
  createMemoryVault,
  type CredentialVault,
  type TransferIntent,
} from '../storage';
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
it.each([
  ['NOT_FOUND', 'Account deletion is unavailable right now.'],
  ['INVALID_REQUEST', 'The deletion request could not be accepted.'],
] as const)(
  'preserves the connected account when deletion returns %s',
  async (code, message) => {
    const s = setup();
    await s.controller.initialize();
    const session = s.controller.currentSession();
    const credentials = await s.vault.credentials();
    const disconnectedStates: boolean[] = [];
    const unsubscribe = s.controller.subscribe(() => {
      const state = s.controller.getSnapshot();
      disconnectedStates.push(!state.account && state.deletionStatus === null);
    });
    s.deletion.mockRejectedValueOnce(new IdentityClientError(code));
    await s.controller.deleteAccount();
    unsubscribe();
    expect(disconnectedStates).not.toContain(true);
    expect(s.controller.getSnapshot()).toMatchObject({
      account: { userId: s.userId },
      deletionStatus: null,
      hasPending: false,
    });
    expect(s.controller.getSnapshot().message).toContain(message);
    expect(s.controller.getSnapshot().message).toContain(
      'Your account has not been deleted.',
    );
    expect(s.controller.currentSession()).toEqual(session);
    expect(await s.vault.credentials()).toEqual(credentials);
    expect(await s.vault.read()).toMatchObject({
      pending: null,
      accountDeleted: false,
    });
    expect(s.remove).not.toHaveBeenCalled();
    const reopened = new IdentityController(s.vault, s.api, { id, secret });
    reopened.setAccountDataRemover(s.remove);
    await reopened.initialize();
    expect(reopened.getSnapshot().account?.userId).toBe(s.userId);
    expect(s.deletion).toHaveBeenCalledTimes(1);
  },
);
it('restores the saved account when a pending deletion is rejected after relaunch', async () => {
  const s = setup();
  await s.controller.initialize();
  const session = s.controller.currentSession();
  s.deletion.mockRejectedValueOnce(new IdentityClientError('NETWORK'));
  await s.controller.deleteAccount();
  s.deletion.mockRejectedValueOnce(new IdentityClientError('NOT_FOUND'));
  const reopened = new IdentityController(s.vault, s.api, { id, secret });
  reopened.setAccountDataRemover(s.remove);
  await reopened.initialize();
  expect(reopened.currentSession()).toEqual(session);
  expect(reopened.getSnapshot()).toMatchObject({
    deletionStatus: null,
    hasPending: false,
  });
  expect(reopened.getSnapshot().message).toContain(
    'Account deletion is unavailable',
  );
  expect(s.remove).not.toHaveBeenCalled();
});
it('does not restore access if the saved session was revoked after a rejected deletion', async () => {
  const s = setup();
  await s.controller.initialize();
  s.deletion.mockRejectedValueOnce(new IdentityClientError('NOT_FOUND'));
  const calls = s.calls.getMockImplementation()!;
  s.calls.mockImplementation(async (method, path, body, token) => {
    if (path === '/sessions/current' && s.deletion.mock.calls.length)
      throw new IdentityClientError('SESSION_REVOKED');
    return calls(method, path, body, token);
  });
  await s.controller.deleteAccount();
  expect(s.controller.currentSession()).toBeNull();
  expect(s.controller.getSnapshot().message).toContain('session was revoked');
  expect(s.remove).not.toHaveBeenCalled();
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

const abandonedTransfer = (): TransferIntent => ({
  kind: 'transfer',
  credentialId: id(),
  input: {
    id: id(),
    deviceId: id(),
    sessionId: id(),
    sessionToken: secret(),
    credential: secret(),
    code: 'ABCDEF0123456789',
    claimSecret: secret(),
  },
});

it.each(['pending', 'cleanup'] as const)(
  'resumes %s deletion before reconciling unrelated abandoned transfers',
  async (stage) => {
    const s = setup();
    await s.controller.initialize();
    if (stage === 'pending')
      s.deletion.mockRejectedValueOnce(new IdentityClientError('NETWORK'));
    else s.remove.mockRejectedValueOnce(new Error('Synthetic cleanup failure'));
    await s.controller.deleteAccount();
    const cancelled = abandonedTransfer();
    await s.vault.write({
      ...(await s.vault.read())!,
      cancelledTransfers: [cancelled],
      ignoredCredentialIds: [cancelled.credentialId],
    });
    const reopened = new IdentityController(s.vault, s.api, { id, secret });
    reopened.setAccountDataRemover(s.remove);
    await reopened.initialize();
    expect(reopened.getSnapshot()).toMatchObject({
      deletionStatus: 'deleted',
      account: null,
    });
    expect(s.deletion).toHaveBeenCalledTimes(stage === 'pending' ? 2 : 1);
    expect(
      s.calls.mock.calls.some(([, path]) => path.startsWith('/transfers/')),
    ).toBe(false);
    expect(await s.vault.read()).toMatchObject({
      accountDeleted: true,
      pending: null,
      cancelledTransfers: [cancelled],
      ignoredCredentialIds: [cancelled.credentialId],
    });
    const before = s.calls.mock.calls.length;
    await reopened.retry({ background: true });
    expect(s.calls).toHaveBeenCalledTimes(before);
  },
);

it('retries the saved replacement bootstrap before unrelated cancellation reconciliation', async () => {
  const s = setup();
  await s.controller.initialize();
  await s.controller.deleteAccount();
  const replacementOwner = id();
  const calls = s.calls.getMockImplementation()!;
  let failing = true;
  s.calls.mockImplementation(async (method, path, body, token) => {
    if (path === '/sessions') {
      if (failing) throw new IdentityClientError('NETWORK');
      const proposal = body as { deviceId: string; sessionId: string };
      return {
        userId: replacementOwner,
        deviceId: proposal.deviceId,
        sessionId: proposal.sessionId,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
    }
    return calls(method, path, body, token);
  });
  await s.controller.createAccount();
  const pending = (await s.vault.read())!.pending;
  expect(pending?.kind).toBe('bootstrap');
  const cancelled = abandonedTransfer();
  await s.vault.write({
    ...(await s.vault.read())!,
    cancelledTransfers: [cancelled],
  });
  failing = false;
  const reopened = new IdentityController(s.vault, s.api, { id, secret });
  await reopened.initialize();
  expect(reopened.getSnapshot()).toMatchObject({
    account: { userId: replacementOwner },
    deletionStatus: null,
  });
  const attempts = s.calls.mock.calls.filter(
    ([, path]) => path === '/sessions',
  );
  expect(attempts.at(-1)![2]).toEqual(attempts.at(-2)![2]);
  expect(
    s.calls.mock.calls.some(([, path]) => path.startsWith('/transfers/')),
  ).toBe(false);
  expect(await s.vault.read()).toMatchObject({
    accountDeleted: false,
    pending: null,
    cancelledTransfers: [cancelled],
  });
});
