import {
  CURRENT_ACCEPTANCE_VERSIONS,
  accountAcceptanceResponseSchema,
  hasCurrentAcceptance,
  isAnalyticsEligible,
  type AcceptanceReceipt,
} from '@justgo/contracts';
import type { AccountClient } from '../../lib/network/account-client';

type Identity = {
  initialized: boolean;
  busy: boolean;
  account: { userId: string } | null;
  deletionStatus: string | null;
};
type Snapshot = {
  userId: string | null;
  status: 'disconnected' | 'loading' | 'required' | 'accepted' | 'error';
  receipt: AcceptanceReceipt | null;
  confirmed: boolean;
  identityReady: boolean;
  analyticsRestricted: boolean | null;
  saving: boolean;
  message: string;
};
type AnalyticsEvent = { userId: string; occurredAt: string };
export type AnalyticsTicket = Readonly<{
  generation: number;
  event: Readonly<AnalyticsEvent>;
}>;

/** The receipt is server-owned; every response and delivery belongs to one identity generation. */
export class AcceptanceController {
  private listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private sequence = 0;
  private generation = 0;
  private active = true;
  private snapshot: Snapshot = {
    userId: null,
    status: 'disconnected',
    receipt: null,
    confirmed: false,
    identityReady: false,
    analyticsRestricted: null,
    saving: false,
    message: '',
  };
  constructor(
    private readonly client: Pick<AccountClient, 'request' | 'ownsAccount'>,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  changeIdentity(identity: Identity) {
    const userId =
      identity.initialized && !identity.deletionStatus
        ? (identity.account?.userId ?? null)
        : null;
    const identityReady = !!userId && !identity.busy;
    if (userId !== this.snapshot.userId) {
      this.request?.abort();
      this.sequence++;
      this.generation++;
      this.update({
        userId,
        identityReady,
        status: userId ? 'loading' : 'disconnected',
        receipt: null,
        confirmed: false,
        analyticsRestricted: null,
        saving: false,
        message: '',
      });
      if (userId) void this.refresh(); // refresh owns all transport failures.
    } else if (identityReady !== this.snapshot.identityReady) {
      this.generation++;
      this.update({ identityReady });
    }
  }
  private async perform(accept: boolean): Promise<boolean> {
    const userId = this.snapshot.userId;
    if (!userId || !this.client.ownsAccount(userId)) return false;
    if (accept && (this.snapshot.saving || !this.snapshot.identityReady))
      return false;
    if (!accept && this.snapshot.saving) return false;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const sequence = ++this.sequence;
    this.generation++;
    this.update({
      confirmed: false,
      saving: accept,
      message: '',
      status: hasCurrentAcceptance(this.snapshot.receipt, userId)
        ? 'accepted'
        : 'loading',
    });
    const current = () =>
      this.sequence === sequence &&
      this.snapshot.userId === userId &&
      !request.signal.aborted;
    try {
      const result = await this.client.request(
        '/v1/account/acceptance',
        accountAcceptanceResponseSchema,
        {
          signal: request.signal,
          ...(accept
            ? { method: 'PUT' as const, body: CURRENT_ACCEPTANCE_VERSIONS }
            : {}),
        },
      );
      if (!current()) return false;
      if (
        result.userId !== userId ||
        (result.receipt && result.receipt.userId !== userId)
      )
        throw new Error('Acceptance owner mismatch');
      const accepted = hasCurrentAcceptance(result.receipt, userId);
      this.update({
        status: accepted ? 'accepted' : 'required',
        receipt: result.receipt,
        confirmed: true,
        analyticsRestricted: result.analyticsRestricted,
      });
      return accepted;
    } catch {
      if (current())
        this.update({
          status: hasCurrentAcceptance(this.snapshot.receipt, userId)
            ? 'accepted'
            : 'error',
          confirmed: false,
          analyticsRestricted: null,
          message: accept
            ? 'Couldn’t save your acceptance. Please try again.'
            : 'Couldn’t check your acceptance. Please try again.',
        });
      return false;
    } finally {
      if (current()) {
        this.request = null;
        this.update({ saving: false });
      }
    }
  }
  refresh = async () => {
    await this.perform(false);
  };
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.invalidate();
  }
  accept = () => this.perform(true);
  /** Call before privacy-state reconciliation; old work cannot become eligible again. */
  invalidate = () => {
    this.request?.abort();
    this.sequence++;
    this.generation++;
    this.update({ confirmed: false, analyticsRestricted: null, saving: false });
  };
  capture(event: AnalyticsEvent): AnalyticsTicket | null {
    const ticket = Object.freeze({
      generation: this.generation,
      event: Object.freeze({ ...event }),
    });
    return this.canDeliver(ticket) ? ticket : null;
  }
  canDeliver(ticket: AnalyticsTicket): boolean {
    return (
      ticket.generation === this.generation &&
      isAnalyticsEligible({
        identityReady: this.snapshot.identityReady && this.active,
        acceptanceConfirmed: this.snapshot.confirmed,
        currentUserId: this.snapshot.userId,
        receipt: this.snapshot.receipt,
        analyticsRestricted: this.snapshot.analyticsRestricted,
        event: ticket.event,
      })
    );
  }
}
