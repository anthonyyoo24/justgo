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
import { Hono } from 'hono';
import type { ApiEnvironment, ApiApp } from './http/request.js';
import { createHttpApp, type HttpOptions } from './http/app.js';
import type { IdentityService } from './identity/service.js';
import { identityRoutes } from './identity/routes.js';
import { accessRoutes } from './access/routes.js';
import {
  openApiDocument,
  managedOpenApiDocument,
} from '@justgo/contracts/openapi';
import { AccessService, type EntitlementReader } from './access/service.js';
import { GuestService, type GuestAccessReader } from './access/guest.js';
import { managedIdentityRoutes } from './identity/managed-routes.js';
import { dataSyncRoutes } from './data-sync/routes.js';
import {
  catalogSchema,
  accessResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@justgo/contracts';

/**
 * Compose the HTTP app with injected database, identity and access boundaries.
 * Authenticated product routes are registered only when identity is supplied;
 * missing access/coverage providers remain unavailable rather than granting access.
 */
export function buildApp(
  options: HttpOptions & {
    checkDatabase: () => Promise<void>;
    identity?: IdentityService;
    onVercel?: boolean;
    entitlementReader?: EntitlementReader;
    uploadEligibilityReader?: UploadEligibilityReader;
    developmentLegalDrafts?: boolean;
    guestAccessReader?: GuestAccessReader;
    legacyIdentityEnabled?: boolean;
  },
) {
  const app = createHttpApp(options);
  function mount(prefix: string, register: (router: ApiApp) => void) {
    const router = new Hono<ApiEnvironment>();
    register(router);
    app.route(prefix, router);
    // Fastify's prefixed '/' resources accept both forms; other paths stay strict.
    for (const route of router.routes)
      if (route.path === '/') app.on(route.method, `${prefix}/`, route.handler);
  }
  app.get('/health', (context) =>
    context.json(
      healthResponseSchema.parse({ status: 'ok', service: 'justgo-api' }),
    ),
  );
  app.get('/openapi.json', (context) =>
    context.json(
      options.legacyIdentityEnabled === false
        ? managedOpenApiDocument
        : openApiDocument,
    ),
  );
  const identity = options.identity;
  if (identity) {
    const guest = new GuestService(identity, options.guestAccessReader);
    app.get('/v1/guest/access', async (context) =>
      context.json(accessResponseSchema.parse(await guest.access())),
    );
    app.get('/v1/guest/challenges', async (context) =>
      context.json(catalogSchema.parse(await guest.catalog())),
    );
    mount('/v1/auth', (scope) =>
      managedIdentityRoutes(scope, identity, options.onVercel),
    );
    mount('/v1', (scope) => dataSyncRoutes(scope, identity));
  }
  if (
    options.developmentLegalDrafts &&
    process.env.NODE_ENV !== 'production' &&
    !process.env.VERCEL
  )
    developmentLegalDraftRoutes(app);
  mount('/v1', (scope) =>
    accessRoutes(
      scope,
      identity
        ? new AccessService(identity, options.entitlementReader)
        : undefined,
    ),
  );
  if (identity) {
    mount('/v1/account', (scope) =>
      accountExportRoutes(scope, new ExportService(identity)),
    );
    mount('/v1/challenges', (scope) =>
      challengeRoutes(
        scope,
        new ChallengeService(identity, options.entitlementReader),
      ),
    );
    mount('/v1/progress', (scope) =>
      progressRoutes(
        scope,
        new ProgressResources(identity, options.entitlementReader),
      ),
    );
    mount('/v1', (scope) =>
      identityRoutes(
        scope,
        identity,
        options.onVercel,
        options.legacyIdentityEnabled,
      ),
    );
    mount('/v1/attempts', (scope) =>
      attemptRoutes(
        scope,
        new AttemptService(identity, options.uploadEligibilityReader),
        new ProgressResources(identity, options.entitlementReader),
      ),
    );
  }
  app.get('/ready', async (context) => {
    try {
      await options.checkDatabase();
      return context.json(readinessResponseSchema.parse({ status: 'ready' }));
    } catch {
      return context.json(
        readinessResponseSchema.parse({ status: 'unavailable' }),
        503,
      );
    }
  });
  return app;
}
