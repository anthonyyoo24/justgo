import { createServer } from 'node:net';

type PreflightMessage =
  | 'Invalid Worker check mode'
  | 'Invalid Worker smoke port'
  | 'Invalid Worker CPU inspector port'
  | 'Worker smoke port is occupied'
  | 'Worker CPU inspector port is occupied';

const preflightMessages = new WeakMap<object, PreflightMessage>();

function preflightFailure(message: PreflightMessage) {
  const error = new Error(message);
  preflightMessages.set(error, message);
  return error;
}

/** Only fixed preflight messages created here may reach operator diagnostics. */
export function workerSmokePreflightMessage(error: unknown) {
  return typeof error === 'object' && error !== null
    ? preflightMessages.get(error)
    : undefined;
}

/** Only an explicit command-line mode may replace the functional smoke with profiling. */
export function workerSmokeOptions(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
) {
  const mode = args[0] ?? '--smoke';
  if (args.length > 1 || !['--smoke', '--profile'].includes(mode))
    throw preflightFailure('Invalid Worker check mode');
  const profiling = mode === '--profile';
  const port = Number(environment.JUSTGO_WORKERS_TEST_PORT ?? '8791');
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw preflightFailure('Invalid Worker smoke port');
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
    throw preflightFailure('Invalid Worker CPU inspector port');
  return { profiling, port, inspectorPort };
}

/** Refuse unavailable loopback ports without adopting another process's listener. */
export async function assertWorkerPortAvailable(
  port: number,
  label: 'Worker smoke' | 'Worker CPU inspector',
) {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'EADDRINUSE'
          ? preflightFailure(
              label === 'Worker CPU inspector'
                ? 'Worker CPU inspector port is occupied'
                : 'Worker smoke port is occupied',
            )
          : error,
      ),
    );
    probe.listen(port, '127.0.0.1', () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  });
}
