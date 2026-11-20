import { accessResponseSchema } from '@justgo/contracts';
import { z } from 'zod';
import type { JournalStorage } from '../../data/activity/model';
import type { AccountClient } from '../../lib/network/account-client';

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
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private readonly options: {
      url: string | undefined;
      storage: JournalStorage;
      client: AccountClient;
      now?: () => number;
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
  ownerId() {
    return this.owner?.id ?? null;
  }
  changeOwner(owner: AccessOwner | null) {
    if (sameOwner(this.owner, owner)) return;
    this.owner = owner;
    this.saved = null;
    this.check = null;
    const generation = ++this.generation;
    this.hydration = owner
      ? this.hydrate(owner, generation)
      : Promise.resolve();
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
      )
        this.saved = parsed.data;
    } catch {
      // An unreadable snapshot counts as missing, so the next check replaces it.
    }
  }
  /** Checks with the API when the snapshot is missing or older than five minutes. Concurrent calls share one check. */
  refresh(): Promise<void> {
    if (!this.owner) return Promise.resolve();
    this.check ??= this.verify(this.owner, this.generation);
    return this.check;
  }
  private async verify(owner: AccessOwner, generation: number) {
    try {
      await this.hydration;
      if (generation !== this.generation || isFresh(this.saved, this.now()))
        return;
      const { client } = this.options;
      let access;
      try {
        access =
          owner.kind === 'account'
            ? await client.request('/v1/access', accessResponseSchema)
            : await client.requestGuest(
                '/v1/guest/access',
                accessResponseSchema,
              );
      } catch {
        // A failed check never replaces a saved verification.
        return;
      }
      if (generation !== this.generation || access.status === 'unavailable')
        return;
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
    } finally {
      // Cleared before the promise settles, so a trigger that arrives later starts a new check.
      if (generation === this.generation) this.check = null;
    }
  }
  /** Whether the saved verification still grants access. A refusal starts an online check. */
  canStart() {
    if (grantsAccess(this.saved, this.now())) return true;
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
