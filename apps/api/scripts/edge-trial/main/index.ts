type Variant = {
  name: string;
  functionDir: string;
  importMap?: string;
  env: Record<string, string>;
  cpuSoftMs: number;
  cpuHardMs: number;
  memoryMb: number;
  wallMs: number;
};
type UserWorker = {
  fetch(request: Request): Promise<Response>;
};
type WorkerErrors = Record<
  string,
  (new (...args: never[]) => Error) | undefined
>;

declare const EdgeRuntime: {
  userWorkers: {
    create(options: Record<string, unknown>): Promise<UserWorker>;
  };
  getRuntimeMetrics(): Promise<unknown>;
};
declare const Deno: {
  env: { get(name: string): string | undefined };
  errors: WorkerErrors;
  makeTempDirSync(options: { prefix: string }): string;
  serve(handler: (request: Request) => Promise<Response>): void;
};

const variants = JSON.parse(
  Deno.env.get('EDGE_TRIAL_VARIANTS') ?? '[]',
) as Variant[];
const byName = new Map(variants.map((variant) => [variant.name, variant]));
// The worker pool keys workers by service path, so each variant gets its own.
const servicePaths = new Map(
  variants.map((variant) => [
    variant.name,
    Deno.makeTempDirSync({ prefix: `edge-trial-${variant.name}-` }),
  ]),
);

function errorName(error: unknown) {
  for (const name of [
    'InvalidWorkerCreation',
    'InvalidWorkerResponse',
    'WorkerRequestCancelled',
    'WorkerAlreadyRetired',
    'WorkerRequestIdleTimeout',
  ]) {
    const type = Deno.errors[name];
    if (type && error instanceof type) return name;
  }
  return error instanceof Error ? error.name : 'unknown';
}

const statusFor: Record<string, number> = {
  InvalidWorkerCreation: 503,
  InvalidWorkerResponse: 500,
  WorkerRequestCancelled: 546,
  WorkerRequestIdleTimeout: 504,
};

async function forward(variant: Variant, request: Request) {
  const worker = await EdgeRuntime.userWorkers.create({
    servicePath: servicePaths.get(variant.name),
    memoryLimitMb: variant.memoryMb,
    workerTimeoutMs: variant.wallMs,
    noModuleCache: false,
    noNpm: false,
    ...(variant.importMap ? { importMapPath: variant.importMap } : {}),
    envVars: Object.entries(variant.env),
    forceCreate: false,
    customModuleRoot: '',
    cpuTimeSoftLimitMs: variant.cpuSoftMs,
    cpuTimeHardLimitMs: variant.cpuHardMs,
    decoratorType: 'tc39',
    maybeEntrypoint: new URL(`file://${variant.functionDir}/index.ts`).href,
    context: { useReadSyncFileAPI: true },
    staticPatterns: [],
  });
  // Forward the original request: the runtime tracks its body stream and tag.
  return worker.fetch(request);
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname === '/_internal/health') return Response.json({ ok: true });
  if (url.pathname === '/_internal/metric')
    return Response.json(await EdgeRuntime.getRuntimeMetrics());
  const variant = byName.get(
    request.headers.get('x-edge-trial-variant') ?? variants[0]?.name ?? '',
  );
  if (
    !variant ||
    (url.pathname !== '/api' && !url.pathname.startsWith('/api/'))
  )
    return new Response('Function not found', { status: 404 });
  for (let attempt = 0; ; attempt++) {
    try {
      return await forward(variant, request);
    } catch (error) {
      const name = errorName(error);
      // A retired worker refuses the request before running it.
      if (
        name === 'WorkerAlreadyRetired' &&
        request.body === null &&
        attempt < 2
      )
        continue;
      console.error(
        JSON.stringify({
          event: 'edge_trial_worker_error',
          variant: variant.name,
          name,
          message: error instanceof Error ? error.message.slice(0, 500) : '',
        }),
      );
      return Response.json(
        { code: name, message: 'edge trial worker error' },
        { status: statusFor[name] ?? 500 },
      );
    }
  }
});
