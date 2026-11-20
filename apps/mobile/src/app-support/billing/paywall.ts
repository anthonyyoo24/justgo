import type { PaidAccess } from '../access/paid-access';
import { ApiError, type ClientErrorCode } from '../../lib/network/http';

/** What the store reports when its paywall closes. */
export type PaywallOutcome =
  | { type: 'purchased' }
  | { type: 'restored' }
  | { type: 'entitled' }
  | { type: 'declined' }
  | { type: 'pending' }
  | { type: 'failed' };
/** The store SDK, kept behind a port so nothing here imports it. */
export type PaywallStore = {
  present(placement: 'start_challenge'): Promise<PaywallOutcome>;
  latestTransactionId(): Promise<string | null>;
};
/**
 * Where an unlock stands. A purchase unlocks only once the API verifies it:
 * `pending` means Apple took the purchase or is waiting for approval, and the
 * API has not confirmed it yet.
 */
export type PaywallState =
  | { status: 'idle' }
  | { status: 'presenting' }
  | { status: 'verifying' }
  | { status: 'pending'; awaiting: 'confirmation' | 'approval' }
  | { status: 'refused' }
  | { status: 'failed' }
  | { status: 'verified' };

// Answers that mean the API looked at the purchase and will not grant it.
// Anything else may still verify later, so the purchase stays pending.
const refusals = new Set<ClientErrorCode>([
  'CONFLICT',
  'NOT_FOUND',
  'INVALID_REQUEST',
]);
const idle: PaywallState = { status: 'idle' };

/**
 * Opens the paywall when a challenge needs access and unlocks only on the
 * API's verified answer. A pending purchase unlocks later through any check
 * that verifies it, and never starts a challenge by itself.
 */
export class Paywall {
  private state: PaywallState = idle;
  private opening: Promise<boolean> | null = null;
  // The flow allowed to change the state. Dismissing or an owner change drops it.
  private flow: object | null = null;
  private owner: string | null = null;
  private unwatch: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly options: {
      access: PaidAccess;
      store: PaywallStore;
      timeoutMs?: number;
    },
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  /** Resolves true only when the API verified access. Concurrent calls present once. */
  open = (): Promise<boolean> => {
    this.opening ??= this.present().finally(() => {
      this.opening = null;
    });
    return this.opening;
  };
  /** Asks the API again for a purchase waiting on confirmation. It never presents the paywall. */
  retry = async () => {
    const { state } = this;
    if (
      this.opening ||
      state.status !== 'pending' ||
      state.awaiting !== 'confirmation'
    )
      return;
    const flow = this.begin({ status: 'verifying' });
    const result = await this.confirm();
    if (this.flow !== flow) return;
    this.settle(result === 'verified' ? { status: 'verified' } : result);
  };
  /** Closes the notice. A verification still running keeps saving its answer. */
  dismiss = () => {
    this.flow = null;
    this.unwatch?.();
    this.unwatch = null;
    this.set(idle);
  };
  private async present() {
    const flow = this.begin({ status: 'presenting' });
    let outcome: PaywallOutcome;
    try {
      outcome = await this.options.store.present('start_challenge');
    } catch {
      outcome = { type: 'failed' };
    }
    if (this.flow !== flow) return false;
    switch (outcome.type) {
      case 'declined':
        this.dismiss();
        return false;
      case 'pending':
        this.settle({ status: 'pending', awaiting: 'approval' });
        return false;
      case 'failed':
        this.settle({ status: 'failed' });
        return false;
      case 'purchased':
      case 'restored':
      case 'entitled':
        break;
    }
    this.set({ status: 'verifying' });
    const result = await this.confirm();
    if (this.flow !== flow) return false;
    if (result === 'verified') {
      this.dismiss();
      return true;
    }
    this.settle(result);
    return false;
  }
  /** Posts the store's newest transaction, giving up to pending after the timeout. */
  private async confirm(): Promise<'verified' | PaywallState> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<PaywallState>((resolve) => {
      timer = setTimeout(
        () => resolve({ status: 'pending', awaiting: 'confirmation' }),
        this.options.timeoutMs ?? 10_000,
      );
    });
    try {
      return await Promise.race([this.verify(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
  private async verify(): Promise<'verified' | PaywallState> {
    const { access, store } = this.options;
    const pending: PaywallState = {
      status: 'pending',
      awaiting: 'confirmation',
    };
    try {
      const transactionId = await store.latestTransactionId();
      if (!transactionId) return pending;
      const answer = await access.verifyPurchase(transactionId);
      if (answer.status === 'verified' && access.hasAccess()) return 'verified';
      return answer.status === 'unpaid' ? { status: 'refused' } : pending;
    } catch (error) {
      return error instanceof ApiError && refusals.has(error.code)
        ? { status: 'refused' }
        : pending;
    }
  }
  private begin(state: PaywallState) {
    const flow = {};
    this.flow = flow;
    this.owner = this.options.access.ownerId();
    this.unwatch ??= this.options.access.subscribe(this.onAccess);
    this.set(state);
    return flow;
  }
  /** Ends the flow on a notice that waits for the person. */
  private settle(state: PaywallState) {
    this.flow = null;
    this.set(state);
  }
  private onAccess = () => {
    const { access } = this.options;
    if (access.ownerId() !== this.owner) this.dismiss();
    else if (this.state.status === 'pending' && access.hasAccess())
      this.set({ status: 'verified' });
  };
  private set(state: PaywallState) {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
