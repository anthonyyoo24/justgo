import { checkWorkerOutboundAdapters } from './workers-outbound-smoke.js';

// The local Edge smoke bundles this wrapper beside the production bundle. It
// sends the synthetic Auth and Sentry origins to loopback stubs, refuses every
// other outbound request and adds one route that runs the outbound adapters.
type Environment = Record<string, string | undefined>;

// The smoke copies the production bundle to dist/production.mjs beside this
// wrapper's bundle, and the build keeps this import external. production.d.mts
// types it as src/edge.ts.
const { createEdgeHandler: production } = await import('./production.mjs');

let refused = 0;

function installFetchMap(serialized: string | undefined) {
  const map = JSON.parse(serialized ?? '{}') as Record<string, string>;
  const stubs = new Set(
    Object.values(map).map((target) => new URL(target).origin),
  );
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (stubs.has(url.origin)) return original(request);
    const target = map[url.origin];
    if (!target) {
      refused++;
      throw new Error('Edge smoke forbids outbound HTTP');
    }
    // Copy each field: a Request passed as init loses its method in some runtimes.
    return original(new URL(url.pathname + url.search, target), {
      method: request.method,
      headers: request.headers,
      redirect: request.redirect,
      signal: request.signal,
      ...(request.body ? { body: await request.arrayBuffer() } : {}),
    });
  };
}

export function createEdgeHandler(
  env: Environment,
  options: Parameters<typeof production>[1] = {},
) {
  installFetchMap(env.JUSTGO_EDGE_SMOKE_FETCH_MAP);
  const handler = production(env, options);
  return {
    database: handler.database,
    fetch: async (request: Request) => {
      if (new URL(request.url).pathname === '/api/__smoke/outbound') {
        await checkWorkerOutboundAdapters();
        return Response.json({ outbound: 'passed', refused });
      }
      const response = await handler.fetch(request);
      const copy = new Response(response.body, response);
      copy.headers.set('x-justgo-smoke-refused', String(refused));
      return copy;
    },
  };
}
