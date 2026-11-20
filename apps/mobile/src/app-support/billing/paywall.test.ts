import { PaidAccess } from '../access/paid-access';
import { AccountClient } from '../../lib/network/account-client';
import { createHttpClient } from '../../lib/network/http';
import { MemoryStorage, deferred } from '../../../test-support/journal';
import { Paywall, type PaywallOutcome } from './paywall';

const api = 'http://localhost:3000';
const userId = '00000000-0000-4000-8000-000000000001';
const guestId = '00000000-0000-4000-8000-000000000002';
const token = 'a'.repeat(64);
const purchase = '2000000001';
const minute = 60_000;
const iso = (time: number) => new Date(time).toISOString();
const verified = () => ({
  status: 'verified',
  checkedAt: iso(Date.now()),
  expiresAt: iso(Date.now() + 30 * 24 * 60 * minute),
  source: 'subscription',
  productId: 'justgo.monthly',
});
const unpaid = () => ({ status: 'unpaid', checkedAt: iso(Date.now()) });
const codes: Record<number, string> = {
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  503: 'UNAVAILABLE',
};
const reply = (body: unknown) =>
  new Response(
    JSON.stringify(
      typeof body === 'number'
        ? { code: codes[body] ?? 'UNAVAILABLE', requestId: 'fixture' }
        : body,
    ),
    {
      headers: { 'Content-Type': 'application/json' },
      status: typeof body === 'number' ? body : 200,
    },
  );

let fetcher: jest.SpiedFunction<typeof fetch>;
// The server's next /v1/billing/verifications answer, a status it fails with, or 'offline'.
let verification: () => unknown;
let held: Promise<void> | null;
// The store's newest transaction on this phone. Only a purchase or restore makes one.
let transaction: string | null;
let access: PaidAccess;
let store: {
  present: jest.Mock<Promise<PaywallOutcome>, ['start_challenge']>;
  latestTransactionId: jest.Mock<Promise<string | null>, []>;
};
let paywall: Paywall;
const verifications = () =>
  fetcher.mock.calls.filter(
    ([url, init]) =>
      new URL(String(url)).pathname === '/v1/billing/verifications' &&
      new Headers(init?.headers).has('authorization'),
  );
const outcome = (type: PaywallOutcome['type']) =>
  store.present.mockImplementationOnce(async () => {
    if (type === 'purchased' || type === 'restored' || type === 'entitled')
      transaction = purchase;
    return { type } as PaywallOutcome;
  });
const status = () => paywall.getSnapshot();

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  jest.setSystemTime(Date.parse('2026-11-20T12:00:00.000Z'));
  verification = verified;
  held = null;
  transaction = null;
  fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/v1/access') return reply(unpaid());
      if (path === '/v1/billing/verifications') {
        if (held) await held;
        const answer = verification();
        if (answer === 'offline') throw new TypeError('Network request failed');
        return reply(answer);
      }
      throw new Error(`Unexpected fixture request: ${path}`);
    });
  const client = new AccountClient(createHttpClient(api), {
    current: () => ({ userId, token }),
    renew: async () => ({ userId, token }),
    reject: () => {},
  });
  client.changeAccount(userId);
  store = {
    present: jest.fn<Promise<PaywallOutcome>, ['start_challenge']>(
      async () => ({ type: 'declined' }) as PaywallOutcome,
    ),
    latestTransactionId: jest.fn(async () => transaction),
  };
  access = new PaidAccess({
    url: api,
    storage: new MemoryStorage(),
    client,
    latestTransactionId: () => store.latestTransactionId(),
  });
  access.changeOwner({ id: userId, kind: 'account' });
  await access.refresh();
  paywall = new Paywall({ access, store });
});
afterEach(async () => {
  paywall.dismiss();
  await jest.runOnlyPendingTimersAsync();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it.each(['purchased', 'restored', 'entitled'] as const)(
  'unlocks after %s only once the API verifies it, confirming meanwhile',
  async (type) => {
    outcome(type);
    const gate = deferred<void>();
    held = gate.promise;
    const seen: string[] = [];
    paywall.subscribe(() => seen.push(status().status));
    const opened = paywall.open();
    await jest.advanceTimersByTimeAsync(0);
    expect(status()).toEqual({ status: 'verifying' });
    expect(access.canStart()).toBe(false);
    gate.resolve();
    await expect(opened).resolves.toBe(true);
    expect(seen).toEqual(['presenting', 'verifying', 'idle']);
    expect(store.present).toHaveBeenCalledWith('start_challenge');
    expect(access.canStart()).toBe(true);
    expect(JSON.parse(String(verifications()[0]![1]?.body))).toEqual({
      transactionId: purchase,
    });
  },
);

it('returns with nothing unlocked when the purchase is cancelled', async () => {
  outcome('declined');
  await expect(paywall.open()).resolves.toBe(false);
  expect(status()).toEqual({ status: 'idle' });
  expect(verifications()).toHaveLength(0);
  expect(access.canStart()).toBe(false);
});

it('waits for approval when the purchase is pending and unlocks once a later check verifies it', async () => {
  outcome('pending');
  await expect(paywall.open()).resolves.toBe(false);
  expect(status()).toEqual({ status: 'pending', awaiting: 'approval' });
  expect(verifications()).toHaveLength(0);

  transaction = purchase;
  jest.setSystemTime(Date.now() + 6 * minute);
  await access.refresh();
  expect(status()).toEqual({ status: 'verified' });
  paywall.dismiss();
  expect(status()).toEqual({ status: 'idle' });
});

it.each([
  ['the paywall fails', () => outcome('failed')],
  [
    'presenting throws',
    () => store.present.mockRejectedValueOnce(new Error('sdk')),
  ],
])('explains a failure and unlocks nothing when %s', async (_name, arrange) => {
  arrange();
  await expect(paywall.open()).resolves.toBe(false);
  expect(status()).toEqual({ status: 'failed' });
  expect(verifications()).toHaveLength(0);
  expect(access.canStart()).toBe(false);
});

it.each([
  ['answers unpaid', unpaid],
  ['answers 409', () => 409],
  ['does not know the transaction', () => 404],
])(
  'stays locked and explains the refusal when the API %s',
  async (_name, answer) => {
    outcome('purchased');
    verification = answer;
    await expect(paywall.open()).resolves.toBe(false);
    expect(status()).toEqual({ status: 'refused' });
    expect(access.canStart()).toBe(false);
  },
);

it.each([
  ['fails with 503', () => 503],
  ['is offline', () => 'offline'],
  [
    'answers unavailable',
    () => ({ status: 'unavailable', checkedAt: iso(Date.now()) }),
  ],
])(
  'shows a pending purchase when the API %s, and retries without presenting again',
  async (_name, answer) => {
    outcome('purchased');
    verification = answer;
    await expect(paywall.open()).resolves.toBe(false);
    expect(status()).toEqual({ status: 'pending', awaiting: 'confirmation' });
    expect(access.canStart()).toBe(false);

    verification = verified;
    await paywall.retry();
    expect(status()).toEqual({ status: 'verified' });
    expect(access.canStart()).toBe(true);
    expect(store.present).toHaveBeenCalledTimes(1);
    expect(verifications()).toHaveLength(2);
  },
);

it('shows a pending purchase when the store names no transaction', async () => {
  outcome('restored');
  store.latestTransactionId.mockResolvedValue(null);
  await expect(paywall.open()).resolves.toBe(false);
  expect(status()).toEqual({ status: 'pending', awaiting: 'confirmation' });
  expect(verifications()).toHaveLength(0);
});

it('shows a pending purchase once the store outlasts the ten-second timeout', async () => {
  outcome('purchased');
  store.latestTransactionId.mockReturnValueOnce(new Promise(() => {}));
  const opened = paywall.open();
  await jest.advanceTimersByTimeAsync(9_999);
  expect(status()).toEqual({ status: 'verifying' });
  await jest.advanceTimersByTimeAsync(1);
  await expect(opened).resolves.toBe(false);
  expect(status()).toEqual({ status: 'pending', awaiting: 'confirmation' });
  expect(verifications()).toHaveLength(0);
});

it('unlocks a pending purchase when its verification lands after the timeout', async () => {
  paywall = new Paywall({ access, store, timeoutMs: 4_000 });
  outcome('purchased');
  const gate = deferred<void>();
  held = gate.promise;
  const opened = paywall.open();
  await jest.advanceTimersByTimeAsync(4_000);
  await expect(opened).resolves.toBe(false);
  expect(status()).toEqual({ status: 'pending', awaiting: 'confirmation' });
  expect(access.canStart()).toBe(false);
  gate.resolve();
  await jest.advanceTimersByTimeAsync(0);
  expect(status()).toEqual({ status: 'verified' });
  expect(access.canStart()).toBe(true);
});

it('unlocks a pending purchase when a later refresh posts the transaction', async () => {
  outcome('purchased');
  verification = () => 503;
  await paywall.open();
  expect(status()).toEqual({ status: 'pending', awaiting: 'confirmation' });

  verification = verified;
  jest.setSystemTime(Date.now() + 6 * minute);
  await access.refresh();
  expect(status()).toEqual({ status: 'verified' });
  expect(store.present).toHaveBeenCalledTimes(1);
});

it('presents once for concurrent opens', async () => {
  const shown = deferred<PaywallOutcome>();
  store.present.mockImplementationOnce(async () => {
    transaction = purchase;
    return shown.promise;
  });
  const first = paywall.open();
  const second = paywall.open();
  expect(status()).toEqual({ status: 'presenting' });
  shown.resolve({ type: 'purchased' });
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  expect(store.present).toHaveBeenCalledTimes(1);
  expect(verifications()).toHaveLength(1);
});

it('retries only a purchase waiting for confirmation', async () => {
  outcome('pending');
  await paywall.open();
  await paywall.retry();
  expect(status()).toEqual({ status: 'pending', awaiting: 'approval' });
  paywall.dismiss();
  await paywall.retry();
  expect(status()).toEqual({ status: 'idle' });
  expect(verifications()).toHaveLength(0);
});

// Only bearer verifications are counted, so the guest's own check of the phone's purchase is left out.
it('drops a pending purchase when the owner changes, and never verifies under the next owner', async () => {
  outcome('purchased');
  verification = () => 503;
  await paywall.open();
  access.changeOwner({ id: guestId, kind: 'guest' });
  expect(status()).toEqual({ status: 'idle' });

  const shown = deferred<PaywallOutcome>();
  store.present.mockReturnValueOnce(shown.promise);
  access.changeOwner({ id: userId, kind: 'account' });
  const opened = paywall.open();
  access.changeOwner({ id: guestId, kind: 'guest' });
  shown.resolve({ type: 'purchased' });
  await expect(opened).resolves.toBe(false);
  expect(status()).toEqual({ status: 'idle' });
  expect(verifications()).toHaveLength(1);
});
