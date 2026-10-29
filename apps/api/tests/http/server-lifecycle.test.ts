import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  end: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../src/config.js', () => ({
  readConfig: () => ({ DATABASE_URL: 'fixture', PORT: 0, LOG_LEVEL: 'error' }),
}));
vi.mock('../../src/db/client.js', () => ({
  createDatabase: () => ({ pool: { end: mocks.end } }),
}));
vi.mock('../../src/runtime-app.js', () => ({ buildRuntimeApp: () => ({}) }));
vi.mock('../../src/http/diagnostics.js', () => ({
  createLogger: () => ({ error: mocks.error }),
  loggerOptions: () => ({}),
}));
vi.mock('../../src/http/node-server.js', () => ({ listen: mocks.listen }));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const signals = new Map<string | symbol, () => void>();
let previousExitCode: typeof process.exitCode;
beforeEach(() => {
  previousExitCode = process.exitCode;
  vi.resetModules();
  vi.resetAllMocks();
  signals.clear();
  mocks.end.mockResolvedValue(undefined);
  vi.spyOn(process, 'once').mockImplementation((signal, listener) => {
    signals.set(signal, listener);
    return process;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = previousExitCode;
});

it.each(['SIGINT', 'SIGTERM'])(
  'waits for startup before %s cleanup and closes resources once',
  async (signal) => {
    const starting = deferred<{ close: () => Promise<void> }>();
    const closing = deferred<void>();
    const close = vi.fn(() => closing.promise);
    mocks.listen.mockReturnValue(starting.promise);
    await import('../../src/server.js');
    signals.get(signal)!();
    signals.get(signal === 'SIGINT' ? 'SIGTERM' : 'SIGINT')!();
    expect(mocks.end).not.toHaveBeenCalled();
    starting.resolve({ close });
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.end).not.toHaveBeenCalled();
    closing.resolve();
    await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(1));
    expect(mocks.listen).toHaveBeenCalledTimes(1);
  },
);

it('closes a running listener and still ends the pool if listener shutdown fails', async () => {
  const close = vi.fn().mockRejectedValue(new Error('private socket error'));
  mocks.listen.mockResolvedValue({ close });
  await import('../../src/server.js');
  signals.get('SIGTERM')!();
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(close).toHaveBeenCalledTimes(1);
  expect(mocks.end).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  'ends the pool after startup fails, including cleanup failure=%s',
  async (cleanupFails) => {
    const starting = deferred<never>();
    mocks.listen.mockReturnValue(starting.promise);
    if (cleanupFails)
      mocks.end.mockRejectedValue(new Error('private database error'));
    await import('../../src/server.js');
    signals.get('SIGINT')!();
    starting.reject(new Error('private bind error'));
    await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(1));
    expect(process.exitCode).toBe(1);
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(
      {},
      'API startup failed',
    );
  },
);
