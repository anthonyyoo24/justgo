// Trial-only Edge entry. It wraps the production entry with stubs, a query
// counter, a rollback failpoint and three probe routes. It never merges.
import type { PoolClient } from 'pg';
import { createEdgeHandler as createProductionHandler } from '../../src/edge.js';
import { installFetchMap } from './fetch-map.js';

type Environment = Record<string, string | undefined>;
type Database = NonNullable<
  ReturnType<typeof createProductionHandler>['database']
>;
type QueryConfig = { text?: string; values?: unknown[] };

const bootedAt = new Date().toISOString();
let served = 0;
let queries = 0;
let failpoint: 'after-insert' | undefined;
let ownerContextSet = false;

const targetInsert = /^\s*insert into justgo\.(attempts|journal_versions)\b/i;

function hookClient(client: PoolClient) {
  const query = client.query.bind(client) as (...args: unknown[]) => unknown;
  (client as unknown as { query: unknown }).query = (...args: unknown[]) => {
    queries++;
    const first = args[0];
    const config: QueryConfig =
      typeof first === 'string' ? { text: first } : ((first as QueryConfig) ?? {});
    const text = config.text ?? '';
    // Drizzle passes { text } first and the parameters as the second argument.
    const values = config.values ?? (args[1] as unknown[] | undefined);
    if (failpoint && /set_config/.test(text) && values?.[0] === 'app.user_id')
      ownerContextSet = true;
    const result = query(...args);
    if (
      failpoint === 'after-insert' &&
      ownerContextSet &&
      targetInsert.test(text) &&
      typeof (result as Promise<unknown> | undefined)?.then === 'function'
    ) {
      failpoint = undefined;
      ownerContextSet = false;
      return (result as Promise<unknown>).then(() => {
        throw new Error('edge trial failpoint after insert');
      });
    }
    return result;
  };
}

async function selectOneProbe(database: Database) {
  const client = await database.pool.connect();
  const samplesMs: number[] = [];
  try {
    await client.query('begin');
    await client.query('select 1');
    for (let index = 0; index < 10; index++) {
      const start = performance.now();
      await client.query('select 1');
      samplesMs.push(performance.now() - start);
    }
    await client.query('commit');
  } finally {
    client.release();
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    samplesMs,
    medianMs: ((sorted[4] ?? 0) + (sorted[5] ?? 0)) / 2,
  };
}

function burn(milliseconds: number) {
  const start = performance.now();
  let value = 0;
  while (performance.now() - start < milliseconds) value = Math.sqrt(value + 1);
  return { burnedMs: performance.now() - start, value };
}

function runtimeFacts() {
  const scope = globalThis as Record<string, unknown>;
  const deno = scope.Deno as { version?: unknown } | undefined;
  return {
    bootedAt,
    served,
    bufferGlobal: typeof scope.Buffer,
    processGlobal: typeof scope.process,
    globalGlobal: typeof scope.global,
    deno: deno?.version ?? null,
    edgeRuntime: typeof scope.EdgeRuntime,
  };
}

export function createEdgeHandler(env: Environment) {
  if (env.JUSTGO_EDGE_TRIAL !== 'on') return createProductionHandler(env);
  installFetchMap(env.JUSTGO_EDGE_TRIAL_FETCH_MAP);
  const handler = createProductionHandler(env, {
    onDatabase: (database) => database.pool.on('connect', hookClient),
  });
  return {
    database: handler.database,
    fetch: async (request: Request) => {
      served++;
      queries = 0;
      const url = new URL(request.url);
      if (url.pathname === '/api/__trial/runtime')
        return Response.json(runtimeFacts());
      if (url.pathname === '/api/__trial/burn')
        return Response.json(burn(Number(url.searchParams.get('ms') ?? '0')));
      if (url.pathname === '/api/__trial/select1') {
        if (!handler.database)
          return Response.json({ error: 'no database' }, { status: 503 });
        return Response.json(await selectOneProbe(handler.database));
      }
      if (request.headers.get('x-justgo-trial-failpoint') === 'after-insert') {
        failpoint = 'after-insert';
        ownerContextSet = false;
      }
      try {
        const response = await handler.fetch(request);
        const copy = new Response(response.body, response);
        copy.headers.set('x-justgo-trial-queries', String(queries));
        return copy;
      } finally {
        failpoint = undefined;
        ownerContextSet = false;
      }
    },
  };
}
