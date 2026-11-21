import { act, fireEvent, render } from '@testing-library/react-native';
import { PaidAccess } from './paid-access';
import { LockedScreen } from './LockedScreen';
import { AccountClient } from '../../lib/network/account-client';
import { createHttpClient } from '../../lib/network/http';
import { MemoryStorage, deferred } from '../../../test-support/journal';
import { Paywall, type PaywallOutcome } from '../billing/paywall';
import { WelcomePreparationContext } from '../identity/welcome/welcome-preparation';

const api = 'http://localhost:3000';
const userId = '00000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(64);
const iso = (time: number) => new Date(time).toISOString();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
const verified = () =>
  json({
    status: 'verified',
    checkedAt: iso(Date.now()),
    expiresAt: iso(Date.now() + 30 * 24 * 3_600_000),
    source: 'subscription',
    productId: 'com.anthonyyoo.justgo.pro.annual',
  });

const mockPush = jest.fn();
let mockPaywall: Paywall | null;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));
jest.mock('../providers/AppProvider', () => ({
  useRuntime: () => ({ paywall: mockPaywall }),
}));

let access: PaidAccess;
let outcome: () => Promise<PaywallOutcome>;
let restored: () => Promise<'restored' | 'failed'>;
let transaction: string | null;
let store: {
  present: jest.Mock<Promise<PaywallOutcome>, []>;
  restore: jest.Mock<Promise<'restored' | 'failed'>, []>;
  latestTransactionId: () => Promise<string | null>;
};

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  jest.setSystemTime(Date.parse('2026-11-20T12:00:00.000Z'));
  mockPush.mockClear();
  outcome = async () => ({ type: 'purchased' });
  restored = async () => 'restored';
  transaction = null;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === '/v1/access')
      return json({ status: 'unpaid', checkedAt: iso(Date.now()) });
    if (path === '/v1/billing/verifications') return verified();
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  const client = new AccountClient(createHttpClient(api), {
    current: () => ({ userId, token }),
    renew: async () => ({ userId, token }),
    reject: () => {},
  });
  client.changeAccount(userId);
  store = {
    present: jest.fn(() => outcome()),
    restore: jest.fn(() => restored()),
    latestTransactionId: async () => transaction,
  };
  access = new PaidAccess({
    url: api,
    storage: new MemoryStorage(),
    client,
    latestTransactionId: store.latestTransactionId,
  });
  access.changeOwner({ id: userId, kind: 'account' });
  await access.refresh();
  mockPaywall = new Paywall({ access, store });
});
afterEach(async () => {
  mockPaywall?.dismiss();
  await jest.runOnlyPendingTimersAsync();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('offers subscribe, restore, sign-in and the legal pages and nothing else', async () => {
  const screen = await render(<LockedScreen />);
  expect(access.status()).toBe('locked');
  expect(screen.getByText('Subscribe to JustGO')).toBeTruthy();
  expect(
    screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel),
  ).toEqual([
    'Subscribe',
    'Restore purchase',
    'Sign in',
    'Terms of Use',
    'Privacy Policy',
  ]);
});

it('opens the paywall and opens the app once the purchase verifies', async () => {
  const screen = await render(<LockedScreen />);
  const purchase = deferred<PaywallOutcome>();
  outcome = () => purchase.promise;
  await fireEvent.press(screen.getByRole('button', { name: 'Subscribe' }));
  expect(store.present).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Restore purchase' }),
  ).toBeDisabled();
  transaction = '2000000001';
  await act(async () => {
    purchase.resolve({ type: 'purchased' });
    await jest.runOnlyPendingTimersAsync();
  });
  expect(access.status()).toBe('open');
});

it('restores a purchase without showing the paywall', async () => {
  const screen = await render(<LockedScreen />);
  transaction = '2000000001';
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Restore purchase' }));
    await jest.runOnlyPendingTimersAsync();
  });
  expect(store.restore).toHaveBeenCalledTimes(1);
  expect(store.present).not.toHaveBeenCalled();
  expect(access.status()).toBe('open');
});

it('explains a restore that found nothing and stays locked', async () => {
  const screen = await render(<LockedScreen />);
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Restore purchase' }));
    await jest.runOnlyPendingTimersAsync();
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'No purchase to restore was found for this Apple ID.',
    { exact: false },
  );
  expect(access.status()).toBe('locked');
  expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
});

it('sends someone who paid on another phone to sign in', async () => {
  const screen = await render(<LockedScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(mockPush).toHaveBeenCalledWith('/recovery');
});

it('ends the Welcome preparation cover on the locked screen', async () => {
  const markReady = jest.fn();
  await render(
    <WelcomePreparationContext.Provider
      value={{ active: true, attempt: 1, markReady }}
    >
      <LockedScreen />
    </WelcomePreparationContext.Provider>,
  );
  expect(markReady).toHaveBeenCalledTimes(1);
});

it('says where to subscribe when this build has no paywall', async () => {
  mockPaywall = null;
  const screen = await render(<LockedScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Subscriptions are available in the JustGO iPhone app.',
  );
  expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});
