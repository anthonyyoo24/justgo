import {
  AttemptService,
  type UploadEligibilityReader,
} from './attempts/service.js';
import { AttemptPatchService, ReflectionConflict } from './attempts/patch.js';
import { attemptRoutes } from './attempts/routes.js';
import { ProgressResources } from './progress/resources.js';
import { ChallengeService } from './challenges/service.js';
import { challengeRoutes } from './challenges/routes.js';
import { progressRoutes } from './progress/routes.js';
import { ExportService } from './privacy/export.js';
import { privacyRoutes } from './privacy/routes.js';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  healthResponseSchema,
  readinessResponseSchema,
  openApiDocument,
  type IdentityErrorCode,
} from '@justgo/contracts';
import { loggerOptions } from './diagnostics.js';
import { IdentityError, type IdentityService } from './identity/service.js';
import { bearer, identityRoutes } from './identity/routes.js';
import { AccessService, type EntitlementReader } from './access/service.js';

/** Typed codes for request errors Fastify raises before route code runs. */
const requestErrorCodes: Partial<Record<number, IdentityErrorCode>> = {
  400: 'INVALID_REQUEST',
  413: 'REQUEST_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

/**
 * Map a non-domain failure on a versioned route. Any other 4xx stays a client
 * error with its own status, so clients do not retry unchanged input as if the
 * service were down; only failures without a client status become 503.
 */
function versionedFailure(error: {
  statusCode?: number;
  code?: string;
  cause?: unknown;
}): { status: number; code: IdentityErrorCode } {
  const dbCode =
    error.code ?? (error.cause as { code?: string } | undefined)?.code;
  if (dbCode === '23505') return { status: 409, code: 'CONFLICT' };
  const status = error.statusCode;
  if (status !== undefined && status >= 400 && status < 500)
    return { status, code: requestErrorCodes[status] ?? 'INVALID_REQUEST' };
  return { status: 503, code: 'UNAVAILABLE' };
}

/**
 * Compose the HTTP app with injected database, identity and access boundaries.
 * Authenticated product routes are registered only when identity is supplied;
 * missing access/coverage providers remain unavailable rather than granting access.
 */
export function buildApp(
  options: {
    checkDatabase: () => Promise<void>;
    origins?: string[];
    logger?: FastifyServerOptions['logger'];
    identity?: IdentityService;
    onVercel?: boolean;
    entitlementReader?: EntitlementReader;
    uploadEligibilityReader?: UploadEligibilityReader;
  },
  createServer: typeof Fastify = Fastify,
) {
  const app = createServer({
    logger: options.logger ?? loggerOptions(),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    bodyLimit: 32 * 1024,
    requestTimeout: 10000,
    connectionTimeout: 10000,
  });
  app.register(helmet);
  app.register(cors, {
    origin: options.origins ?? [],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    exposedHeaders: ['retry-after'],
    credentials: false,
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
  });
  app.get('/health', async () =>
    healthResponseSchema.parse({ status: 'ok', service: 'justgo-api' }),
  );
  app.get('/openapi.json', async () => openApiDocument);
  app.get('/v1/access', async (request) => {
    if (!options.identity) throw new IdentityError('UNAVAILABLE', 503);
    return new AccessService(options.identity, options.entitlementReader).get(
      bearer(request),
    );
  });
  if (options.identity)
    app.register(
      async (scope) =>
        privacyRoutes(scope, new ExportService(options.identity!)),
      { prefix: '/v1/account' },
    );
  if (options.identity)
    app.register(
      async (scope) =>
        challengeRoutes(
          scope,
          new ChallengeService(options.identity!, options.entitlementReader),
        ),
      { prefix: '/v1/challenges' },
    );
  if (options.identity)
    app.register(
      async (scope) =>
        progressRoutes(
          scope,
          new ProgressResources(options.identity!, options.entitlementReader),
        ),
      { prefix: '/v1/progress' },
    );
  if (options.identity)
    app.register(
      async (scope) =>
        identityRoutes(scope, options.identity!, options.onVercel),
      {
        prefix: '/v1',
      },
    );
  if (options.identity)
    app.register(
      async (scope) =>
        attemptRoutes(
          scope,
          new AttemptService(
            options.identity!,
            options.uploadEligibilityReader,
          ),
          new ProgressResources(options.identity!, options.entitlementReader),
          new AttemptPatchService(options.identity!),
        ),
      { prefix: '/v1/attempts' },
    );
  app.get('/ready', async (request, reply) => {
    try {
      await options.checkDatabase();
      return readinessResponseSchema.parse({ status: 'ready' });
    } catch {
      request.log.warn(
        { event: 'database_unavailable' },
        'Readiness check failed',
      );
      return reply
        .code(503)
        .send(readinessResponseSchema.parse({ status: 'unavailable' }));
    }
  });
  app.setErrorHandler<{ statusCode?: number }>((error, request, reply) => {
    if (request.url.startsWith('/v1/')) {
      if (error instanceof IdentityError) {
        if (error.code === 'RATE_LIMITED') reply.header('retry-after', '600');
        void reply.code(error.status).send({
          code: error.code,
          requestId: request.id,
          ...(error instanceof ReflectionConflict
            ? { currentAttempt: error.currentAttempt }
            : {}),
        });
        return;
      }
      const { status, code } = versionedFailure(error);
      request.log.error({ err: error }, 'API operation failed');
      void reply.code(status).send({ code, requestId: request.id });
      return;
    }
    request.log.error({ err: error }, 'Request failed');
    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    void reply.code(statusCode).send({
      error: statusCode < 500 ? 'Invalid request' : 'Internal server error',
      requestId: request.id,
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(
        request.url.startsWith('/v1/')
          ? { code: 'NOT_FOUND', requestId: request.id }
          : { error: 'Not found', requestId: request.id },
      ),
  );
  return app;
}
