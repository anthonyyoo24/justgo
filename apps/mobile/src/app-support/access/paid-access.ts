import { accessResponseSchema, type AccessResponse } from '@justgo/contracts';
import { z } from 'zod';
import type { JournalStorage } from '../../data/activity/model';
import type {
  AccountClient,
  GuestAccountClient,
} from '../../lib/network/account-client';
import { ApiError } from '../../lib/network/http';

export type AccessOwner = { id: string; kind: 'account' | 'guest' };

const refreshAfterMs = 5 * 60_000;
const savedAccessSchema = z
  .object({
    version: z.literal(1),
    owner: z
      .object({ id: z.string(), kind: z.enum(['account', 'guest']) })
      .strict(),
    // Device time when the answer arrived. The server's checkedAt is never
    // compared with the device clock, so a phone clock behind the server
    // still accepts a fresh answer.
    receivedAt: z.number().int().nonnegative(),
    access: accessResponseSchema,
  })
  .strict();
type SavedAccess = z.infer<typeof savedAccessSchema>;

const sameOwner = (a: AccessOwner | null, b: AccessOwner | null) =>
  a?.id === b?.id && a?.kind === b?.kind;
const isFresh = (saved: SavedAccess | null, now: number) =>
  !!saved && saved.receivedAt <= now && now - saved.receivedAt < refreshAfterMs;
/** The server's remaining time, counted from receipt. A clock set back before receipt fails closed. */
const grantsAccess = (saved: SavedAccess | null, now: number) =>
  saved?.access.status === 'verified' &&
  saved.receivedAt <= now &&
  now - saved.receivedAt <
    Date.parse(saved.access.expiresAt) - Date.parse(saved.access.checkedAt);

/**
 * The API-verified access of the current owner, saved per owner so it works
 * offline until its verified expiry. It only ever requires access: nothing on
 * the phone can grant it.
 */
export class PaidAccess {
  private owner: AccessOwner | null = null;
  private saved: SavedAccess | null = null;
  private generation = 0;
  private hydration: Promise<void> = Promise.resolve();
  private check: Promise<void> | null = null;
  // Only the newest check or verification saves, so an answer asked before a purchase cannot undo it.
  private latest: object | null = null;
  private writes: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly options: {
      url: string | undefined;
      storage: JournalStorage;
      client: AccountClient;
      /** A guest's server account. Without it a guest reads the guest route. */
      guestClient?: GuestAccountClient | null;
      now?: () => number;
      /** The store's newest active subscription transaction on this phone. */
      latestTransactionId?: () => Promise<string | null>;
    },
  ) {}
  private now() {
    return (this.options.now ?? Date.now)();
  }
  private key(owner: AccessOwner) {
    // Account erasure removes this namespace. Adoption, backups and sync copy
    // explicit activity records, never this key.
    return `justgo:v1:${owner.id}:access:${owner.kind}:${encodeURIComponent(this.options.url ?? '')}`;
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
  /** Calls the listener whenever the saved answer or its owner changes. */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  ownerId() {
    return this.owner?.id ?? null;
  }
  changeOwner(owner: AccessOwner | null) {
    if (sameOwner(this.owner, owner)) return;
    this.owner = owner;
    this.saved = null;
    this.check = null;
    this.latest = null;
    const generation = ++this.generation;
    this.hydration = owner
      ? this.hydrate(owner, generation)
      : Promise.resolve();
    this.emit();
    void this.refresh();
  }
  private async hydrate(owner: AccessOwner, generation: number) {
    try {
      const raw = await this.options.storage.getItem(this.key(owner));
      const parsed =
        raw === null ? null : savedAccessSchema.safeParse(JSON.parse(raw));
      if (
        parsed?.success &&
        sameOwner(parsed.data.owner, owner) &&
        generation === this.generation
      ) {
        this.saved = parsed.data;
        this.emit();
      }
    } catch {
      // An unreadable snapshot counts as missing, so the next check replaces it.
    }
  }
  /** Starts a check or verification that supersedes any earlier one. Concurrent refreshes join it. */
  private begin<T>(work: (run: object) => Promise<T>) {
    const run = {};
    this.latest = run;
    const result = work(run);
    // Cleared before the promise settles, so a trigger that arrives later starts a new check.
    this.check = result.then(
      () => this.finish(run),
      () => this.finish(run),
    );
    this.emit();
    return result;
  }
  private finish(run: object) {
    if (this.latest !== run) return;
    this.check = null;
    // A failed first check leaves no answer, so the app moves from checking to locked.
    this.emit();
  }
  /** Checks with the API when the snapshot is missing or older than five minutes. Concurrent calls share one check. */
  refresh(): Promise<void> {
    const owner = this.owner;
    if (!owner) return Promise.resolve();
    if (!this.check)
      void this.begin(async (run) => {
        await this.hydration;
        if (this.latest !== run || isFresh(this.saved, this.now())) return;
        try {
          this.save(owner, run, await this.ask(owner));
        } catch {
          // A failed check never replaces a saved verification.
        }
      });
    return this.check ?? Promise.resolve();
  }
  /**
   * An account, or a guest with its server account, posts the phone's newest
   * transaction only when its own answer is unpaid, which covers a purchase
   * whose verification never finished. A guest whose server account is not
   * made yet reads the guest route, which never answers paid.
   */
  private async ask(owner: AccessOwner) {
    const bearer = this.bearer(owner);
    if (!bearer)
      return this.options.client.requestGuest(
        '/v1/guest/access',
        accessResponseSchema,
      );
    const access = await bearer.request('/v1/access', accessResponseSchema);
    if (access.status !== 'unpaid') return access;
    const transactionId = await this.latestTransactionId();
    if (!transactionId) return access;
    return this.post(owner, transactionId).catch(() => access);
  }
  /** The client whose bearer names the owner, or null for a guest with no server account yet. */
  private bearer(owner: AccessOwner): GuestAccountClient | null {
    const { client, guestClient } = this.options;
    return owner.kind === 'account' ? client : (guestClient ?? null);
  }
  private async latestTransactionId() {
    try {
      return (await this.options.latestTransactionId?.()) ?? null;
    } catch {
      return null;
    }
  }
  private post(owner: AccessOwner, transactionId: string) {
    const bearer = this.bearer(owner);
    // A guest's purchase verifies only under its own server account.
    if (!bearer) return Promise.reject(new ApiError('UNAVAILABLE'));
    return bearer.request('/v1/billing/verifications', accessResponseSchema, {
      method: 'POST',
      body: { transactionId },
    });
  }
  /**
   * Verifies a purchase now, whatever the age of the saved answer. Resolves
   * with the server's answer and saves a verified or unpaid one. A failure
   * keeps the saved answer and rejects with the client error.
   */
  verifyPurchase(transactionId: string): Promise<AccessResponse> {
    const owner = this.owner;
    if (!owner) return Promise.reject(new ApiError('UNAUTHORIZED'));
    const generation = this.generation;
    return this.begin(async (run) => {
      await this.hydration;
      const access = await this.post(owner, transactionId);
      if (generation !== this.generation) throw new ApiError('ACCOUNT_CHANGED');
      this.save(owner, run, access);
      return access;
    });
  }
  private save(owner: AccessOwner, run: object, access: AccessResponse) {
    if (this.latest !== run || access.status === 'unavailable') return;
    const saved: SavedAccess = {
      version: 1,
      owner,
      receivedAt: this.now(),
      access,
    };
    this.saved = saved;
    this.writes = this.writes
      .then(() =>
        this.options.storage.setItem(this.key(owner), JSON.stringify(saved)),
      )
      .catch(() => {});
    this.emit();
  }
  /** Whether the saved verification grants access now. It starts no check. */
  hasAccess() {
    return grantsAccess(this.saved, this.now());
  }
  /**
   * Whether the app opens: `open` with a saved verification that grants
   * access now, `checking` while the owner's first answer is on its way, and
   * otherwise `locked`. A check that fails leaves the app locked.
   */
  status(): 'open' | 'checking' | 'locked' {
    if (this.hasAccess()) return 'open';
    return this.owner && this.check && !this.saved ? 'checking' : 'locked';
  }
  /** Whether the saved verification still grants access. A refusal starts an online check. */
  canStart() {
    if (this.hasAccess()) return true;
    void this.refresh();
    return false;
  }
  /** Resolves once every saved snapshot reached storage, so an erase cannot race a late write. */
  async settled() {
    let writes;
    do {
      writes = this.writes;
      await writes;
    } while (writes !== this.writes);
  }
}
