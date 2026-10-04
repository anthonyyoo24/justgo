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

it('requires user-entered verification, preserves a rejected inspection and clears it after approval', async () => {
  const inspection = { id: id(), expiresAt: expiry(), status: 'waiting' };
  const code = 'ABCDEF0123456789';
  const server = connected((path, body) => {
    if (path === '/transfers/inspect') return inspection;
    if (path === '/transfers/approve') {
      if ((body as { verification: string }).verification !== '012345')
        throw new IdentityClientError('CONFLICT');
      return { ok: true };
    }
  });
  const controller = new IdentityController(nativeVault(), server, random);
  await controller.initialize();
  await controller.inspectTransfer(code);
  expect(controller.getSnapshot().inspection).not.toHaveProperty(
    'verification',
  );
  await controller.approveTransfer('');
  await controller.approveTransfer('abc123');
  expect(
    server.calls.mock.calls.filter((c) => c[0] === '/transfers/approve'),
  ).toHaveLength(0);
  await controller.approveTransfer('999999');
  expect(controller.getSnapshot().inspection?.code).toBe(code);
  expect(controller.getSnapshot().account).not.toBeNull();
  await controller.approveTransfer('012345');
  expect(server.calls).toHaveBeenLastCalledWith(
    '/transfers/approve',
    { code, verification: '012345' },
    expect.any(String),
  );
  expect(controller.getSnapshot().inspection).toBeNull();
  expect(controller.getSnapshot().message).toContain('Transfer approved');
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

it('coordinates request-driven recovery for an expired session without clearing the same-account cache boundary', async () => {
  let expired = false;
  const server = connected((path) => {
    if (path === '/me' && expired)
      throw new IdentityClientError('SESSION_EXPIRED');
  });
  const controller = new IdentityController(nativeVault(), server, random);
  await controller.initialize();
  const current = controller.currentSession()!;
  expired = true;
  const accounts: (string | null)[] = [];
  const unsubscribe = controller.subscribe(() =>
    accounts.push(controller.getSnapshot().account?.userId ?? null),
  );
  const [a, b] = await Promise.all([
    controller.refreshSession(current.token),
    controller.refreshSession(current.token),
  ]);
  unsubscribe();
  expect(a).toEqual(b);
  expect(a.userId).toBe(current.userId);
  expect(a.token).not.toBe(current.token);
  expect(accounts).not.toContain(null);
  expect(
    server.calls.mock.calls.filter((c) => c[0] === '/recover'),
  ).toHaveLength(1);
});

it('retries a timed-out recovery with the saved proposal and ignores a late response', async () => {
  jest.useFakeTimers();
  try {
    const vault = nativeVault();
    const write = jest.spyOn(vault, 'write');
    let expired = false;
    let finishOld!: (value: unknown) => void;
    let recoveries = 0;
    const server = connected((path) => {
      if (path === '/me' && expired)
        throw new IdentityClientError('SESSION_EXPIRED');
      if (path === '/recover' && ++recoveries === 1)
        return new Promise((resolve) => {
          finishOld = resolve;
        });
    });
    const controller = new IdentityController(vault, server, random);
    await controller.initialize();
    const original = controller.currentSession()!;
    expired = true;
    const first = expect(
      controller.refreshSession(original.token),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    await jest.advanceTimersByTimeAsync(10_001);
    await first;
    expect(controller.getSnapshot().busy).toBe(false);
    expect((await vault.read())!.pending?.kind).toBe('recover');
    const next = await controller.refreshSession(original.token);
    expect(next.userId).toBe(original.userId);
    expect(next.token).not.toBe(original.token);
    const calls = server.calls.mock.calls.filter(
      ([path]) => path === '/recover',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]![1]).toEqual(calls[1]![1]);
    const state = await vault.read();
    const writes = write.mock.calls.length;
    finishOld({ ...state!.session!.info, userId: id() });
    await jest.advanceTimersByTimeAsync(0);
    expect(controller.currentSession()).toEqual(next);
    expect(await vault.read()).toEqual(state);
    expect(write).toHaveBeenCalledTimes(writes);
  } finally {
    jest.useRealTimers();
  }
});

it('releases a refresh waiting on busy identity work without leaving a stale waiter', async () => {
  jest.useFakeTimers();
  try {
    const vault = nativeVault();
    let hang = false;
    const server = connected(async (path) => {
      if (path === '/me') {
        if (hang) return new Promise(() => {});
        throw new IdentityClientError('SESSION_EXPIRED');
      }
    });
    const controller = new IdentityController(vault, server, random);
    await controller.initialize();
    const old = controller.currentSession()!;
    hang = true;
    const busy = controller.refresh();
    const waiting = expect(
      controller.refreshSession(old.token),
    ).rejects.toBeInstanceOf(IdentityClientError);
    await jest.advanceTimersByTimeAsync(10_001);
    await busy;
    await waiting;
    expect(controller.getSnapshot().busy).toBe(false);
    hang = false;
    const next = await controller.refreshSession(old.token);
    expect(next.token).not.toBe(old.token);
  } finally {
    jest.useRealTimers();
  }
});

it('serializes a late native write and rereads its saved intent before retry', async () => {
  jest.useFakeTimers();
  try {
    const memory = nativeVault();
    let delay = false;
    let release!: () => void;
    const writes = jest.fn(async (value: DeviceState) => {
      if (delay) {
        delay = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      await memory.write(value);
    });
    const vault = { ...memory, write: writes };
    const server = connected(async (path, body) => {
      if (path === '/renew')
        return {
          ...(await memory.read())!.session!.info,
          sessionId: (body as { sessionId: string }).sessionId,
        };
    });
    const controller = new IdentityController(vault, server, random);
    await controller.initialize();
    delay = true;
    const first = controller.renew();
    await jest.advanceTimersByTimeAsync(10_001);
    await first;
    const count = writes.mock.calls.length;
    const retry = controller.retry();
    await jest.advanceTimersByTimeAsync(0);
    expect(writes).toHaveBeenCalledTimes(count);
    release();
    await retry;
    expect((await memory.read())!.pending).toBeNull();
    expect(controller.currentSession()).not.toBeNull();
    expect(
      server.calls.mock.calls.filter(([path]) => path === '/renew'),
    ).toHaveLength(1);
    expect(controller.getSnapshot().busy).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
