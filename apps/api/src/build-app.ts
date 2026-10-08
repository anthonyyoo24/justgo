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
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  healthResponseSchema,
  readinessResponseSchema,
  openApiDocument,
} from '@justgo/contracts';
import { loggerOptions } from './diagnostics.js';
import { IdentityError, type IdentityService } from './identity/service.js';
import { bearer, identityRoutes } from './identity/routes.js';
import { AccessService, type EntitlementReader } from './access/service.js';

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
      const dbCode =
        (error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code;
      const code =
        dbCode === '23505'
          ? 'CONFLICT'
          : error.statusCode === 400
            ? 'INVALID_REQUEST'
            : error.statusCode === 413
              ? 'REQUEST_TOO_LARGE'
              : error.statusCode === 415
                ? 'UNSUPPORTED_MEDIA_TYPE'
                : 'UNAVAILABLE';
      request.log.error({ err: error }, 'API operation failed');
      void reply
        .code(
          code === 'CONFLICT'
            ? 409
            : code === 'INVALID_REQUEST'
              ? 400
              : code === 'REQUEST_TOO_LARGE'
                ? 413
                : code === 'UNSUPPORTED_MEDIA_TYPE'
                  ? 415
                  : 503,
        )
        .send({ code, requestId: request.id });
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
