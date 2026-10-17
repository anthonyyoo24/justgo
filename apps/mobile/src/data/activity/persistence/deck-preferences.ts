import {
  challengeCardSchema,
  venueSchema,
  type Venue,
} from '@justgo/contracts';
import { z } from 'zod';
import type { JournalStorage } from '../model';

export type DeckPreferences = {
  selected: Venue;
  orders: Partial<Record<Venue, string[]>>;
};

const envelopeSchema = z
  .object({
    version: z.literal(1),
    accountId: z.uuid(),
    selected: z.preprocess(
      (value) => (venueSchema.safeParse(value).success ? value : 'streets'),
      venueSchema,
    ),
    orders: z.partialRecord(venueSchema, z.array(challengeCardSchema.shape.id)),
  })
  .strict()
  .superRefine((envelope, context) => {
    const ids = Object.values(envelope.orders).flat();
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', message: 'Duplicate deck placement' });
  });

function copy(value: DeckPreferences | null): DeckPreferences | null {
  if (!value) return null;
  return {
    selected: value.selected,
    orders: Object.fromEntries(
      Object.entries(value.orders).map(([venue, order]) => [venue, [...order]]),
    ),
  };
}

// This optional phone-only state has no effect on submitted activity durability.
export class DeckPreferencesStorage {
  private readonly key: string;
  private hydration: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private persisted: string | null = null;
  private pending: { serialized: string } | null = null;
  private latest: DeckPreferences | null = null;
  private saved = false;
  private stopped = false;

  constructor(
    private readonly accountId: string,
    private readonly storage: JournalStorage,
  ) {
    this.key = `justgo:v1:${accountId}:decks`;
  }

  read(): Promise<DeckPreferences | null> {
    if (this.stopped || this.saved) return Promise.resolve(copy(this.latest));
    this.hydration ??= this.readStored();
    return this.hydration.then(() => copy(this.latest));
  }

  private async readStored(): Promise<void> {
    try {
      const raw = await this.storage.getItem(this.key);
      if (!raw) return;
      const parsed = envelopeSchema.safeParse(JSON.parse(raw));
      if (
        parsed.success &&
        parsed.data.accountId === this.accountId &&
        !this.saved &&
        !this.stopped
      ) {
        this.latest = {
          selected: parsed.data.selected,
          orders: parsed.data.orders,
        };
        this.persisted = JSON.stringify(parsed.data);
      }
    } catch {
      // Unreadable or invalid preferences are replaceable with a fresh shuffle.
    }
  }

  save(value: DeckPreferences): void {
    if (this.stopped) return;
    const parsed = envelopeSchema.safeParse({
      ...value,
      version: 1,
      accountId: this.accountId,
    });
    if (!parsed.success) return;
    this.saved = true;
    this.latest = {
      selected: parsed.data.selected,
      orders: parsed.data.orders,
    };
    const serialized = JSON.stringify(parsed.data);
    if (
      serialized === this.pending?.serialized ||
      (!this.pending && serialized === this.persisted)
    )
      return;
    const pending = { serialized };
    this.pending = pending;
    this.writes = this.writes.then(async () => {
      try {
        await this.storage.setItem(this.key, serialized);
        this.persisted = serialized;
      } catch {
        // Keep live decks usable; a later change can retry this optional state.
      } finally {
        if (this.pending === pending) this.pending = null;
      }
    });
  }

  async settled(): Promise<void> {
    let pending: Promise<void>;
    do {
      pending = this.writes;
      await pending;
    } while (pending !== this.writes);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.all([this.hydration, this.settled()]);
  }
}
