import { z } from 'zod';
import { IdentityController } from './controller';
import { IdentityClientError, type IdentityApi } from './api';
import {
  createMemoryVault,
  type CredentialVault,
  type TransferIntent,
} from './storage';
import type { SessionResponse, TransferStart } from '@justgo/contracts';

jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn(),
  randomUUID: jest.fn(),
}));
function setup(
  vault: CredentialVault = { ...createMemoryVault(), kind: 'keychain' },
) {
  let sequence = 1;
  const random = {
    id: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    secret: () => (sequence++).toString(16).padStart(16, '0').repeat(4),
  };
  const userId = random.id(),
    targetId = random.id();
  const controls: {
    startGate?: Promise<void>;
    claimGate?: Promise<void>;
    claimError?: 'TRANSFER_PENDING' | 'CREDENTIAL_REJECTED';
    failCancellation?: boolean;
    cancelStatus?: 'cancelled' | 'redeemed';
    accepted?: () => void;
    transferredSessionError?: 'SESSION_EXPIRED' | 'SESSION_REVOKED';
  } = {};
  const transfers = new Map<string, TransferStart>();
  const calls = jest.fn(
    async (method: string, path: string, body: unknown, token?: string) => {
      if (method === 'DELETE' && path.startsWith('/transfers/')) {
        if (controls.failCancellation) throw new IdentityClientError('NETWORK');
        return { status: controls.cancelStatus ?? 'cancelled' };
      }
      if (path === '/transfers') {
        const input = body as TransferStart;
        transfers.set(input.code, input);
        controls.accepted?.();
        await controls.startGate;
        return {
          id: input.id,
          status: 'waiting',
          verification: '012345',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        };
      }
      if (path === '/devices') return { devices: [] };
      if (path === '/credentials') return { credentials: [] };
      if (path === '/sessions/current') {
        const completed = [...transfers.values()].find(
          (input) => input.sessionToken === token,
        );
        if (completed && controls.transferredSessionError)
          throw new IdentityClientError(controls.transferredSessionError);
        return completed
          ? {
              userId: targetId,
              deviceId: completed.deviceId,
              sessionId: completed.sessionId,
              expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            }
          : (await vault.read())!.session!.info;
      }
      const input = body as TransferStart & { kind: string };
      const proposal =
        input.kind === 'transfer' ? transfers.get(input.code)! : input;
      if (input.kind === 'transfer') {
        if (controls.claimError)
          throw new IdentityClientError(controls.claimError);
        controls.accepted?.();
        const gate = controls.claimGate;
        delete controls.claimGate;
        await gate;
      }
      return {
        userId: input.kind === 'transfer' ? targetId : userId,
        deviceId: proposal.deviceId,
        sessionId: proposal.sessionId,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      } satisfies SessionResponse;
    },
  );
  const api: IdentityApi = {
    request: async <T>(
      method: Parameters<IdentityApi['request']>[0],
      path: string,
      schema: z.ZodType<T>,
      body?: unknown,
      token?: string,
    ) =>
      schema.parse(
        await (token
          ? calls(method, path, body, token)
          : calls(method, path, body)),
      ),
  };
  return {
    vault,
    controls,
    calls,
    userId,
    targetId,
    controller: new IdentityController(vault, api, random),
    restart: () => new IdentityController(vault, api, random),
  };
}
const pendingTransfer = async (vault: CredentialVault) => {
  const pending = (await vault.read())!.pending;
  if (pending?.kind !== 'transfer')
    throw new Error('Expected receiving transfer');
  return pending;
};

it('keeps the previous session and credentials until approval completes, then cancels without disconnecting', async () => {
  const fixture = setup();
  await fixture.controller.initialize();
  await fixture.controller.createAccount();
  const original = fixture.controller.getSnapshot().account;
  const credentials = await fixture.vault.credentials();
  await fixture.controller.startTransfer();
  const pending = await pendingTransfer(fixture.vault);
  expect(fixture.controller.getSnapshot().account).toEqual(original);
  expect(await fixture.vault.credentials()).toEqual(credentials);
  await fixture.controller.cancelTransfer();
  expect(fixture.calls).toHaveBeenCalledWith(
    'DELETE',
    `/transfers/${pending.input.id}`,
    pending.input,
  );
  expect(fixture.controller.getSnapshot().account).toEqual(original);
  expect(fixture.controller.getSnapshot().transfer).toBeNull();
  expect(fixture.controller.getSnapshot().cancellationPending).toBe(false);
  expect((await fixture.vault.read())!.pending).toBeNull();
  await fixture.controller.startTransfer();
  expect((await pendingTransfer(fixture.vault)).input.code).not.toBe(
    pending.input.code,
  );
  await fixture.controller.cancelTransfer();
});

it('cancels a persisted transfer on relaunch instead of resuming it', async () => {
  const fixture = setup();
  await fixture.controller.initialize();
  await fixture.controller.createAccount();
  const original = fixture.controller.getSnapshot().account;
  await fixture.controller.startTransfer();
  const pending = await pendingTransfer(fixture.vault);
  const restarted = fixture.restart();
  await restarted.initialize();
  expect(
    fixture.calls.mock.calls.filter(([, path]) => path === '/transfers'),
  ).toHaveLength(1);
  expect(fixture.calls).toHaveBeenCalledWith(
    'DELETE',
    `/transfers/${pending.input.id}`,
    pending.input,
  );
  expect(restarted.getSnapshot().account).toEqual(original);
  expect(restarted.getSnapshot().transfer).toBeNull();
  expect((await fixture.vault.read())!.pending).toBeNull();
});

it('persists failed cleanup, restores the account and retries cancellation after restart', async () => {
  const fixture = setup();
  await fixture.controller.initialize();
  await fixture.controller.createAccount();
  const original = fixture.controller.getSnapshot().account;
  await fixture.controller.startTransfer();
  fixture.controls.failCancellation = true;
  await fixture.controller.cancelTransfer();
  expect(fixture.controller.getSnapshot().account).toEqual(original);
  expect(fixture.controller.getSnapshot().transfer).toBeNull();
  expect(fixture.controller.getSnapshot().cancellationPending).toBe(true);
  expect((await fixture.vault.read())!.cancelledTransfers).toHaveLength(1);
  expect((await fixture.vault.read())!.pending).toBeNull();
  fixture.controls.failCancellation = false;
  const restarted = fixture.restart();
  await restarted.initialize();
  expect(restarted.getSnapshot().account).toEqual(original);
  expect(restarted.getSnapshot().cancellationPending).toBe(false);
  expect((await fixture.vault.read())!.cancelledTransfers).toEqual([]);
});

it('fences a late start response and waits for an in-progress native write before cancelling it', async () => {
  const memory = createMemoryVault();
  let releaseWrite!: () => void;
  let enteredWrite!: () => void;
  const entered = new Promise<void>((resolve) => {
    enteredWrite = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const vault: CredentialVault = {
    ...memory,
    kind: 'keychain',
    write: async (value) => {
      if (value.pending?.kind === 'transfer') {
        enteredWrite();
        await gate;
      }
      await memory.write(value);
    },
  };
  const fixture = setup(vault);
  await fixture.controller.initialize();
  await fixture.controller.createAccount();
  const original = fixture.controller.getSnapshot().account;
  const starting = fixture.controller.startTransfer();
  await entered;
  const cancelling = fixture.controller.cancelTransfer();
  releaseWrite();
  await Promise.all([starting, cancelling]);
  expect(fixture.controller.getSnapshot().account).toEqual(original);
  expect((await vault.read())!.pending).toBeNull();
  expect(
    fixture.calls.mock.calls.some(([, path]) => path === '/transfers'),
  ).toBe(false);
  expect(fixture.calls.mock.calls.some(([method]) => method === 'DELETE')).toBe(
    true,
  );
});

it('does not let a late start or claim response revive a cancelled transfer', async () => {
  for (const stage of ['start', 'claim'] as const) {
    const fixture = setup();
    await fixture.controller.initialize();
    await fixture.controller.createAccount();
    const original = fixture.controller.getSnapshot().account;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (stage === 'claim') await fixture.controller.startTransfer();
    if (stage === 'start') fixture.controls.startGate = gate;
    else fixture.controls.claimGate = gate;
    const accepted = new Promise<void>((resolve) => {
      fixture.controls.accepted = resolve;
    });
    const running =
      stage === 'start'
        ? fixture.controller.startTransfer()
        : fixture.controller.redeemTransfer();
    await accepted;
    const cancelling = fixture.controller.cancelTransfer();
    await cancelling;
    release();
    await running;
    await Promise.resolve();
    expect(fixture.controller.getSnapshot().account).toEqual(original);
    expect(fixture.controller.getSnapshot().transfer).toBeNull();
    expect((await fixture.vault.read())!.pending).toBeNull();
    expect((await fixture.vault.read())!.cancelledTransfers).toEqual([]);
  }
});

it('reconciles an already-redeemed session when server completion wins cancellation', async () => {
  const fixture = setup();
  await fixture.controller.initialize();
  await fixture.controller.createAccount();
  await fixture.controller.startTransfer();
  const pending = await pendingTransfer(fixture.vault);
  fixture.controls.cancelStatus = 'redeemed';
  await fixture.controller.cancelTransfer();
  expect(fixture.controller.getSnapshot().account?.userId).toBe(
    fixture.targetId,
  );
  expect(fixture.controller.getSnapshot().account?.sessionId).toBe(
    pending.input.sessionId,
  );
  expect((await fixture.vault.read())!.selectedId).toBe(pending.credentialId);
  expect((await fixture.vault.read())!.cancelledTransfers).toEqual([]);
  const deletes = fixture.calls.mock.calls.filter(
    ([method]) => method === 'DELETE',
  ).length;
  await fixture.controller.cancelTransfer();
  expect(
    fixture.calls.mock.calls.filter(([method]) => method === 'DELETE'),
  ).toHaveLength(deletes);
});

it('excludes an abandoned legacy credential and recovers the one unambiguous previous account', async () => {
  const fixture = setup();
  await fixture.controller.initialize();
  await fixture.controller.createAccount();
  await fixture.controller.startTransfer();
  const pending: TransferIntent = await pendingTransfer(fixture.vault);
  await fixture.vault.add({
    id: pending.credentialId,
    secret: pending.input.credential,
  });
  const saved = (await fixture.vault.read())!;
  await fixture.vault.write({
    ...saved,
    session: null,
    selectedId: pending.credentialId,
  });
  const restarted = fixture.restart();
  await restarted.initialize();
  expect(restarted.getSnapshot().account?.userId).toBe(fixture.userId);
  expect(
    restarted.getSnapshot().credentials.map((value) => value.id),
  ).not.toContain(pending.credentialId);
  expect((await fixture.vault.read())!.ignoredCredentialIds).toContain(
    pending.credentialId,
  );
  expect(
    fixture.calls.mock.calls.filter(([, path]) => path === '/transfers'),
  ).toHaveLength(1);
});

it('does not create an account when a disconnected receiver cancels', async () => {
  const fixture = setup(createMemoryVault());
  await fixture.controller.initialize();
  await fixture.controller.startTransfer();
  await fixture.controller.cancelTransfer();
  expect(fixture.controller.getSnapshot().account).toBeNull();
  expect((await fixture.vault.read())!.session).toBeNull();
  expect(await fixture.vault.credentials()).toEqual([]);
  expect(
    fixture.calls.mock.calls.filter(([, path]) => path === '/sessions'),
  ).toHaveLength(0);
});

it('reconciles a completed session whose native storage write finishes after leaving', async () => {
  const memory = createMemoryVault();
  let release!: () => void, entered!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hold = false;
  const vault: CredentialVault = {
    ...memory,
    kind: 'keychain',
    write: async (value) => {
      if (hold && value.session && !value.pending) {
        entered();
        await gate;
      }
      await memory.write(value);
    },
  };
  const fixture = setup(vault);
  await fixture.controller.initialize();
  await fixture.controller.createAccount();
  await fixture.controller.startTransfer();
  hold = true;
  const finishing = fixture.controller.redeemTransfer();
  await writing;
  const cancelling = fixture.controller.cancelTransfer();
  hold = false;
  release();
  await Promise.all([finishing, cancelling]);
  expect(fixture.controller.getSnapshot().account?.userId).toBe(
    fixture.targetId,
  );
  expect(fixture.controller.currentSession()?.userId).toBe(fixture.targetId);
  expect((await vault.read())!.pending).toBeNull();
  expect(fixture.controller.getSnapshot().transfer).toBeNull();
});

it.each(['SESSION_EXPIRED', 'SESSION_REVOKED'] as const)(
  'does not retry cancellation forever for a completed transfer with %s',
  async (code) => {
    const fixture = setup();
    await fixture.controller.initialize();
    await fixture.controller.createAccount();
    const original = fixture.controller.getSnapshot().account;
    await fixture.controller.startTransfer();
    fixture.controls.cancelStatus = 'redeemed';
    fixture.controls.transferredSessionError = code;
    await fixture.controller.cancelTransfer();
    expect(fixture.controller.getSnapshot().account).toEqual(original);
    expect(fixture.controller.getSnapshot().cancellationPending).toBe(false);
    expect((await fixture.vault.read())!.cancelledTransfers).toEqual([]);
    expect(fixture.controller.getSnapshot().credentials).toHaveLength(2);
  },
);

it('retains the old account recovery key on cancellation and clears it only after switching accounts', async () => {
  const fixture = setup();
  await fixture.controller.initialize();
  await fixture.controller.createAccount();
  const savedKey = {
    id: '10000000-0000-4000-8000-000000000001',
    secret: 'a'.repeat(64),
    registered: true,
  };
  await fixture.vault.write({ ...(await fixture.vault.read())!, savedKey });
  const controller = fixture.restart();
  await controller.initialize();
  await controller.startTransfer();
  await controller.cancelTransfer();
  expect((await fixture.vault.read())!.savedKey).toEqual(savedKey);
  await controller.startTransfer();
  await controller.redeemTransfer();
  expect(controller.getSnapshot().account?.userId).toBe(fixture.targetId);
  expect((await fixture.vault.read())!.savedKey).toBeNull();
  expect((await fixture.vault.read())!.registration).toBeNull();
});

it.each(['TRANSFER_PENDING', 'CREDENTIAL_REJECTED'] as const)(
  'keeps the current account and avoids an unregistered sync credential after %s',
  async (code) => {
    const fixture = setup();
    await fixture.controller.initialize();
    await fixture.controller.createAccount();
    const original = fixture.controller.getSnapshot().account;
    const credentials = await fixture.vault.credentials();
    await fixture.controller.startTransfer();
    fixture.controls.claimError = code;
    await fixture.controller.redeemTransfer();
    expect(fixture.controller.getSnapshot().account).toEqual(original);
    expect(await fixture.vault.credentials()).toEqual(credentials);
    await fixture.controller.cancelTransfer();
    expect(fixture.controller.getSnapshot().account).toEqual(original);
  },
);
