import { createEdgeHandler } from '../../src/edge.js';

type Environment = Record<string, string | undefined>;
type Database = NonNullable<ReturnType<typeof createEdgeHandler>['database']>;

/** The hosted gateway serves the function under its own name, and the shared entry strips `/api`. */
const hostedPrefixes = ['/functions/v1/justgo-trial', '/justgo-trial'];
const productionPrefix = '/api';

export const trialKeyHeader = 'x-justgo-trial-key';
export const maxBurnMs = 2500;
export const maxBodyBytes = 8 * 1024 * 1024;

/** The only request headers a trial route may echo. */
export const clientAddressHeaders = [
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
  'true-client-ip',
  'x-client-ip',
  'x-envoy-external-address',
  'x-original-forwarded-for',
  'fly-client-ip',
  'forwarded',
] as const;

const worker = { id: crypto.randomUUID(), bootedAt: new Date().toISOString() };
let served = 0;

const workerFacts = () => ({ ...worker, served });

function apiPath(pathname: string) {
  for (const prefix of hostedPrefixes)
    if (pathname === prefix || pathname.startsWith(`${prefix}/`))
      return pathname.slice(prefix.length) || '/';
  return undefined;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Server-sent text only, with anything from the connection string removed. */
function safeDatabaseError(error: unknown, env: Environment) {
  const fields = error as { code?: unknown; severity?: unknown };
  let message = error instanceof Error ? error.message.slice(0, 200) : '';
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    for (const part of [
      url.password,
      decodeURIComponent(url.password),
      url.username,
      decodeURIComponent(url.username),
      url.hostname,
    ])
      if (part) message = message.replaceAll(part, '[masked]');
  } catch {
    message = '';
  }
  return {
    code: typeof fields.code === 'string' ? fields.code : null,
    severity: typeof fields.severity === 'string' ? fields.severity : null,
    message,
  };
}

async function databaseProbe(database: Database) {
  const client = await database.pool.connect();
  let failed = false;
  try {
    await client.query('begin');
    const shown = await client.query<{ statement_timeout: string }>(
      'show statement_timeout',
    );
    await client.query('select 1');
    const samplesMs: number[] = [];
    for (let index = 0; index < 10; index++) {
      const start = performance.now();
      await client.query('select 1');
      samplesMs.push(performance.now() - start);
    }
    await client.query('commit');
    const sorted = [...samplesMs].sort((a, b) => a - b);
    return {
      statementTimeout: shown.rows[0]?.statement_timeout ?? null,
      selectOne: {
        samplesMs,
        medianMs: ((sorted[4] ?? 0) + (sorted[5] ?? 0)) / 2,
      },
    };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    client.release(failed);
  }
}

async function probe(
  request: Request,
  database: Database | undefined,
  env: Environment,
) {
  const received: Record<string, string | null> = {};
  for (const name of clientAddressHeaders)
    received[name] = request.headers.get(name);
  const body = { clientAddressHeaders: received, worker: workerFacts() };
  if (!database)
    return Response.json({ ...body, database: { error: 'no database' } });
  try {
    return Response.json({
      ...body,
      database: await databaseProbe(database),
    });
  } catch (error) {
    return Response.json({
      ...body,
      database: { error: safeDatabaseError(error, env) },
    });
  }
}

async function countBody(request: Request) {
  let bytes = 0;
  const reader = request.body?.getReader();
  if (reader)
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBodyBytes) {
        await reader.cancel().catch(() => {});
        return Response.json(
          { error: 'body too large', worker: workerFacts() },
          { status: 413 },
        );
      }
    }
  return Response.json({ bytes, worker: workerFacts() });
}

function burn(url: URL) {
  const requestedMs = Number(url.searchParams.get('ms'));
  if (
    !Number.isInteger(requestedMs) ||
    requestedMs < 1 ||
    requestedMs > maxBurnMs
  )
    return Response.json(
      { error: `ms must be an integer from 1 to ${maxBurnMs}` },
      { status: 400 },
    );
  const start = performance.now();
  let value = 0;
  while (performance.now() - start < requestedMs) value = Math.sqrt(value + 1);
  return Response.json({
    requestedMs,
    burnedMs: performance.now() - start,
    worker: workerFacts(),
  });
}

/**
 * P15-2 hosted trial entry. It never merges. The trial routes answer only a
 * caller whose key hashes to JUSTGO_TRIAL_KEY_SHA256, and every other request
 * reaches the production Edge handler unchanged apart from the path prefix.
 */
export function createHostedTrialHandler(
  env: Environment,
  handler: Pick<
    ReturnType<typeof createEdgeHandler>,
    'database' | 'fetch'
  > = createEdgeHandler(env),
) {
  const keyDigest = /^[a-f0-9]{64}$/.test(env.JUSTGO_TRIAL_KEY_SHA256 ?? '')
    ? env.JUSTGO_TRIAL_KEY_SHA256
    : undefined;
  return {
    database: handler.database,
    fetch: async (request: Request) => {
      served++;
      const url = new URL(request.url);
      const path = apiPath(url.pathname);
      if (path === undefined) return handler.fetch(request);
      const key = request.headers.get(trialKeyHeader);
      if (
        path.startsWith('/__trial/') &&
        keyDigest &&
        key &&
        (await sha256Hex(key)) === keyDigest
      ) {
        if (path === '/__trial/probe' && request.method === 'GET')
          return probe(request, handler.database, env);
        if (path === '/__trial/body' && request.method === 'POST')
          return countBody(request);
        if (path === '/__trial/burn' && request.method === 'GET')
          return burn(url);
      }
      url.pathname = `${productionPrefix}${path === '/' ? '' : path}`;
      return handler.fetch(new Request(url, request));
    },
  };
}
