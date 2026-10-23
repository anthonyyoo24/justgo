import { ApiError } from '../../../lib/network/http';
import type { Journal, JournalClock, JournalState, Operation } from '../model';
import type { JournalTransport } from './transport';
import { sparseRetryDelay } from './retry';
import { acknowledge, recordFailure } from './delivery';

type Owner = {
  read(): JournalState;
  update(work: (journal: Journal) => void): void;
  persist(): Promise<boolean>;
  needsPersistence(): boolean;
  settled(): void;
  failed(): void;
};
// One account coordinator owns both upload and device-write recovery. It never
// executes when disposed/inactive; offline still permits device-write recovery.
export class JournalSender {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private epoch = 0;
  private storageDue = 0;
  private storageFailures = 0;
  constructor(
    private readonly owner: Owner,
    private readonly transport: JournalTransport,
    private readonly clock: JournalClock,
    private readonly random: () => number,
  ) {}
  stop() {
    this.epoch++;
    this.controller?.abort();
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }
  kick() {
    // Errors are classified inside drain. The coordinator owns background work.
    void this.flush()
      .catch(() => this.owner.failed())
      .finally(() => this.schedule());
  }
  async flush(attemptId?: string): Promise<void> {
    if (this.running) {
      await this.running;
      if (attemptId) await this.flush(attemptId);
      return;
    }
    const state = this.owner.read();
    if (!state.ready || !state.active || !state.online) {
      this.schedule();
      return;
    }
    const epoch = this.epoch;
    const work = this.drain(epoch, attemptId);
    this.running = work;
    try {
      await work;
    } finally {
      if (this.running === work) this.running = null;
      this.schedule();
    }
  }
  private next(
    attemptId?: string,
  ): Extract<Operation, { kind: 'create' }> | undefined {
    const state = this.owner.read();
    return state.journal.operations.find(
      (
        operation,
        index,
        operations,
      ): operation is Extract<Operation, { kind: 'create' }> =>
        operation.kind === 'create' &&
        (!attemptId || operation.attemptId === attemptId) &&
        operation.state === 'pending' &&
        operation.dueAt <= this.clock.now() &&
        !state.journal.records[operation.attemptId]?.rejected &&
        !operations
          .slice(0, index)
          .some(
            (prior) =>
              prior.kind === 'create' &&
              prior.attemptId === operation.attemptId &&
              prior.state !== 'acknowledged',
          ),
    );
  }
  private async drain(epoch: number, attemptId?: string) {
    let operation = this.next(attemptId);
    while (
      operation &&
      epoch === this.epoch &&
      this.owner.read().active &&
      this.owner.read().online
    ) {
      // Persist completion intent before sending. Completion metadata may still
      // use the existing server acknowledgement fallback on device cache failure.
      if (this.owner.needsPersistence()) await this.owner.persist();
      if (
        epoch !== this.epoch ||
        !this.owner.read().active ||
        !this.owner.read().online
      )
        return;
      this.controller = new AbortController();
      const controller = this.controller;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let cancel = () => {};
      try {
        const boundary = new Promise<never>((_resolve, reject) => {
          cancel = () => reject(new ApiError('CANCELLED'));
          controller.signal.addEventListener('abort', cancel, { once: true });
          timer = this.clock.setTimeout(() => {
            reject(new ApiError('TIMEOUT'));
            controller.abort();
          }, 10_000);
        });
        const response = await Promise.race([
          boundary,
          this.transport
            .create(operation.input, controller.signal)
            .then((attempt) => ({ attempt })),
        ]);
        if (epoch !== this.epoch) return;
        if (response.attempt.id !== operation.attemptId)
          throw new ApiError('CONFLICT');
        const sent = operation;
        this.owner.update((journal) => acknowledge(journal, sent, response));
        await this.owner.persist();
        this.owner.settled();
      } catch (error) {
        if (epoch !== this.epoch) return;
        const failure =
          error instanceof ApiError ? error : new ApiError('UNAVAILABLE');
        const sent = operation;
        this.owner.update((journal) =>
          recordFailure(journal, sent, failure, this.clock.now(), this.random),
        );
        await this.owner.persist();
        this.owner.settled();
      } finally {
        if (timer !== undefined) this.clock.clearTimeout(timer);
        controller.signal.removeEventListener('abort', cancel);
        if (this.controller === controller) this.controller = null;
      }
      operation = this.next(attemptId);
    }
  }
  private sparseDelay(exponent: number) {
    return sparseRetryDelay(exponent, this.random);
  }
  private schedule() {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
    const state = this.owner.read();
    if (!state.ready || !state.active || this.running || state.coordinatorError)
      return;
    const times: number[] = [];
    if (this.owner.needsPersistence()) {
      if (!this.storageDue)
        this.storageDue =
          this.clock.now() + this.sparseDelay(this.storageFailures);
      times.push(this.storageDue);
    } else {
      this.storageDue = 0;
      this.storageFailures = 0;
    }
    if (state.online) {
      for (const [index, operation] of state.journal.operations.entries())
        if (
          operation.kind === 'create' &&
          operation.state === 'pending' &&
          !state.journal.records[operation.attemptId]?.rejected &&
          !state.journal.operations
            .slice(0, index)
            .some(
              (prior) =>
                prior.kind === 'create' &&
                prior.attemptId === operation.attemptId &&
                prior.state !== 'acknowledged',
            )
        )
          times.push(operation.dueAt);
    }
    if (!times.length) return;
    this.timer = this.clock.setTimeout(
      () => {
        this.timer = undefined;
        // Callback ownership includes both persistence errors and sender failures.
        void (async () => {
          if (this.storageDue && this.storageDue <= this.clock.now()) {
            const saved = await this.owner.persist();
            this.storageFailures = saved ? 0 : this.storageFailures + 1;
            this.storageDue = saved
              ? 0
              : this.clock.now() + this.sparseDelay(this.storageFailures);
          }
          await this.flush();
        })()
          .catch(() => this.owner.failed())
          .finally(() => this.schedule());
      },
      Math.min(
        2_147_483_647,
        Math.max(0, Math.min(...times) - this.clock.now()),
      ),
    );
  }
}
