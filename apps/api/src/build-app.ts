import {
  AttemptService,
  type UploadEligibilityReader,
} from './attempts/service.js';
import { attemptRoutes } from './attempts/routes.js';
import { ProgressResources } from './progress/service.js';
import { ChallengeService } from './challenges/service.js';
import { challengeRoutes } from './challenges/routes.js';
import { progressRoutes } from './progress/routes.js';
import { ExportService } from './account-export/service.js';
import { accountExportRoutes } from './account-export/routes.js';
import { developmentLegalDraftRoutes } from './http/legal-drafts.js';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  healthResponseSchema,
  readinessResponseSchema,
} from '@justgo/contracts';
import { loggerOptions } from './http/diagnostics.js';
import type { IdentityService } from './identity/service.js';
import { identityRoutes } from './identity/routes.js';
import { accessRoutes } from './access/routes.js';
import { errorHandler, notFoundHandler } from './http/error-handler.js';
import {
  openApiDocument,
  managedOpenApiDocument,
} from '@justgo/contracts/openapi';
import { AccessService, type EntitlementReader } from './access/service.js';
import { GuestService, type GuestAccessReader } from './access/guest.js';
import { managedIdentityRoutes } from './identity/managed-routes.js';
import { dataSyncRoutes } from './data-sync/routes.js';
import { catalogSchema, accessResponseSchema } from '@justgo/contracts';

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
    developmentLegalDrafts?: boolean;
    guestAccessReader?: GuestAccessReader;
    legacyIdentityEnabled?: boolean;
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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
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
  app.get('/openapi.json', async () =>
    options.legacyIdentityEnabled === false
      ? managedOpenApiDocument
      : openApiDocument,
  );
  if (options.identity) {
    const guest = new GuestService(options.identity, options.guestAccessReader);
    app.get('/v1/guest/access', async () =>
      accessResponseSchema.parse(await guest.access()),
    );
    app.get('/v1/guest/challenges', async () =>
      catalogSchema.parse(await guest.catalog()),
    );
    app.register(
      async (scope) =>
        managedIdentityRoutes(scope, options.identity!, options.onVercel),
      { prefix: '/v1/auth' },
    );
    app.register(async (scope) => dataSyncRoutes(scope, options.identity!), {
      prefix: '/v1',
    });
  }
  if (
    options.developmentLegalDrafts &&
    process.env.NODE_ENV !== 'production' &&
    !process.env.VERCEL
  )
    developmentLegalDraftRoutes(app);
  app.register(
    async (scope) =>
      accessRoutes(
        scope,
        options.identity
          ? new AccessService(options.identity, options.entitlementReader)
          : undefined,
      ),
    { prefix: '/v1' },
  );
  if (options.identity)
    app.register(
      async (scope) =>
        accountExportRoutes(scope, new ExportService(options.identity!)),
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
        identityRoutes(
          scope,
          options.identity!,
          options.onVercel,
          options.legacyIdentityEnabled,
        ),
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
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  return app;
}
