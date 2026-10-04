import { randomUUID } from 'expo-crypto';
import {
  legacyAttemptResultSchema as attemptResultSchema,
  legacyChallengeStateSchema as challengeStateSchema,
  okSchema,
  legacyQueueSchema as queueSchema,
  venues,
  type LegacyAttempt as Attempt,
  type LegacyChallengeQueue as ChallengeQueue,
  type LegacyChallengeState as ChallengeState,
  type Venue,
} from '@justgo/contracts';
import { AccountClient, accountKey } from '../../lib/account-client';
import { ApiError } from '../../lib/http';
type Pending =
  | {
      kind: 'start';
      body: {
        attemptId: string;
        venue: Venue;
        cardId: string;
        revisionId: string;
        queueVersion: number;
      };
    }
  | {
      kind: 'skip';
      body: {
        actionId: string;
        venue: Venue;
        cardId: string;
        revisionId: string;
        queueVersion: number;
      };
    }
  | {
      kind: 'finish';
      body: {
        attemptId: string;
        outcome: 'completed' | 'given_up';
        timeZone: string;
      };
    };
type Snapshot = {
  state: ChallengeState | null;
  queues: Partial<Record<Venue, ChallengeQueue>>;
  selected: Venue;
  busy: boolean;
  pending: Pending | null;
  error: string;
  success: Attempt | null;
  clockOffset: number;
};
const initial = (): Snapshot => ({
  state: null,
  queues: {},
  selected: 'streets',
  busy: false,
  pending: null,
  error: '',
  success: null,
  clockOffset: 0,
});
export class ChallengeController {
  private snapshot = initial();
  private listeners = new Set<() => void>();
  private userId: string | null = null;
  private epoch = 0;
  private cacheBatches = 0;
  constructor(
    private readonly client: Pick<AccountClient, 'request' | 'queries'>,
    private readonly id = randomUUID,
  ) {
    // TanStack owns server data; this controller projects it with transient action state.
    client.queries.getQueryCache().subscribe((event) => {
      // useQuery can create/update observers while another route renders. Those
      // events (and unrelated access queries) must not notify ChallengeScreen.
      if (
        this.cacheBatches ||
        !this.key().every((part, i) => event.query.queryKey[i] === part)
      )
        return;
      if (
        event.type === 'removed' ||
        (event.type === 'updated' &&
          (event.action.type === 'success' || event.action.type === 'setState'))
      )
        this.update({});
    });
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private key(...parts: string[]) {
    return accountKey(this.userId ?? 'disconnected', 'challenges', ...parts);
  }
  private update(value: Partial<Omit<Snapshot, 'state' | 'queues'>>) {
    const queues: Snapshot['queues'] = {};
    for (const { id } of venues) {
      const queue = this.client.queries.getQueryData<ChallengeQueue>(
        this.key('queue', id),
      );
      if (queue) queues[id] = queue;
    }
    this.snapshot = {
      ...this.snapshot,
      ...value,
      queues,
      state:
        this.client.queries.getQueryData<ChallengeState>(this.key('state')) ??
        null,
    };
    this.listeners.forEach((fn) => fn());
  }
  changeAccount(userId: string | null) {
    if (this.userId === userId) return;
    this.client.queries.removeQueries({ queryKey: this.key() });
    this.userId = userId;
    this.epoch++;
    this.snapshot = initial();
    this.update({});
  }
  private assert(epoch: number) {
    if (epoch !== this.epoch) throw new ApiError('ACCOUNT_CHANGED');
  }
  // Publish a screen transition only after its state and queue agree. Cache
  // notifications between these writes would expose a stale deck or theme.
  private async batchCache(work: () => Promise<void>) {
    this.cacheBatches++;
    try {
      await work();
    } finally {
      this.cacheBatches--;
    }
  }
  private queue(value: ChallengeQueue) {
    this.client.queries.setQueryData<ChallengeQueue>(
      this.key('queue', value.venue),
      (old) => (!old || value.version >= old.version ? value : old),
    );
  }
  private readQueue(venue: Venue, epoch: number) {
    const key = this.key('queue', venue);
    return this.client.queries.fetchQuery({
      queryKey: key,
      // Kept for this account session; an unattended active timer must not be GC'd.
      gcTime: Infinity,
      queryFn: async ({ signal }) => {
        const value = await this.client.request(
          `/v1/challenges/queue/${venue}`,
          queueSchema,
          { signal },
        );
        this.assert(epoch);
        const old = this.client.queries.getQueryData<ChallengeQueue>(key);
        return old && old.version > value.version ? old : value;
      },
    });
  }
  private async canonical(epoch: number) {
    const state = await this.client.request(
      '/v1/challenges/state',
      challengeStateSchema,
    );
    this.assert(epoch);
    await this.batchCache(async () => {
      await this.readQueue(
        state.active?.card.venue ?? state.selectedVenue,
        epoch,
      );
      this.assert(epoch);
      this.client.queries.setQueryDefaults(this.key('state'), {
        gcTime: Infinity,
      });
      this.client.queries.setQueryData(this.key('state'), state);
    });
    this.assert(epoch);
    this.update({
      selected: state.selectedVenue,
      clockOffset: Date.parse(state.serverNow) - Date.now(),
    });
  }
  refresh = async () => {
    if (!this.userId || this.snapshot.busy || this.snapshot.pending) return;
    const epoch = this.epoch;
    this.update({ busy: true, error: '' });
    try {
      await this.canonical(epoch);
    } catch (error) {
      if (epoch === this.epoch) this.update({ error: this.message(error) });
    } finally {
      if (epoch === this.epoch) this.update({ busy: false });
    }
    // Prefetch complete small queues, while rendering only four cards.
    if (epoch === this.epoch && this.snapshot.state)
      for (const { id } of venues) {
        if (!this.snapshot.queues[id])
          void this.readQueue(id, epoch).catch(() => {});
      }
  };
  select = async (venue: Venue) => {
    if (this.snapshot.busy || this.snapshot.pending) return;
    const epoch = this.epoch;
    this.update({ busy: true, error: '' });
    try {
      await this.client.request('/v1/challenges/venue', okSchema, {
        body: { venue },
      });
      this.assert(epoch);
      await this.readQueue(venue, epoch);
      this.assert(epoch);
      this.update({ selected: venue });
    } catch (error) {
      if (epoch === this.epoch) this.update({ error: this.message(error) });
    } finally {
      if (epoch === this.epoch) this.update({ busy: false });
    }
  };
  act = async (direction: -1 | 1) => {
    if (
      this.snapshot.busy ||
      this.snapshot.pending ||
      this.snapshot.state?.active
    )
      return;
    const queue = this.snapshot.queues[this.snapshot.selected],
      card = queue?.cards[0];
    if (!queue || !card) return;
    const selection = {
      venue: queue.venue,
      queueVersion: queue.version,
      cardId: card.id,
      revisionId: card.revisionId,
    };
    this.update({
      pending:
        direction === 1
          ? { kind: 'start', body: { attemptId: this.id(), ...selection } }
          : { kind: 'skip', body: { actionId: this.id(), ...selection } },
    });
    await this.retry();
  };
  finish = async (outcome: 'completed' | 'given_up') => {
    if (
      this.snapshot.busy ||
      this.snapshot.pending ||
      !this.snapshot.state?.active
    )
      return;
    this.update({
      pending: {
        kind: 'finish',
        body: {
          attemptId: this.snapshot.state.active.id,
          outcome,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    });
    await this.retry();
  };
  retry = async () => {
    const pending = this.snapshot.pending;
    if (!pending || this.snapshot.busy) return;
    const epoch = this.epoch;
    this.update({ busy: true, error: '' });
    try {
      if (pending.kind === 'skip') {
        const queue = await this.client.request(
          '/v1/challenges/skip',
          queueSchema,
          { body: pending.body },
        );
        this.assert(epoch);
        this.queue(queue);
      } else {
        const result = await this.client.request(
          `/v1/challenges/${pending.kind}`,
          attemptResultSchema,
          { body: pending.body },
        );
        this.assert(epoch);
        await this.batchCache(async () => {
          // Finishing rotates the queue on the server. Keep the active screen
          // until that confirmed queue is available, including on save retries.
          if (result.attempt.status !== 'active')
            await this.readQueue(result.attempt.card.venue, epoch);
          this.assert(epoch);
          this.client.queries.setQueryData<ChallengeState>(
            this.key('state'),
            (state) =>
              state
                ? {
                    ...state,
                    active:
                      result.attempt.status === 'active'
                        ? result.attempt
                        : null,
                    latestOutcome:
                      result.attempt.status === 'active'
                        ? state.latestOutcome
                        : result.attempt,
                  }
                : undefined,
          );
        });
        this.assert(epoch);
        this.update({
          clockOffset: Date.parse(result.serverNow) - Date.now(),
          success:
            result.attempt.status === 'completed' ? result.attempt : null,
          pending: null,
          busy: false,
        });
        if (result.attempt.status === 'completed' && this.userId)
          void this.client.queries.invalidateQueries({
            queryKey: accountKey(this.userId, 'progress'),
          });
        return;
      }
      this.update({ pending: null });
      await this.canonical(epoch);
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (
        error instanceof ApiError &&
        ['CONFLICT', 'NOT_FOUND', 'INVALID_REQUEST'].includes(error.code)
      ) {
        this.update({ pending: null });
        try {
          await this.canonical(epoch);
        } catch {
          /* Keep the last confirmed state and report the error. */
        }
      }
      if (epoch === this.epoch) this.update({ error: this.message(error) });
    } finally {
      if (epoch === this.epoch) this.update({ busy: false });
    }
  };
  dismissSuccess = () => this.update({ success: null });
  private message(error: unknown) {
    if (error instanceof ApiError && error.code === 'CONFLICT')
      return 'This challenge changed on another device. Your saved activity has been refreshed.';
    if (error instanceof ApiError && error.code === 'ACCESS_REQUIRED')
      return 'Your subscription is no longer active. Check access from Settings.';
    return this.snapshot.pending
      ? 'We couldn’t confirm the save. Retry the same action to safely check its result.'
      : 'We couldn’t refresh your challenges. Check your connection and retry.';
  }
}
