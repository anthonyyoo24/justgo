import { useSuperwallStore } from 'expo-superwall';
import { Linking } from 'react-native';
import {
  nativeCalls,
  superwallNative,
} from '../../../test-support/superwall-native';
import type { PaywallOutcome } from './paywall';
import {
  SuperwallBilling,
  SuperwallPaywallStore,
  createSuperwallBilling,
  createSuperwallPaywallStore,
  superwallApiKey,
  superwallOptions,
} from './superwall';
import {
  createSuperwallBilling as createWebSuperwallBilling,
  createSuperwallPaywallStore as createWebSuperwallPaywallStore,
} from './superwall.web';

const owner = '3f8f2d1e-6b7a-4c52-9a0e-2d4b8c1f7e90';
const other = '9c1d7e2a-0b4f-4e8d-8a6c-5f3e2b1a0d97';
// What the store may ask the native module. Anything else, such as
// setUserAttributes, handleDeepLink or setEventTrackingBehavior, fails.
const allowedNative = new Set([
  'addListener',
  'configure',
  'getCustomerInfo',
  'getSubscriptionStatus',
  'getUserAttributes',
  'identify',
  'registerPlacement',
  'reset',
  'restorePurchases',
]);

const settle = async () => {
  for (let turn = 0; turn < 10; turn += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
};
const callsTo = (method: string) =>
  nativeCalls.filter((call) => call.method === method);

let stops: (() => void)[] = [];
const start = (billing: SuperwallBilling) => {
  const stop = billing.start();
  stops.push(stop);
  return stop;
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  superwallNative.reset();
  useSuperwallStore.setState({
    isConfigured: false,
    isLoading: false,
    listenersInitialized: false,
    configurationError: null,
    user: null,
  });
});
afterEach(async () => {
  stops.forEach((stop) => stop());
  stops = [];
  await settle();
  expect(nativeCalls.filter((call) => !allowedNative.has(call.method))).toEqual(
    [],
  );
  jest.restoreAllMocks();
});

it('configures once with the public key and Superwall-only tracking', async () => {
  expect(superwallOptions.eventTrackingBehavior).toBe('superwallOnly');
  const billing = new SuperwallBilling();
  // React replays effects, before and after configuration finishes.
  billing.start()();
  const first = billing.start();
  await settle();
  first();
  start(billing);
  await settle();

  const configured = callsTo('configure');
  expect(configured).toHaveLength(1);
  expect(configured[0]!.args[0]).toBe(superwallApiKey);
  expect(superwallApiKey).toBe('pk_weeyKXc6nLaH3eMSkyjhB');
  expect(configured[0]!.args[1]).toMatchObject({
    eventTrackingBehavior: 'superwallOnly',
  });
  expect(useSuperwallStore.getState().isConfigured).toBe(true);
  expect(superwallNative.listenerCount()).toBe(3);
});

it('keeps a guest anonymous', async () => {
  const billing = new SuperwallBilling();
  billing.changeOwner(null);
  start(billing);
  await settle();
  billing.changeOwner(null);
  await settle();

  expect(callsTo('identify')).toEqual([]);
  expect(callsTo('reset')).toEqual([]);
  expect(superwallNative.attributes().appUserId).toBeUndefined();
});

it('identifies an account by its owner ID alone once Superwall configures', async () => {
  const release = superwallNative.holdConfigure();
  const billing = new SuperwallBilling();
  start(billing);
  billing.changeOwner(owner);
  await settle();
  expect(callsTo('identify')).toEqual([]);

  release();
  await settle();
  billing.changeOwner(owner);
  await settle();

  expect(callsTo('identify').map((call) => call.args)).toEqual([
    [owner, undefined],
  ]);
  expect(callsTo('reset')).toEqual([]);
  expect(superwallNative.attributes().appUserId).toBe(owner);
});

it('keeps an identified account through a relaunch without calling Superwall again', async () => {
  superwallNative.identifiedAs(owner);
  const billing = new SuperwallBilling();
  billing.changeOwner(owner);
  start(billing);
  await settle();

  expect(callsTo('identify')).toEqual([]);
  expect(callsTo('reset')).toEqual([]);
});

it('resets on logout and when a guest opens a phone Superwall still knows as an account', async () => {
  const billing = new SuperwallBilling();
  billing.changeOwner(owner);
  start(billing);
  await settle();
  billing.changeOwner(null);
  await settle();
  expect(callsTo('reset')).toHaveLength(1);
  expect(superwallNative.attributes().appUserId).toBeUndefined();

  stops.forEach((stop) => stop());
  stops = [];
  superwallNative.reset();
  superwallNative.identifiedAs(other);
  useSuperwallStore.setState({ isConfigured: false, user: null });
  const relaunched = new SuperwallBilling();
  relaunched.changeOwner(null);
  start(relaunched);
  await settle();
  expect(callsTo('reset')).toHaveLength(1);
  expect(callsTo('identify')).toEqual([]);
});

it('follows an account switch made while an identify is running', async () => {
  const billing = new SuperwallBilling();
  start(billing);
  await settle();
  billing.changeOwner(owner);
  billing.changeOwner(other);
  await settle();

  expect(callsTo('identify').map((call) => call.args[0])).toEqual([
    owner,
    other,
  ]);
  expect(superwallNative.attributes().appUserId).toBe(other);
});

it('swallows a failed identify and retries on the next owner change', async () => {
  const billing = new SuperwallBilling();
  start(billing);
  await settle();
  superwallNative.failNext('identify');
  billing.changeOwner(owner);
  await settle();
  expect(superwallNative.attributes().appUserId).toBeUndefined();

  billing.changeOwner(null);
  billing.changeOwner(owner);
  await settle();
  expect(superwallNative.attributes().appUserId).toBe(owner);
});

it('never sees the sign-in callback link', async () => {
  const callback = 'justgo://auth/callback?code=private-code';
  const initial = jest
    .spyOn(Linking, 'getInitialURL')
    .mockResolvedValue(callback);
  const listen = jest.spyOn(Linking, 'addEventListener');
  const billing = new SuperwallBilling();
  start(billing);
  billing.changeOwner(owner);
  await settle();

  expect(initial).not.toHaveBeenCalled();
  expect(listen).not.toHaveBeenCalled();
  expect(callsTo('handleDeepLink')).toEqual([]);
  expect(JSON.stringify(nativeCalls)).not.toContain('private-code');
});

it('stays off unless billing is on, and always off on web', () => {
  expect(createSuperwallBilling(false)).toBeNull();
  expect(createSuperwallBilling(true)).toBeInstanceOf(SuperwallBilling);
  expect(createWebSuperwallBilling()).toBeNull();
  expect(createSuperwallPaywallStore(false)).toBeNull();
  expect(createSuperwallPaywallStore(true)).toBeInstanceOf(
    SuperwallPaywallStore,
  );
  expect(createWebSuperwallPaywallStore()).toBeNull();
});

describe('the paywall store', () => {
  const info = { id: 'paywall' };
  // Opens the placement and returns its handler, with the outcome still open.
  const open = async () => {
    useSuperwallStore.setState({ isConfigured: true });
    let outcome: PaywallOutcome | undefined;
    void new SuperwallPaywallStore()
      .present('start_challenge')
      .then((result) => (outcome = result));
    await settle();
    const placement = superwallNative.placement()!;
    return { ...placement, outcome: () => outcome };
  };
  const transaction = (event: Record<string, unknown>) =>
    superwallNative.emit('handleSuperwallEvent', {
      eventInfo: { event, params: {} },
    });

  it.each([
    [{ type: 'purchased', productId: 'annual' }, 'purchased'],
    [{ type: 'restored' }, 'restored'],
    [{ type: 'declined' }, 'declined'],
  ] as const)(
    'reports a paywall closed as %j for its own placement only',
    async (result, type) => {
      const { handlerId, grant, outcome } = await open();
      expect(callsTo('registerPlacement')[0]!.args).toEqual([
        'start_challenge',
        undefined,
        handlerId,
      ]);
      superwallNative.emit('onPaywallPresent', {
        paywallInfoJson: info,
        handlerId,
      });
      superwallNative.emit('onPaywallDismiss', {
        paywallInfoJson: info,
        result: { type: 'declined' },
        handlerId: 'someone-else',
      });
      // Superwall may let the person through before the dismiss event arrives.
      grant();
      await settle();
      expect(outcome()).toBeUndefined();
      superwallNative.emit('onPaywallDismiss', {
        paywallInfoJson: info,
        result,
        handlerId,
      });
      await settle();
      expect(outcome()).toEqual({ type });
      expect(superwallNative.listenerCount()).toBe(0);
    },
  );

  it('reports a decline after Ask to Buy as pending and after a failed purchase as failed', async () => {
    const asked = await open();
    superwallNative.emit('onPaywallPresent', {
      paywallInfoJson: info,
      handlerId: asked.handlerId,
    });
    transaction({ event: 'transactionStart' });
    transaction({ event: 'transactionFail', error: 'Needs parental approval' });
    superwallNative.emit('onPaywallDismiss', {
      paywallInfoJson: info,
      result: { type: 'declined' },
      handlerId: asked.handlerId,
    });
    await settle();
    expect(asked.outcome()).toEqual({ type: 'pending' });

    const failed = await open();
    superwallNative.emit('onPaywallPresent', {
      paywallInfoJson: info,
      handlerId: failed.handlerId,
    });
    transaction({ event: 'transactionFail', error: 'Payment declined' });
    superwallNative.emit('onPaywallDismiss', {
      paywallInfoJson: info,
      result: { type: 'declined' },
      handlerId: failed.handlerId,
    });
    await settle();
    expect(failed.outcome()).toEqual({ type: 'failed' });

    // A purchase started after a failure clears it, so a later cancel is a decline.
    const retried = await open();
    superwallNative.emit('onPaywallPresent', {
      paywallInfoJson: info,
      handlerId: retried.handlerId,
    });
    transaction({ event: 'transactionFail', error: 'Payment declined' });
    transaction({ event: 'transactionStart' });
    superwallNative.emit('onPaywallDismiss', {
      paywallInfoJson: info,
      result: { type: 'declined' },
      handlerId: retried.handlerId,
    });
    await settle();
    expect(retried.outcome()).toEqual({ type: 'declined' });
  });

  it('counts a placement Superwall lets through without a paywall as entitled', async () => {
    const { grant, outcome } = await open();
    grant();
    await settle();
    expect(outcome()).toEqual({ type: 'entitled' });
    expect(superwallNative.listenerCount()).toBe(0);
  });

  it.each([
    ['skips', 'onPaywallSkip', { skippedReason: { type: 'NoAudienceMatch' } }],
    ['errors', 'onPaywallError', { errorString: 'offline' }],
  ])('reports a placement that %s as failed', async (_name, event, payload) => {
    const { handlerId, outcome } = await open();
    superwallNative.emit(event, { ...payload, handlerId });
    await settle();
    expect(outcome()).toEqual({ type: 'failed' });
    expect(superwallNative.listenerCount()).toBe(0);
  });

  it('reports a register that fails as failed', async () => {
    const { fail, outcome } = await open();
    fail();
    await settle();
    expect(outcome()).toEqual({ type: 'failed' });
  });

  it('names the newest App Store transaction on the phone, or none', async () => {
    useSuperwallStore.setState({ isConfigured: true });
    const store = new SuperwallPaywallStore();
    await expect(store.latestTransactionId()).resolves.toBeNull();
    superwallNative.setCustomerInfo({
      userId: owner,
      subscriptions: [
        { transactionId: '2000000001', purchaseDate: '2026-10-01T00:00:00Z' },
        { transactionId: '2000000003', purchaseDate: '2026-11-19T00:00:00Z' },
      ],
      nonSubscriptions: [
        { transactionId: '2000000002', purchaseDate: '2026-11-01T00:00:00Z' },
      ],
      entitlements: [],
    });
    await expect(store.latestTransactionId()).resolves.toBe('2000000003');
  });

  it('reports a restore as restored or failed, and a thrown restore as failed', async () => {
    useSuperwallStore.setState({ isConfigured: true });
    const store = new SuperwallPaywallStore();
    await expect(store.restore()).resolves.toBe('restored');
    expect(callsTo('restorePurchases')).toHaveLength(1);
    superwallNative.setRestoration({ result: 'failed', errorMessage: null });
    await expect(store.restore()).resolves.toBe('failed');
    superwallNative.failNext('restorePurchases');
    await expect(store.restore()).resolves.toBe('failed');
  });
});
