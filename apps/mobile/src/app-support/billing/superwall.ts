import {
  SuperwallExpoModule,
  useSuperwallStore,
  type PartialSuperwallOptions,
  type PaywallResult,
  type UserAttributes,
} from 'expo-superwall';
import type { PaywallOutcome, PaywallStore } from './paywall';

// The public iOS key ships in every build. It names JustGO's Superwall app 60560.
export const superwallApiKey = 'pk_weeyKXc6nLaH3eMSkyjhB';

// Superwall sends only the events it needs to serve paywalls and record
// purchases. It drops user attributes, placement fires and custom tracking.
// The default, `all`, sends events at startup, so the option is always passed.
export const superwallOptions = {
  eventTrackingBehavior: 'superwallOnly',
} as const satisfies PartialSuperwallOptions;

type Store = typeof useSuperwallStore;
type Native = Pick<typeof SuperwallExpoModule, 'addListener'>;

const identifiedUser = (user: UserAttributes | null | undefined) =>
  typeof user?.appUserId === 'string' && user.appUserId !== ''
    ? user.appUserId
    : null;

/**
 * Keeps Superwall's user equal to the JustGO account that owns the phone.
 * A signed-in account, or a guest's server account, is identified by its
 * account ID and nothing else, so Apple's appAccountToken names the buyer. A
 * guest with no server account yet stays anonymous, and leaving an account
 * resets Superwall to a new anonymous user.
 *
 * This never mounts `SuperwallProvider`. That provider forwards every link the
 * app opens to Superwall, including the `justgo://auth/callback` sign-in link.
 */
export class SuperwallBilling {
  private owner: string | null = null;
  private running = false;
  private again = false;

  constructor(private readonly store: Store = useSuperwallStore) {}

  start() {
    const stopListeners = this.store.getState()._initListeners();
    const unsubscribe = this.store.subscribe((state, previous) => {
      if (state.isConfigured && !previous.isConfigured) void this.reconcile();
    });
    const { isConfigured, isLoading, configure } = this.store.getState();
    // React can restart effects, and native Superwall configures once.
    if (!isConfigured && !isLoading)
      void configure(superwallApiKey, superwallOptions);
    else void this.reconcile();
    return () => {
      unsubscribe();
      stopListeners();
    };
  }

  changeOwner(owner: string | null) {
    if (this.owner === owner) return;
    this.owner = owner;
    void this.reconcile();
  }

  private async reconcile() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        const state = this.store.getState();
        if (!state.isConfigured) return;
        const owner = this.owner;
        if (owner === identifiedUser(state.user)) continue;
        try {
          if (owner) await state.identify(owner);
          else await state.reset();
        } catch {
          // Billing never blocks the app. An owner change queued during this
          // pass still runs, and otherwise the next change or launch retries.
        }
      } while (this.again);
    } finally {
      this.running = false;
    }
  }
}

export function createSuperwallBilling(enabled: boolean) {
  return enabled ? new SuperwallBilling() : null;
}

let handlers = 0;

/**
 * Shows the placement's paywall and reports how it closed. Superwall resolves
 * `registerPlacement` only when it lets the person through, so the paywall's
 * own events, matched by handler, report a decline, a skip or an error.
 */
export class SuperwallPaywallStore implements PaywallStore {
  constructor(
    private readonly store: Store = useSuperwallStore,
    private readonly native: Native = SuperwallExpoModule,
  ) {}

  present(placement: 'start_challenge') {
    const handlerId = `justgo:${placement}:${++handlers}`;
    return new Promise<PaywallOutcome>((resolve) => {
      let presented = false;
      let done = false;
      // The last purchase on this paywall that did not go through. Superwall
      // keeps the paywall open after one, so it shows only in a later decline.
      let unfinished: 'pending' | 'failed' | null = null;
      const finish = (outcome: PaywallOutcome) => {
        if (done) return;
        done = true;
        for (const subscription of subscriptions) subscription.remove();
        resolve(outcome);
      };
      const ours = (event: { handlerId?: string }) =>
        event.handlerId === handlerId;
      const subscriptions = [
        this.native.addListener('onPaywallPresent', (event) => {
          if (ours(event)) presented = true;
        }),
        this.native.addListener('onPaywallDismiss', (event) => {
          if (ours(event)) finish(closed(event.result, unfinished));
        }),
        // No audience, a holdout or a missing placement shows no paywall.
        this.native.addListener('onPaywallSkip', (event) => {
          if (ours(event)) finish({ type: 'failed' });
        }),
        this.native.addListener('onPaywallError', (event) => {
          if (ours(event)) finish({ type: 'failed' });
        }),
        // Transaction events name no handler. Only one paywall shows at a time.
        this.native.addListener('handleSuperwallEvent', ({ eventInfo }) => {
          if (!presented) return;
          const { event } = eventInfo;
          if (event.event === 'transactionStart') unfinished = null;
          else if (event.event === 'transactionFail')
            // Superwall reports Ask to Buy as a failure that needs approval.
            unfinished = /approval/i.test(event.error) ? 'pending' : 'failed';
        }),
      ];
      this.store
        .getState()
        .registerPlacement(placement, undefined, handlerId)
        .then(
          // With no paywall shown, Superwall already counts the person as subscribed.
          () => {
            if (!presented) finish({ type: 'entitled' });
          },
          () => finish({ type: 'failed' }),
        );
    });
  }

  async restore() {
    try {
      const { result } = await this.store.getState().restorePurchases();
      return result;
    } catch {
      return 'failed' as const;
    }
  }

  /** The newest App Store transaction on this phone, for the API to verify. */
  async latestTransactionId() {
    const info = await this.store.getState().getCustomerInfo();
    const transactions = [
      ...(info?.subscriptions ?? []),
      ...(info?.nonSubscriptions ?? []),
    ];
    let newest: (typeof transactions)[number] | undefined;
    for (const transaction of transactions)
      if (
        !newest ||
        Date.parse(transaction.purchaseDate) > Date.parse(newest.purchaseDate)
      )
        newest = transaction;
    return newest?.transactionId ?? null;
  }
}

const closed = (
  result: PaywallResult,
  unfinished: 'pending' | 'failed' | null,
): PaywallOutcome => {
  switch (result.type) {
    case 'purchased':
      return { type: 'purchased' };
    case 'restored':
      return { type: 'restored' };
    case 'declined':
      return { type: unfinished ?? 'declined' };
  }
};

export function createSuperwallPaywallStore(enabled: boolean) {
  return enabled ? new SuperwallPaywallStore() : null;
}
