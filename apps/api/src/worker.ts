import { isIP } from 'node:net';
import { buildRuntimeApp } from './runtime-app.js';
import { createHttpApp } from './http/app.js';
import {
  createServerErrorReporter,
  type ServerErrorReporter,
} from './http/server-error-reporter.js';
import {
  createWorkerDatabase,
  readWorkerConfig,
  type WorkerBindings,
} from './db/worker-database.js';
import { checkDatabase, createDatabase } from './db/client.js';

type Execution = { waitUntil: (work: Promise<unknown>) => void };
type StartupStage = 'configuration' | 'reporter' | 'database' | 'composition';

/** The edge overwrites this header. Forwarded/X-Forwarded-For never authorizes a bucket. */
export function workerClientAddress(request: Request) {
  const address = request.headers.get('cf-connecting-ip') ?? '';
  return isIP(address) ? address : 'unknown';
}

/**
 * Compose the Worker with injectable configuration, database and app adapters.
 * Only each binding's bounded error-reporting budget survives across requests;
 * database pools and account work belong to the invocation that creates them.
 */
export function createWorker(
  dependencies = {
    readConfiguration: readWorkerConfig,
    createDatabase: createWorkerDatabase,
    buildApp: buildRuntimeApp,
  },
) {
  // Only the bounded diagnostic budget is shared. No sockets, account state or
  // in-flight promises escape the invocation that owns them.
  const reporters = new WeakMap<WorkerBindings, ServerErrorReporter>();
  return {
    /**
     * Serve one request with redacted startup failures and invocation-owned I/O.
     * Register pool shutdown with waitUntil even when app composition fails;
     * managed readiness uses Hyperdrive's verified origin connection. Only
     * loopback legacy smoke additionally validates its direct connection.
     */
    async fetch(
      request: Request,
      bindings: WorkerBindings,
      execution: Execution,
    ): Promise<Response> {
      let database: ReturnType<typeof createWorkerDatabase> | undefined;
      let reporter: ServerErrorReporter | undefined;
      let startupStage: StartupStage | undefined = 'configuration';
      try {
        const settings = dependencies.readConfiguration(bindings);
        startupStage = 'reporter';
        reporter = reporters.get(bindings);
        if (!reporter) {
          reporter = createServerErrorReporter(settings.config.API_SENTRY);
          reporters.set(bindings, reporter);
        }
        startupStage = 'database';
        database = dependencies.createDatabase(request, settings);
        const invocationPool = database.pool;
        startupStage = 'composition';
        const app = dependencies.buildApp(settings.config, database, {
          clientAddress: (context) => workerClientAddress(context.req.raw),
          reportServerError: reporter,
          /**
           * Require the active transport to reach the expected database. Managed
           * requests use Hyperdrive, whose origin verifies the Supabase CA.
           * The loopback-only legacy fixture retains its direct lock connection.
           */
          checkAdditionalDatabase: async () => {
            const direct = settings.config.MANAGED_AUTH_ENABLED
              ? undefined
              : createDatabase(settings.lockConfig);
            try {
              const pools = direct
                ? [invocationPool, direct.pool]
                : [invocationPool];
              for (const pool of pools) {
                const result = await pool.query<{ database_ok: boolean }>(
                  'select current_database()::text = $1::text as database_ok',
                  [settings.databaseName],
                );
                if (result.rows[0]?.database_ok !== true)
                  throw new Error('Database readiness check failed');
              }
              if (direct) await checkDatabase(direct.pool);
            } finally {
              if (direct) await direct.pool.end();
            }
          },
        });
        startupStage = undefined;
        return await app.fetch(request);
      } catch {
        // Configuration/adapter startup errors receive the same safe HTTP
        // boundary. No raw error, binding, URL or credential is serialized.
        const failed = createHttpApp(
          reporter ? { reportServerError: reporter } : {},
        );
        failed.all('*', (context) => {
          // Fixed code locations only; never derive diagnostics from an exception
          // or binding. A request failure after startup has no startup-stage claim.
          if (startupStage)
            context.header('x-justgo-startup-stage', startupStage);
          if (context.req.path === '/ready')
            return context.json({ status: 'unavailable' }, 503);
          return context.json(
            context.req.path.startsWith('/v1/')
              ? { code: 'UNAVAILABLE', requestId: context.get('diagnostic').id }
              : {
                  error: 'Internal server error',
                  requestId: context.get('diagnostic').id,
                },
            context.req.path.startsWith('/v1/') ? 503 : 500,
          );
        });
        return await failed.fetch(request);
      } finally {
        if (database)
          execution.waitUntil(
            database.pool.end().catch(() => {
              console.error(
                JSON.stringify({ event: 'database_pool_close_error' }),
              );
            }),
          );
      }
    },
  };
}

export default createWorker();
