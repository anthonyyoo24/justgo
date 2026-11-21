import { act, fireEvent, render } from '@testing-library/react-native';
import { PaidAccess } from '../../../app-support/access/paid-access';
import {
  Paywall,
  type PaywallOutcome,
} from '../../../app-support/billing/paywall';
import { AccountClient } from '../../../lib/network/account-client';
import { createHttpClient } from '../../../lib/network/http';
import { openSubscriptionManagement } from '../../../platform/subscriptions/open-subscriptions';
import { showMessageToast } from '../../../platform/toast/Toast';
import { MemoryStorage, deferred } from '../../../../test-support/journal';
import { SettingsSubscriptionRow } from './SettingsSubscriptionRow';
import { SubscriptionScreen } from './SubscriptionScreen';

const api = 'http://localhost:3000';
const userId = '00000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(64);
const day = 24 * 3_600_000;
const iso = (time: number) => new Date(time).toISOString();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
const long = (time: number) =>
  new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
const paid = (
  expiresAt: number,
  source: 'subscription' | 'guest_subscription' = 'subscription',
  productId = 'com.anthonyyoo.justgo.pro.annual',
  renewal: { trial?: boolean; autoRenew?: boolean } = {},
) => ({
  status: 'verified',
  checkedAt: iso(Date.now()),
  expiresAt: iso(expiresAt),
  source,
  productId,
  ...renewal,
});

let mockAccess: PaidAccess | null;
let mockPaywall: Paywall | null;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock('../../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));
jest.mock('../../../platform/subscriptions/open-subscriptions', () => ({
  openSubscriptionManagement: jest.fn(),
}));
jest.mock('../../../app-support/providers/AppProvider', () => ({
  useRuntime: () => ({ access: mockAccess, paywall: mockPaywall }),
}));

let answer: () => unknown;
let transaction: string | null;
let store: {
  present: jest.Mock<Promise<PaywallOutcome>, []>;
  restore: jest.Mock<Promise<'restored' | 'failed'>, []>;
  latestTransactionId: () => Promise<string | null>;
};

async function owner(access: unknown) {
  answer = () => access;
  mockAccess!.changeOwner({ id: userId, kind: 'account' });
  await mockAccess!.refresh();
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  jest.setSystemTime(Date.parse('2026-11-20T12:00:00.000Z'));
  jest.mocked(openSubscriptionManagement).mockReset();
  jest.mocked(showMessageToast).mockClear();
  transaction = null;
  answer = () => ({ status: 'unpaid', checkedAt: iso(Date.now()) });
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === '/v1/access') return json(answer());
    if (path === '/v1/billing/verifications')
      return json(paid(Date.now() + 365 * day));
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  const client = new AccountClient(createHttpClient(api), {
    current: () => ({ userId, token }),
    renew: async () => ({ userId, token }),
    reject: () => {},
  });
  client.changeAccount(userId);
  store = {
    present: jest.fn(async () => ({ type: 'purchased' }) as const),
    restore: jest.fn(async () => 'restored' as const),
    latestTransactionId: async () => transaction,
  };
  mockAccess = new PaidAccess({
    url: api,
    storage: new MemoryStorage(),
    client,
    latestTransactionId: store.latestTransactionId,
  });
  mockPaywall = new Paywall({ access: mockAccess, store });
});
afterEach(async () => {
  mockPaywall?.dismiss();
  await jest.runOnlyPendingTimersAsync();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('shows a subscribed account its plan and renewal date', async () => {
  const renews = Date.now() + 365 * day;
  await owner(paid(renews));
  const screen = await render(<SubscriptionScreen />);
  expect(screen.getByText(`Annual, renews ${long(renews)}`)).toBeTruthy();
  expect(screen.getByLabelText(`Annual, renews ${long(renews)}`)).toBeTruthy();
  expect(
    screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel),
  ).toEqual(['Back', 'Manage Subscription', 'Restore Purchases']);
  expect(
    screen.getByText(
      'Apple bills and renews the subscription. Deleting your JustGO account does not cancel it.',
    ),
  ).toBeTruthy();
});

it('shows when a free trial ends', async () => {
  const trialEnds = Date.now() + 7 * day;
  await owner(
    paid(trialEnds, 'subscription', 'com.anthonyyoo.justgo.pro.annual', {
      trial: true,
      autoRenew: true,
    }),
  );
  const screen = await render(<SubscriptionScreen />);
  expect(
    screen.getByText(`Annual, trial ends ${long(trialEnds)}`),
  ).toBeTruthy();
});

it('says a plan with auto-renew off ends', async () => {
  const ends = Date.now() + 30 * day;
  await owner(
    paid(ends, 'subscription', 'com.anthonyyoo.justgo.pro.monthly', {
      trial: false,
      autoRenew: false,
    }),
  );
  const screen = await render(<SubscriptionScreen />);
  expect(screen.getByText(`Monthly, ends ${long(ends)}`)).toBeTruthy();
});

it('says an expired subscription ended', async () => {
  const ended = Date.now() + day;
  await owner(paid(ended));
  jest.setSystemTime(ended + day);
  const screen = await render(<SubscriptionScreen />);
  expect(screen.getByText(`Annual, ended ${long(ended)}`)).toBeTruthy();
});

it('says a guest subscription is saved to this phone', async () => {
  const renews = Date.now() + 30 * day;
  await owner(
    paid(renews, 'guest_subscription', 'com.anthonyyoo.justgo.pro.monthly'),
  );
  const screen = await render(<SubscriptionScreen />);
  expect(screen.getByText(`Monthly, renews ${long(renews)}`)).toBeTruthy();
  expect(
    screen.getByLabelText(
      `Monthly, renews ${long(renews)}. Saved to this phone, not to an account.`,
    ),
  ).toBeTruthy();
});

it('shows no subscription before anything is bought', async () => {
  await owner({ status: 'unpaid', checkedAt: iso(Date.now()) });
  const screen = await render(<SubscriptionScreen />);
  expect(screen.getByText('No subscription')).toBeTruthy();
});

it('opens Apple’s subscription page once while it is opening', async () => {
  await owner(paid(Date.now() + 365 * day));
  const opening = deferred<void>();
  jest.mocked(openSubscriptionManagement).mockReturnValue(opening.promise);
  const screen = await render(<SubscriptionScreen />);
  const manage = screen.getByRole('button', { name: 'Manage Subscription' });
  await fireEvent.press(manage);
  await fireEvent.press(manage);
  expect(openSubscriptionManagement).toHaveBeenCalledTimes(1);
  await act(async () => {
    opening.resolve();
    await opening.promise;
  });
  await fireEvent.press(manage);
  expect(openSubscriptionManagement).toHaveBeenCalledTimes(2);
  expect(showMessageToast).not.toHaveBeenCalled();
});

it('says when Apple’s subscription page cannot open', async () => {
  await owner(paid(Date.now() + 365 * day));
  jest
    .mocked(openSubscriptionManagement)
    .mockRejectedValue(new Error('storekit'));
  const screen = await render(<SubscriptionScreen />);
  await act(async () => {
    fireEvent.press(
      screen.getByRole('button', { name: 'Manage Subscription' }),
    );
    await jest.runOnlyPendingTimersAsync();
  });
  expect(showMessageToast).toHaveBeenCalledWith(
    'activity',
    'Couldn’t open subscription settings. Please try again.',
  );
});

it('restores a purchase and shows the verified plan', async () => {
  await owner({ status: 'unpaid', checkedAt: iso(Date.now()) });
  const screen = await render(<SubscriptionScreen />);
  transaction = '2000000001';
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Restore Purchases' }));
    await jest.runOnlyPendingTimersAsync();
  });
  expect(store.restore).toHaveBeenCalledTimes(1);
  expect(store.present).not.toHaveBeenCalled();
  expect(
    screen.getByText(`Annual, renews ${long(Date.now() + 365 * day)}`),
  ).toBeTruthy();
});

it('explains a restore that found nothing', async () => {
  await owner({ status: 'unpaid', checkedAt: iso(Date.now()) });
  const screen = await render(<SubscriptionScreen />);
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Restore Purchases' }));
    await jest.runOnlyPendingTimersAsync();
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'No purchase to restore was found for this Apple ID.',
    { exact: false },
  );
  expect(screen.getByText('No subscription')).toBeTruthy();
});

it('says where to restore when this build has no paywall', async () => {
  await owner(paid(Date.now() + 365 * day));
  mockPaywall = null;
  const screen = await render(<SubscriptionScreen />);
  expect(
    screen.getByText(
      'Restoring a purchase is available in the JustGO iPhone app.',
    ),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Restore Purchases' }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Manage Subscription' }),
  ).toBeEnabled();
});

it('offers no subscription actions in a build without billing', async () => {
  mockAccess = null;
  mockPaywall = null;
  const screen = await render(<SubscriptionScreen />);
  expect(screen.getByText('Subscriptions are off in this build')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Manage Subscription' }),
  ).toBeNull();
  expect(
    screen.queryByText(
      'Restoring a purchase is available in the JustGO iPhone app.',
    ),
  ).toBeNull();
});

it('names the plan after the Settings row label', async () => {
  const renews = Date.now() + 365 * day;
  await owner(paid(renews));
  const screen = await render(<SettingsSubscriptionRow access={mockAccess!} />);
  expect(
    screen.getByRole('link', {
      name: `Subscription, Annual, renews ${long(renews)}`,
    }),
  ).toBeTruthy();
});
