// The main service of the local Edge smoke. It runs inside the pinned
// supabase/edge-runtime image and forwards each request to a user worker
// built from the smoke function, with the hosted CPU, memory and wall limits.
type Variant = { name: string; env: Record<string, string> };
type UserWorker = { fetch(request: Request): Promise<Response> };

declare const EdgeRuntime: {
  userWorkers: {
    create(options: Record<string, unknown>): Promise<UserWorker>;
  };
};
declare const Deno: {
  env: { get(name: string): string | undefined };
  makeTempDirSync(options: { prefix: string }): string;
  serve(handler: (request: Request) => Promise<Response>): void;
};

const functionDirectory = Deno.env.get('EDGE_SMOKE_FUNCTION') ?? '';
const variants = JSON.parse(
  Deno.env.get('EDGE_SMOKE_VARIANTS') ?? '[]',
) as Variant[];
const byName = new Map(variants.map((variant) => [variant.name, variant]));
// The worker pool keys workers by service path, so each variant gets its own.
const servicePaths = new Map(
  variants.map((variant) => [
    variant.name,
    Deno.makeTempDirSync({ prefix: `edge-smoke-${variant.name}-` }),
  ]),
);

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname === '/_internal/health') return Response.json({ ok: true });
  const variant = byName.get(
    request.headers.get('x-edge-smoke-variant') ?? variants[0]?.name ?? '',
  );
  const name = url.pathname.split('/')[1];
  if (!variant || (name !== 'api' && name !== 'api-candidate'))
    return new Response('Function not found', { status: 404 });
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: servicePaths.get(variant.name),
      memoryLimitMb: 256,
      workerTimeoutMs: 150_000,
      cpuTimeSoftLimitMs: 1000,
      cpuTimeHardLimitMs: 2000,
      noModuleCache: false,
      noNpm: false,
      envVars: Object.entries(variant.env),
      forceCreate: false,
      customModuleRoot: '',
      decoratorType: 'tc39',
      maybeEntrypoint: new URL(`file://${functionDirectory}/index.ts`).href,
      context: { useReadSyncFileAPI: true },
      staticPatterns: [],
    });
    return await worker.fetch(request);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'edge_smoke_worker_error',
        variant: variant.name,
        name: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return Response.json({ code: 'EDGE_WORKER_ERROR' }, { status: 502 });
  }
});
