import { createServer } from 'node:net';

/** Only an explicit command-line mode may replace the functional smoke with profiling. */
export function workerSmokeOptions(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
) {
  const mode = args[0] ?? '--smoke';
  if (args.length > 1 || !['--smoke', '--profile'].includes(mode))
    throw new Error('Invalid Worker check mode');
  const profiling = mode === '--profile';
  const port = Number(environment.JUSTGO_WORKERS_TEST_PORT ?? '8791');
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid Worker smoke port');
  const inspectorPort = profiling
    ? Number(environment.JUSTGO_WORKERS_INSPECTOR_PORT ?? '9230')
    : 0;
  if (
    profiling &&
    (!Number.isInteger(inspectorPort) ||
      inspectorPort < 1024 ||
      inspectorPort > 65535 ||
      inspectorPort === port)
  )
    throw new Error('Invalid Worker CPU inspector port');
  return { profiling, port, inspectorPort };
}

/** Refuse an occupied loopback port without adopting another process's listener. */
export async function assertWorkerPortAvailable(
  port: number,
  label: 'Worker smoke' | 'Worker CPU inspector',
) {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', () => reject(new Error(`${label} port is occupied`)));
    probe.listen(port, '127.0.0.1', () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  });
}
