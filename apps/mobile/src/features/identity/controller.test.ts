import { z } from 'zod';
import { IdentityController } from './controller';
import { IdentityClientError, type IdentityApi } from './api';
import {
  createMemoryVault,
  type CredentialVault,
  type DeviceState,
} from './storage';

jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn(),
  randomUUID: jest.fn(),
}));
let sequence = 1;
const id = () =>
  `00000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, '0')}`;
const secret = () => (sequence++).toString(16).padStart(64, '0');
const random = { id, secret };
const expiry = () => new Date(Date.now() + 7 * 86400000).toISOString();
type Handler = (
  path: string,
  body: unknown,
  token?: string,
) => unknown | Promise<unknown>;
function api(handler: Handler): IdentityApi & { calls: jest.Mock } {
  const calls = jest.fn(handler);
  return {
    calls,
    request: async <T>(
      path: string,
      schema: z.ZodType<T>,
      body?: unknown,
      token?: string,
    ) => schema.parse(await calls(path, body, token)),
  };
}
function connected(handler?: Handler) {
  const userId = id();
  return api(async (path, body, token) => {
    if (handler) {
      const result = await handler(path, body, token);
      if (result !== undefined) return result;
    }
    if (path === '/devices') return { devices: [] };
    if (path === '/credentials' && body === undefined)
      return { credentials: [] };
    if (path === '/credentials') return { ok: true };
    const p = body as { deviceId: string; sessionId: string };
    return {
      userId,
      deviceId: p.deviceId,
      sessionId: p.sessionId,
      expiresAt: expiry(),
    };
  });
}
const nativeVault = (): CredentialVault => ({
  ...createMemoryVault(),
  kind: 'keychain',
});

it('persists intent and recovery secret before bootstrap, then retries a lost response with identical IDs', async () => {
  const vault = nativeVault();
  let attempts = 0;
  const server = connected(async (path, body) => {
    if (path === '/bootstrap') {
      expect((await vault.read())!.pending?.kind).toBe('bootstrap');
      expect((await vault.credentials())[0]!.secret).toBe(
        (body as { credential: string }).credential,
      );
      if (++attempts === 1) throw new IdentityClientError('NETWORK');
    }
  });
  const first = new IdentityController(vault, server, random);
  await first.initialize();
  expect(first.getSnapshot().account).toBeNull();
  expect(first.getSnapshot().hasPending).toBe(true);
  const relaunched = new IdentityController(vault, server, random);
  await relaunched.initialize();
  const requests = server.calls.mock.calls.filter(
    (call) => call[0] === '/bootstrap',
  );
  expect(requests).toHaveLength(2);
  expect(requests[0]![1]).toEqual(requests[1]![1]);
  expect(relaunched.getSnapshot().account).not.toBeNull();
});
it('does not create an account when secure storage is locked or a credential write fails', async () => {
  const server = connected();
  const locked: CredentialVault = {
    ...nativeVault(),
    read: async () => {
      throw Error('locked');
    },
  };
  const controller = new IdentityController(locked, server, random);
  await controller.initialize();
  expect(server.calls).not.toHaveBeenCalled();
  expect(controller.getSnapshot().message).toContain('Secure storage');
  const failing: CredentialVault = {
    ...nativeVault(),
    add: async () => {
      throw Error('locked');
    },
  };
  await new IdentityController(failing, server, random).initialize();
  expect(server.calls).not.toHaveBeenCalled();
});
it('resumes a stored bootstrap intent if interrupted before adding the Keychain item', async () => {
  const memory = nativeVault();
  let fail = true;
  const vault = {
    ...memory,
    add: async (value: Parameters<CredentialVault['add']>[0]) => {
      if (fail) throw Error('locked');
      await memory.add(value);
    },
  };
  const server = connected();
  await new IdentityController(vault, server, random).initialize();
  const intent = (await vault.read())!.pending;
  fail = false;
  const resumed = new IdentityController(vault, server, random);
  await resumed.initialize();
  expect(resumed.getSnapshot().account).not.toBeNull();
  expect(
    (
      server.calls.mock.calls.find((c) => c[0] === '/bootstrap')![1] as {
        sessionId: string;
      }
    ).sessionId,
  ).toBe(intent?.kind === 'bootstrap' ? intent.proposal.sessionId : null);
});
it('requires deliberate selection for multiple synchronized credentials and preserves them all', async () => {
  const vault = nativeVault();
  const first = { id: id(), secret: secret() },
    second = { id: id(), secret: secret() };
  await vault.add(first);
  await vault.add(second);
  const server = connected();
  const controller = new IdentityController(vault, server, random);
  await controller.initialize();
  expect(server.calls).not.toHaveBeenCalled();
  expect(controller.getSnapshot().credentials).toHaveLength(2);
  await controller.recoverCredential(first.id);
  expect(server.calls.mock.calls[0]![0]).toBe('/recover');
  expect(await vault.credentials()).toHaveLength(2);
});
it('a rejected credential never falls back to bootstrap or a different account', async () => {
  const vault = nativeVault();
  await vault.add({ id: id(), secret: secret() });
  const server = api(() => {
    throw new IdentityClientError('CREDENTIAL_REJECTED');
  });
  const controller = new IdentityController(vault, server, random);
  await controller.initialize();
  await controller.retry();
  expect(server.calls.mock.calls.map((c) => c[0])).toEqual([
    '/recover',
    '/recover',
  ]);
  expect(controller.getSnapshot().account).toBeNull();
});
it('late iCloud credentials cannot replace the active account on refresh', async () => {
  const vault = nativeVault();
  const server = connected((path) => (path === '/me' ? info : undefined));
  const controller = new IdentityController(vault, server, random);
  await controller.initialize();
  const info = controller.getSnapshot().account;
  await vault.add({ id: id(), secret: secret() });
  await controller.refresh();
  expect(controller.getSnapshot().account).toEqual(info);
  expect(controller.getSnapshot().credentials).toHaveLength(2);
  expect(
    server.calls.mock.calls.filter((c) => c[0] === '/recover'),
  ).toHaveLength(0);
});
it('coordinates concurrent renewal and preserves a pending rotation across a lost response', async () => {
  const vault = nativeVault();
  let failures = 1;
  let deviceId = '';
  const server = connected(async (path, body) => {
    if (path === '/renew') {
      deviceId = (await vault.read())!.deviceId;
      if (failures-- > 0) throw new IdentityClientError('NETWORK');
      return {
        ...(await vault.read())!.session!.info,
        deviceId,
        sessionId: (body as { sessionId: string }).sessionId,
        expiresAt: expiry(),
      };
    }
  });
  const controller = new IdentityController(vault, server, random);
  await controller.initialize();
  const old = (await vault.read())!.session!.token;
  await Promise.all([controller.renew(), controller.renew()]);
  await controller.retry();
  const renewals = server.calls.mock.calls.filter((c) => c[0] === '/renew');
  expect(renewals).toHaveLength(2);
  expect(renewals[0]![1]).toEqual(renewals[1]![1]);
  expect(renewals[0]![2]).toBe(old);
  expect((await vault.read())!.session!.token).not.toBe(old);
});
it('a revoked session stays unverified until explicit recovery with a new device identity', async () => {
  const vault = nativeVault();
  const server = connected((path) => {
    if (path === '/me') throw new IdentityClientError('SESSION_REVOKED');
  });
  const controller = new IdentityController(vault, server, random);
  await controller.initialize();
  const old = (await vault.read())!;
  await controller.refresh();
  expect(controller.getSnapshot().account).toBeNull();
  expect(
    server.calls.mock.calls.filter((c) => c[0] === '/recover'),
  ).toHaveLength(0);
  await controller.recoverCredential(old.selectedId!);
  expect((await vault.read())!.deviceId).not.toBe(old.deviceId);
  expect(controller.getSnapshot().account).not.toBeNull();
});
it('keeps state unverified when a successful response cannot be saved; retry keeps the same proposal', async () => {
  const memory = nativeVault();
  let fail = true;
  const vault = {
    ...memory,
    write: async (value: DeviceState) => {
      if (value.session && fail) throw Error('locked');
      await memory.write(value);
    },
  };
  const server = connected();
  const controller = new IdentityController(vault, server, random);
  await controller.initialize();
  expect(controller.getSnapshot().account).toBeNull();
  fail = false;
  await controller.retry();
  const calls = server.calls.mock.calls.filter((c) => c[0] === '/bootstrap');
  expect(calls[0]![1]).toEqual(calls[1]![1]);
  expect(controller.getSnapshot().account).not.toBeNull();
});
it('browser preview is opt-in and has no persisted account after a new vault is created', async () => {
  const server = connected();
  const controller = new IdentityController(
    createMemoryVault(),
    server,
    random,
  );
  await controller.initialize();
  expect(server.calls).not.toHaveBeenCalled();
  await controller.createAccount();
  expect(controller.getSnapshot().account).not.toBeNull();
  expect(await createMemoryVault().read()).toBeNull();
});

it('can replace a recovery key revoked from another device without reusing the revoked secret', async () => {
  const vault = nativeVault();
  const keys: {
    id: string;
    kind: 'key';
    createdAt: string;
    revokedAt: string | null;
  }[] = [];
  const server = connected((path, body) => {
    if (path === '/credentials' && body === undefined)
      return { credentials: keys };
    if (path === '/credentials') {
      const input = body as { id: string };
      if (!keys.some((key) => key.id === input.id))
        keys.push({
          id: input.id,
          kind: 'key',
          createdAt: new Date().toISOString(),
          revokedAt: null,
        });
      return { ok: true };
    }
  });
  const controller = new IdentityController(vault, server, random);
  await controller.initialize();
  await controller.saveKey();
  const first = controller.getSnapshot().key;
  keys[0]!.revokedAt = new Date().toISOString();
  await controller.saveKey();
  expect(controller.getSnapshot().key).not.toBe(first);
  expect(controller.getSnapshot().key).not.toBeNull();
  expect(keys).toHaveLength(2);
});
