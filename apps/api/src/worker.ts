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
import {
  checkDatabase,
  checkManagedAuthDatabase,
  createDatabase,
} from './db/client.js';

type Execution = { waitUntil: (work: Promise<unknown>) => void };

/** The edge overwrites this header. Forwarded/X-Forwarded-For never authorizes a bucket. */
export function workerClientAddress(request: Request) {
  const address = request.headers.get('cf-connecting-ip') ?? '';
  return isIP(address) ? address : 'unknown';
}

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
    async fetch(
      request: Request,
      bindings: WorkerBindings,
      execution: Execution,
    ): Promise<Response> {
      let database: ReturnType<typeof createWorkerDatabase> | undefined;
      let reporter: ServerErrorReporter | undefined;
      try {
        const settings = dependencies.readConfiguration(bindings);
        reporter = reporters.get(bindings);
        if (!reporter) {
          reporter = createServerErrorReporter(settings.config.API_SENTRY);
          reporters.set(bindings, reporter);
        }
        database = dependencies.createDatabase(request, settings);
        const app = dependencies.buildApp(settings.config, database, {
          clientAddress: (context) => workerClientAddress(context.req.raw),
          reportServerError: reporter,
          checkAdditionalDatabase: async () => {
            const direct = createDatabase(settings.lockConfig);
            try {
              await checkDatabase(direct.pool);
              if (settings.config.MANAGED_AUTH_ENABLED)
                await checkManagedAuthDatabase(direct.pool);
            } finally {
              await direct.pool.end();
            }
          },
        });
        return await app.fetch(request);
      } catch {
        // Configuration/adapter startup errors receive the same safe HTTP
        // boundary. No raw error, binding, URL or credential is serialized.
        const failed = createHttpApp(
          reporter ? { reportServerError: reporter } : {},
        );
        failed.all('*', (context) => {
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
