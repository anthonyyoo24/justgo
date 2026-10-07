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
  private next(attemptId?: string): Operation | undefined {
    const state = this.owner.read();
    return state.journal.operations.find(
      (operation, index, operations) =>
        (!attemptId || operation.attemptId === attemptId) &&
        operation.state === 'pending' &&
        operation.dueAt <= this.clock.now() &&
        !state.journal.records[operation.attemptId]?.rejected &&
        !operations
          .slice(0, index)
          .some(
            (prior) =>
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
      const id = operation.id;
      if (operation.kind === 'patch' && !operation.bound) {
        this.owner.update((journal) => {
          const current = journal.operations.find((item) => item.id === id);
          if (current?.kind === 'patch') {
            current.input.expectedReflectionRevision = current.dependsOn
              ? (journal.submissions[current.dependsOn]!.appliedRevision ?? 0)
              : journal.records[current.attemptId]!.serverRevision;
            current.bound = true;
          }
        });
        operation = this.owner
          .read()
          .journal.operations.find((item) => item.id === id)!;
      }
      // Await the consistent local write before any normal send. A failed write
      // permits the confirmed server-save fallback through this same coordinator.
      if (this.owner.needsPersistence()) await this.owner.persist();
      if (
        epoch !== this.epoch ||
        !this.owner.read().active ||
        !this.owner.read().online
      )
        return;
      const submittedThrough =
        this.owner.read().journal.records[operation.attemptId]!.version;
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
          operation.kind === 'create'
            ? this.transport
                .create(operation.input, controller.signal)
                .then((attempt) => ({ attempt, acknowledgement: null }))
            : this.transport.patch(
                operation.attemptId,
                operation.input,
                controller.signal,
              ),
        ]);
        if (epoch !== this.epoch) return;
        if (
          response.attempt.id !== operation.attemptId ||
          (operation.kind === 'patch' &&
            response.acknowledgement?.submissionId !== operation.id)
        )
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
          recordFailure(
            journal,
            sent,
            failure,
            submittedThrough,
            this.clock.now(),
            this.random,
          ),
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
          operation.state === 'pending' &&
          !state.journal.records[operation.attemptId]?.rejected &&
          !state.journal.operations
            .slice(0, index)
            .some(
              (prior) =>
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
