import {
  useSuperwallStore,
  type PartialSuperwallOptions,
  type UserAttributes,
} from 'expo-superwall';

// The public iOS key ships in every build. It names JustGO's Superwall app 60560.
export const superwallApiKey = 'pk_weeyKXc6nLaH3eMSkyjhB';

// Superwall sends only the events it needs to serve paywalls and record
// purchases. It drops user attributes, placement fires and custom tracking.
// The default, `all`, sends events at startup, so the option is always passed.
export const superwallOptions = {
  eventTrackingBehavior: 'superwallOnly',
} as const satisfies PartialSuperwallOptions;

type Store = typeof useSuperwallStore;

const identifiedUser = (user: UserAttributes | null | undefined) =>
  typeof user?.appUserId === 'string' && user.appUserId !== ''
    ? user.appUserId
    : null;

/**
 * Keeps Superwall's user equal to the JustGO account that owns the phone.
 * A signed-in account is identified by its owner ID and nothing else, so
 * Apple's appAccountToken names the buyer. A guest stays anonymous, and
 * leaving an account resets Superwall to a new anonymous user.
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
        if (owner) await state.identify(owner);
        else await state.reset();
      } while (this.again);
    } catch {
      // Billing never blocks the app. The next owner change or launch retries.
    } finally {
      this.running = false;
    }
  }
}

export function createSuperwallBilling(enabled: boolean) {
  return enabled ? new SuperwallBilling() : null;
}
