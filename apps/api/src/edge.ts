import { readConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createHttpApp } from './http/app.js';
import { buildRuntimeApp } from './runtime-app.js';

type Environment = Record<string, string | undefined>;
type Database = ReturnType<typeof createDatabase>;
type StartupStage = 'configuration' | 'database' | 'composition';

const functionPrefix = '/api';

/** Custom Edge Function secrets cannot start with SUPABASE_, so the entry maps them once. */
export function edgeConfigEnvironment(env: Environment): Environment {
  const { JUSTGO_AUTH_PUBLISHABLE_KEY, JUSTGO_AUTH_SECRET_KEY, ...rest } = env;
  return {
    ...rest,
    SUPABASE_PUBLISHABLE_KEY: JUSTGO_AUTH_PUBLISHABLE_KEY,
    SUPABASE_AUTH_SECRET_KEY: JUSTGO_AUTH_SECRET_KEY,
  };
}

const unprovenClientAddress = 'unknown';

export function stripFunctionPrefix(request: Request) {
  const url = new URL(request.url);
  if (
    url.pathname !== functionPrefix &&
    !url.pathname.startsWith(`${functionPrefix}/`)
  )
    return request;
  url.pathname = url.pathname.slice(functionPrefix.length) || '/';
  return new Request(url, request);
}

function startupFailure(stage: StartupStage) {
  const failed = createHttpApp();
  failed.all('*', (context) => {
    context.header('x-justgo-startup-stage', stage);
    if (context.req.path === '/ready')
      return context.json({ status: 'unavailable' }, 503);
    const requestId = context.get('diagnostic').id;
    return context.req.path.startsWith('/v1/')
      ? context.json({ code: 'UNAVAILABLE', requestId }, 503)
      : context.json({ error: 'Internal server error', requestId }, 500);
  });
  return failed;
}

export function createEdgeHandler(
  env: Environment,
  options: { onDatabase?: (database: Database) => void } = {},
) {
  let stage: StartupStage = 'configuration';
  try {
    const config = readConfig(edgeConfigEnvironment(env));
    stage = 'database';
    const database = createDatabase(config);
    options.onDatabase?.(database);
    stage = 'composition';
    const app = buildRuntimeApp(config, database, {
      clientAddress: () => unprovenClientAddress,
    });
    return {
      database,
      fetch: (request: Request) => app.fetch(stripFunctionPrefix(request)),
    };
  } catch {
    const failed = startupFailure(stage);
    return {
      database: undefined,
      fetch: (request: Request) => failed.fetch(stripFunctionPrefix(request)),
    };
  }
}
