import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { installFixtureShutdown } from '../scripts/fixture-shutdown.js';

const fixtureProcess = () => {
  const signals = new EventEmitter();
  return {
    signals,
    runtime: {
      on: signals.on.bind(signals),
      exitCode: undefined as number | string | undefined,
    },
  };
};

describe('disposable fixture shutdown', () => {
  it.each(['SIGTERM', 'SIGINT'])('closes cleanly on %s', async (signal) => {
    const { signals, runtime } = fixtureProcess();
    const close = vi.fn(async () => {});
    const reportFailure = vi.fn();
    const shutdown = installFixtureShutdown(close, runtime, reportFailure);
    signals.emit(signal);
    await shutdown();
    expect(close).toHaveBeenCalledExactlyOnceWith();
    expect(runtime.exitCode ?? 0).toBe(0);
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it('waits for cleanup and coalesces repeated mixed signals', async () => {
    const { signals, runtime } = fixtureProcess();
    let finish!: () => void;
    const closed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const close = vi.fn(() => closed);
    const shutdown = installFixtureShutdown(close, runtime, vi.fn());
    const completed = vi.fn();
    signals.emit('SIGTERM');
    const completion = shutdown().then(() => completed());
    signals.emit('SIGINT');
    signals.emit('SIGTERM');
    await Promise.resolve();
    expect(close).toHaveBeenCalledExactlyOnceWith();
    expect(completed).not.toHaveBeenCalled();
    finish();
    await completion;
    expect(completed).toHaveBeenCalledExactlyOnceWith();
    expect(runtime.exitCode ?? 0).toBe(0);
  });

  it('handles close rejection without logging error contents or retrying cleanup', async () => {
    const { signals, runtime } = fixtureProcess();
    const close = vi.fn(async () => {
      throw new Error('private connection data');
    });
    const reportFailure = vi.fn();
    const shutdown = installFixtureShutdown(close, runtime, reportFailure);
    signals.emit('SIGTERM');
    await expect(shutdown()).resolves.toBeUndefined();
    signals.emit('SIGINT');
    await shutdown();
    expect(runtime.exitCode).toBe(1);
    expect(close).toHaveBeenCalledExactlyOnceWith();
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith();
  });
});
