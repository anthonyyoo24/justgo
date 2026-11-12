import { isIP } from 'node:net';
import { readConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createHttpApp } from './http/app.js';
import {
  createServerErrorReporter,
  type ServerErrorReporter,
} from './http/server-error-reporter.js';
import { buildRuntimeApp } from './runtime-app.js';

type Environment = Record<string, string | undefined>;
type Database = ReturnType<typeof createDatabase>;
type StartupStage = 'configuration' | 'reporter' | 'database' | 'composition';

/** The fields the release build writes into the bundle, so each deploy names its own source. */
export type EdgeRelease = {
  JUSTGO_SOURCE_SHA?: string;
  API_SENTRY_RELEASE?: string;
};

/** The release lane deploys one bundle as a candidate first, then as the serving function. */
export const edgeFunctionNames = ['api', 'api-candidate'] as const;

/**
 * Custom Edge Function secrets cannot start with SUPABASE_, so the entry maps
 * the Auth keys once. The injected SUPABASE_DB_URL is never read: the API uses
 * its own least-privilege DATABASE_URL. Release fields from the bundle win over
 * project-wide secrets, which every deployed function shares.
 */
const replacedNames = new Set([
  'JUSTGO_AUTH_PUBLISHABLE_KEY',
  'JUSTGO_AUTH_SECRET_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_AUTH_SECRET_KEY',
  'SUPABASE_DB_URL',
]);

export function edgeConfigEnvironment(
  env: Environment,
  release: EdgeRelease = {},
): Environment {
  const rest = Object.fromEntries(
    Object.entries(env).filter(([name]) => !replacedNames.has(name)),
  );
  return {
    ...rest,
    SUPABASE_PUBLISHABLE_KEY: env.JUSTGO_AUTH_PUBLISHABLE_KEY,
    SUPABASE_AUTH_SECRET_KEY: env.JUSTGO_AUTH_SECRET_KEY,
    ...Object.fromEntries(
      Object.entries(release).filter(([, value]) => value !== undefined),
    ),
  };
}

/**
 * The hosted Supabase gateway sits behind Cloudflare, which overwrites
 * CF-Connecting-IP with the caller's address (P15-2 lane 4, 2026-11-12). It
 * does not set X-Real-IP, and X-Forwarded-For carries caller-written entries,
 * so neither names a rate-limit bucket. Anything but one address is unknown.
 */
export function edgeClientAddress(request: Request) {
  const address = request.headers.get('cf-connecting-ip') ?? '';
  return isIP(address) ? address : 'unknown';
}

/** Requests reach the function under its own name; the app routes from the root. */
export function stripFunctionPrefix(request: Request) {
  const url = new URL(request.url);
  const name = edgeFunctionNames.find(
    (candidate) =>
      url.pathname === `/${candidate}` ||
      url.pathname.startsWith(`/${candidate}/`),
  );
  if (!name) return request;
  url.pathname = url.pathname.slice(name.length + 1) || '/';
  return new Request(url, request);
}

/**
 * Hand delivery to the runtime so a diagnostic never holds the response. The
 * reporter already bounds its own time and never rejects.
 */
export function deferredReporter(
  reporter: ServerErrorReporter,
  waitUntil?: (work: Promise<unknown>) => void,
): ServerErrorReporter {
  if (!waitUntil) return reporter;
  return (diagnostic) => {
    waitUntil(reporter(diagnostic));
    return Promise.resolve();
  };
}

function startupFailure(stage: StartupStage, reporter?: ServerErrorReporter) {
  const failed = createHttpApp(reporter ? { reportServerError: reporter } : {});
  failed.all('*', (context) => {
    // Fixed stage names only; never derive diagnostics from an error or secret.
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

/**
 * Compose the API once per Edge worker. The worker keeps one small pool across
 * its requests, so a request does not pay a new database connection. A startup
 * failure keeps answering with the same redacted response.
 */
export function createEdgeHandler(
  env: Environment,
  options: {
    release?: EdgeRelease;
    waitUntil?: (work: Promise<unknown>) => void;
    readConfiguration?: typeof readConfig;
    createDatabase?: (config: ReturnType<typeof readConfig>) => Database;
    buildApp?: typeof buildRuntimeApp;
  } = {},
) {
  const readConfiguration = options.readConfiguration ?? readConfig;
  const openDatabase = options.createDatabase ?? createDatabase;
  const build = options.buildApp ?? buildRuntimeApp;
  let stage: StartupStage = 'configuration';
  let reporter: ServerErrorReporter | undefined;
  let database: Database | undefined;
  try {
    const config = readConfiguration(
      edgeConfigEnvironment(env, options.release),
    );
    stage = 'reporter';
    reporter = deferredReporter(
      createServerErrorReporter(config.API_SENTRY),
      options.waitUntil,
    );
    stage = 'database';
    database = openDatabase(config);
    stage = 'composition';
    const app = build(config, database, {
      clientAddress: (context) => edgeClientAddress(context.req.raw),
      reportServerError: reporter,
    });
    return {
      database,
      fetch: (request: Request) => app.fetch(stripFunctionPrefix(request)),
    };
  } catch {
    if (database)
      database.pool.end().catch(() => {
        console.error(JSON.stringify({ event: 'database_pool_close_error' }));
      });
    const failed = startupFailure(stage, reporter);
    return {
      database: undefined,
      fetch: (request: Request) => failed.fetch(stripFunctionPrefix(request)),
    };
  }
}
