import { ApiError } from './http';

/** Owns a shared operation's lifetime, independently of any individual waiter. */
export class Deadline {
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly expiresAt: number;
  private code: 'TIMEOUT' | 'ACCOUNT_CHANGED' = 'TIMEOUT';
  readonly signal = this.controller.signal;

  constructor(timeoutMs = 10_000) {
    this.expiresAt = Date.now() + timeoutMs;
    this.timer = setTimeout(() => this.cancel(), timeoutMs);
  }
  check() {
    if (Date.now() >= this.expiresAt) this.cancel();
    if (this.signal.aborted) throw new ApiError(this.code);
  }
  cancel(code: 'TIMEOUT' | 'ACCOUNT_CHANGED' = 'TIMEOUT') {
    if (this.signal.aborted) return;
    this.code = code;
    this.controller.abort();
    this.dispose();
  }
  async wait<T>(work: () => Promise<T>): Promise<T> {
    this.check();
    let abort = () => {};
    const boundary = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new ApiError(this.code));
      this.signal.addEventListener('abort', abort, { once: true });
    });
    try {
      const result = await Promise.race([boundary, work()]);
      this.check();
      return result;
    } finally {
      this.signal.removeEventListener('abort', abort);
    }
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
