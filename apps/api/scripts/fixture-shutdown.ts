type FixtureProcess = {
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  exitCode: string | number | null | undefined;
};

/** Own the fixture process lifetime without interrupting its pool's close hook. */
export function installFixtureShutdown(
  close: () => Promise<void>,
  runtime: FixtureProcess = process,
  reportFailure: () => void = () => {
    console.error('Disposable fixture shutdown failed');
  },
) {
  let closing: Promise<void> | undefined;
  const shutdown = () => {
    closing ??= Promise.resolve()
      .then(() => close())
      .catch(() => {
        runtime.exitCode = 1;
        reportFailure();
      });
    return closing;
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    runtime.on(signal, () => {
      // shutdown owns the close failure and reports only a redacted diagnostic.
      void shutdown();
    });
  }
  return shutdown;
}
