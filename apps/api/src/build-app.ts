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
  withBilling,
} from '@justgo/contracts/openapi';
import type {
  AppleSubscriptionReader,
  AppleTransactionReader,
} from './billing/apple.js';
import { billingRoutes } from './billing/verify.js';
import { billingEventRoutes } from './billing/webhook.js';
import { billingRepairRoutes } from './billing/repair.js';
import { AccessService, type EntitlementReader } from './access/service.js';
import { createPaidAccess } from './access/paid-access.js';
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
    entitlementReader?: EntitlementReader;
    uploadEligibilityReader?: UploadEligibilityReader;
    developmentLegalDrafts?: boolean;
    guestAccessReader?: GuestAccessReader;
    legacyIdentityEnabled?: boolean;
    /** Set only when BILLING_ENABLED is on. */
    billing?: AppleTransactionReader;
    /** Superwall events and the scheduled repair, also only with BILLING_ENABLED. */
    billingEvents?: {
      subscriptions: AppleSubscriptionReader;
      webhookSecret: string;
      repairSecret: string;
    };
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
  const identity = options.identity;
  const billing = identity ? options.billing : undefined;
  // With billing on, only saved Apple subscriptions grant access.
  const access = billing ? createPaidAccess() : options;
  const document =
    options.legacyIdentityEnabled === false
      ? managedOpenApiDocument
      : openApiDocument;
  const events = billing ? options.billingEvents : undefined;
  const served = billing ? withBilling(document, Boolean(events)) : document;
  app.get('/openapi.json', (context) => context.json(served));
  if (identity) {
    const guest = new GuestService(identity, access.guestAccessReader);
    app.get('/v1/guest/access', async (context) =>
      context.json(accessResponseSchema.parse(await guest.access())),
    );
    app.get('/v1/guest/challenges', async (context) =>
      context.json(catalogSchema.parse(await guest.catalog())),
    );
    mount('/v1/auth', (scope) => managedIdentityRoutes(scope, identity));
    mount('/v1', (scope) => dataSyncRoutes(scope, identity));
    if (billing)
      mount('/v1/billing', (scope) => {
        billingRoutes(scope, identity, billing);
        if (events) {
          billingEventRoutes(scope, identity, events);
          billingRepairRoutes(scope, identity, events);
        }
      });
  }
  if (options.developmentLegalDrafts && process.env.NODE_ENV !== 'production')
    developmentLegalDraftRoutes(app);
  mount('/v1', (scope) =>
    accessRoutes(
      scope,
      identity
        ? new AccessService(identity, access.entitlementReader)
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
        new ChallengeService(identity, access.entitlementReader),
      ),
    );
    mount('/v1/progress', (scope) =>
      progressRoutes(
        scope,
        new ProgressResources(identity, access.entitlementReader),
      ),
    );
    mount('/v1', (scope) =>
      identityRoutes(scope, identity, options.legacyIdentityEnabled),
    );
    mount('/v1/attempts', (scope) =>
      attemptRoutes(
        scope,
        new AttemptService(identity, access.uploadEligibilityReader),
        new ProgressResources(identity, access.entitlementReader),
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
