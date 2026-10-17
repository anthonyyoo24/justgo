import { randomUUID } from 'expo-crypto';
import { createStore } from 'zustand/vanilla';
import {
  venues,
  type Attempt,
  type Catalog,
  type ChallengeCard,
  type CreateAttempt,
  type Venue,
} from '@justgo/contracts';
import type { AccountClient } from '../../lib/network/account-client';
import type { AccountRepository } from '../../data/activity/repository';
import { readChallengeCatalog } from './api';
import { reconcileDeckOrder } from './deck/deck-order';
import type { DeckPreferences } from '../../data/activity/persistence/deck-preferences';

export type ChallengeStart = {
  card: ChallengeCard;
  startedAt: string;
  startTimeZone: string;
  turn: number;
};
type Queue = { cards: ChallengeCard[]; turn: number };
export type ChallengeSnapshot = {
  selected: Venue;
  queues: Partial<Record<Venue, Queue>>;
  success: Attempt | null;
  loading: boolean;
  saving: boolean;
  completionStarted: boolean;
  error: string;
};
const initial = (): ChallengeSnapshot => ({
  selected: 'streets',
  queues: {},
  success: null,
  loading: false,
  saving: false,
  completionStarted: false,
  error: '',
});

/** Shared browsing and completion context; unfinished challenges belong to React. */
export class ChallengeController {
  readonly store = createStore<ChallengeSnapshot>(() => initial());
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  getSnapshot = this.store.getState;
  private userId: string | null = null;
  private generation = 0;
  private unsubscribe: (() => void) | undefined;
  private catalogRead: Promise<void> | undefined;
  private catalogAbort: AbortController | undefined;
  private completion: Promise<void> | undefined;
  private completionInput: CreateAttempt | undefined;
  private currentCatalog: Catalog | null = null;
  private readonly id: () => string;
  private readonly random: () => number;
  private preferences: DeckPreferences | null = null;
  private preferencesRead: Promise<void> | undefined;
  private preferencesReady = false;
  private selectionChanged = false;
  constructor(
    private readonly client: Pick<AccountClient, 'request'>,
    private readonly options: {
      repository: () => AccountRepository | null;
      id?: () => string;
      random?: () => number;
    },
  ) {
    this.id = options.id ?? randomUUID;
    this.random = options.random ?? Math.random;
  }
  private update = (value: Partial<ChallengeSnapshot>) =>
    this.store.setState(value);
  changeAccount(userId: string | null) {
    if (this.userId === userId) return;
    this.userId = userId;
    this.generation++;
    this.catalogAbort?.abort();
    this.unsubscribe?.();
    this.catalogRead = undefined;
    this.completion = undefined;
    this.completionInput = undefined;
    this.currentCatalog = null;
    this.preferences = null;
    this.preferencesRead = undefined;
    this.preferencesReady = false;
    this.selectionChanged = false;
    this.store.setState(initial(), true);
    const repository = this.options.repository();
    if (userId && repository?.accountId === userId) {
      const generation = this.generation;
      const read = () => {
        if (!this.preferencesReady || generation !== this.generation) return;
        const catalog = repository.store.getState().catalog;
        if (catalog && catalog !== this.currentCatalog)
          this.adoptCatalog(catalog);
      };
      this.unsubscribe = repository.store.subscribe(read);
      this.preferencesRead = repository.deckPreferences.read().then((saved) => {
        if (generation !== this.generation) return;
        this.preferences = saved;
        this.preferencesReady = true;
        if (!this.selectionChanged)
          this.update({ selected: saved?.selected ?? 'streets' });
        read();
        if (this.selectionChanged && !this.currentCatalog)
          this.savePreferences();
      });
    }
  }
  private adoptCatalog(catalog: Catalog) {
    // A malformed cache/download is a fetch failure, never a normal empty venue.
    if (
      venues.some(({ id }) => !catalog.cards.some((card) => card.venue === id))
    )
      return false;
    const queues: Partial<Record<Venue, Queue>> = {};
    for (const { id } of venues) {
      const prior = this.getSnapshot().queues[id];
      const cards = reconcileDeckOrder(
        catalog.cards.filter((card) => card.venue === id),
        prior?.cards.map((card) => card.id) ?? this.preferences?.orders[id],
        this.random,
      );
      queues[id] = {
        cards,
        turn: prior?.turn ?? 0,
      };
    }
    this.currentCatalog = catalog;
    this.update({ queues, error: '' });
    this.savePreferences();
    return true;
  }
  refresh = (): Promise<void> => {
    if (this.catalogRead) return this.catalogRead;
    const repository = this.options.repository();
    if (!this.userId || !repository) return Promise.resolve();
    const generation = this.generation;
    const abort = new AbortController();
    this.catalogAbort = abort;
    const work = async () => {
      this.update({ loading: true });
      try {
        await repository.hydrate();
        await this.preferencesRead;
        if (generation !== this.generation) return;
        const cached = repository.store.getState().catalog;
        if (cached) this.adoptCatalog(cached);
        if (repository.store.getState().online === false) {
          if (!this.currentCatalog)
            this.update({
              error: 'You’re offline. Connect to download your challenges.',
            });
          return;
        }
        const catalog = await readChallengeCatalog(this.client, abort.signal);
        if (generation !== this.generation) return;
        if (!this.adoptCatalog(catalog)) throw new Error('INVALID_CATALOG');
        await repository.cacheCatalog(catalog);
      } catch {
        // Optional refresh/cache failure never disables previously downloaded cards.
        if (generation === this.generation && !this.currentCatalog)
          this.update({
            error:
              'Your challenges couldn’t load. Check your connection and try again.',
          });
      } finally {
        if (generation === this.generation) {
          this.catalogRead = undefined;
          this.update({ loading: false });
        }
      }
    };
    this.catalogRead = work();
    return this.catalogRead;
  };
  select = (venue: Venue) => {
    if (!this.getSnapshot().saving && !this.getSnapshot().success) {
      this.selectionChanged = true;
      this.update({ selected: venue });
      this.savePreferences();
    }
  };
  private savePreferences() {
    const repository = this.options.repository();
    if (!this.preferencesReady || repository?.accountId !== this.userId) return;
    const state = this.getSnapshot();
    const orders: DeckPreferences['orders'] = { ...this.preferences?.orders };
    for (const { id } of venues) {
      const queue = state.queues[id];
      if (queue) orders[id] = queue.cards.map((card) => card.id);
    }
    this.preferences = { selected: state.selected, orders };
    repository.deckPreferences.save(this.preferences);
  }
  private rotate(venue: Venue, placementId?: string) {
    const state = this.getSnapshot();
    const queue = state.queues[venue];
    if (
      !queue?.cards.length ||
      (placementId !== undefined && queue.cards[0]?.id !== placementId)
    )
      return;
    this.update({
      queues: {
        ...state.queues,
        [venue]: {
          cards: [...queue.cards.slice(1), queue.cards[0]!],
          turn: queue.turn + 1,
        },
      },
    });
    this.savePreferences();
  }
  skip = (venue = this.getSnapshot().selected, placementId?: string) => {
    if (this.getSnapshot().completionStarted || this.getSnapshot().success)
      return;
    this.rotate(venue, placementId);
    this.update({ error: '' });
  };
  complete = (active: ChallengeStart): Promise<void> => {
    if (this.completion) return this.completion;
    if (this.getSnapshot().success) return Promise.resolve();
    const repository = this.options.repository();
    if (!repository) return Promise.resolve();
    const generation = this.generation;
    const input: CreateAttempt = this.completionInput ?? {
      id: this.id(),
      challengeId: active.card.challengeId,
      venue: active.card.venue,
      startedAt: active.startedAt,
      startTimeZone: active.startTimeZone,
    };
    this.completionInput = input;
    // The synchronous guard covers duplicate activation before the storage promise resolves.
    this.update({ saving: true, completionStarted: true, error: '' });
    this.completion = (async () => {
      try {
        await repository.setFlowAttempt(input.id);
        const attempt = await repository.complete(input, active.card);
        if (generation !== this.generation) return;
        this.rotate(active.card.venue, active.card.id);
        this.update({ success: attempt });
      } catch {
        // The repository owns storage/network fallback; retain this interrupted identity for retry.
        if (generation === this.generation)
          this.update({
            error: 'This challenge could not be recorded. Try Completed again.',
          });
      } finally {
        if (generation === this.generation) {
          this.completion = undefined;
          this.update({ saving: false });
        }
      }
    })();
    return this.completion;
  };
  dismissSuccess = async () => {
    this.completionInput = undefined;
    this.update({ success: null, completionStarted: false });
    await this.options.repository()?.setFlowAttempt(null);
  };
  dispose() {
    this.changeAccount(null);
    this.unsubscribe?.();
    this.catalogAbort?.abort();
  }
}
