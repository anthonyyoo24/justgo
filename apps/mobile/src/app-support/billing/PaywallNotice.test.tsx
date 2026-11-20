import { act, fireEvent, render } from '@testing-library/react-native';
import { PaidAccess } from '../access/paid-access';
import { AccountClient } from '../../lib/network/account-client';
import { createHttpClient } from '../../lib/network/http';
import { MemoryStorage, deferred } from '../../../test-support/journal';
import { Paywall, type PaywallOutcome } from './paywall';
import { PaywallNotice } from './PaywallNotice';

const api = 'http://localhost:3000';
const userId = '00000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(64);
const iso = (time: number) => new Date(time).toISOString();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
const verified = () =>
  json({
    status: 'verified',
    checkedAt: iso(Date.now()),
    expiresAt: iso(Date.now() + 30 * 24 * 3_600_000),
    source: 'subscription',
    productId: 'com.anthonyyoo.justgo.pro.annual',
  });

let answer: () => Promise<Response>;
let paywall: Paywall;
let outcome: () => Promise<PaywallOutcome>;

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  jest.setSystemTime(Date.parse('2026-11-20T12:00:00.000Z'));
  answer = async () => verified();
  outcome = async () => ({ type: 'purchased' });
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === '/v1/access')
      return json({ status: 'unpaid', checkedAt: iso(Date.now()) });
    if (path === '/v1/billing/verifications') return answer();
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  const client = new AccountClient(createHttpClient(api), {
    current: () => ({ userId, token }),
    renew: async () => ({ userId, token }),
    reject: () => {},
  });
  client.changeAccount(userId);
  const store = {
    present: () => outcome(),
    latestTransactionId: async () => '2000000001',
  };
  const access = new PaidAccess({
    url: api,
    storage: new MemoryStorage(),
    client,
    latestTransactionId: store.latestTransactionId,
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

it('shows nothing while idle or while the paywall is on screen', async () => {
  const screen = await render(<PaywallNotice paywall={paywall} />);
  expect(screen.toJSON()).toBeNull();
  const sheet = deferred<PaywallOutcome>();
  outcome = () => sheet.promise;
  let opened: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    opened = paywall.open();
  });
  expect(paywall.getSnapshot()).toEqual({ status: 'presenting' });
  expect(screen.toJSON()).toBeNull();
  await act(async () => {
    sheet.resolve({ type: 'declined' });
    await opened;
  });
  expect(screen.toJSON()).toBeNull();
});

it('shows an honest pending state while the API confirms, then clears on success', async () => {
  const gate = deferred<Response>();
  answer = () => gate.promise;
  const screen = await render(<PaywallNotice paywall={paywall} />);
  let opened: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    opened = paywall.open();
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Confirming your purchase.',
  );
  expect(screen.queryByRole('button')).toBeNull();
  await act(async () => {
    gate.resolve(verified());
    await opened;
  });
  expect(screen.toJSON()).toBeNull();
});

it('offers a check again that unlocks a purchase the API could not confirm in time', async () => {
  answer = async () => json({ code: 'UNAVAILABLE', requestId: 'x' }, 503);
  const screen = await render(<PaywallNotice paywall={paywall} />);
  await act(async () => {
    await paywall.open();
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'We could not confirm your purchase yet. Challenges unlock as soon as it is confirmed.',
  );
  answer = async () => verified();
  await fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your purchase is confirmed. Swipe right on a challenge to start.',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.toJSON()).toBeNull();
});

it.each([
  [
    { type: 'pending' } as const,
    'Your purchase is waiting for approval. Challenges unlock once it is approved.',
  ],
  [
    { type: 'failed' } as const,
    'The purchase did not finish, so nothing changed. Swipe right on a challenge to try again.',
  ],
])(
  'explains a %j purchase with only a close button',
  async (result, message) => {
    outcome = async () => result;
    const screen = await render(<PaywallNotice paywall={paywall} />);
    await act(async () => {
      await paywall.open();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(
      screen.getAllByRole('button').map((b) => b.props.accessibilityLabel),
    ).toEqual(['Close']);
  },
);

it('says a refused purchase stays locked', async () => {
  answer = async () => json({ code: 'CONFLICT', requestId: 'x' }, 409);
  const screen = await render(<PaywallNotice paywall={paywall} />);
  await act(async () => {
    await expect(paywall.open()).resolves.toBe(false);
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'We could not verify this purchase, so challenges stay locked. Swipe right on a challenge to try again or restore a purchase.',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.toJSON()).toBeNull();
});
