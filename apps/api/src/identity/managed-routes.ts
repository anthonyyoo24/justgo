import type { FastifyInstance } from 'fastify';
import {
  managedSessionRequestSchema,
  managedSessionResponseSchema,
  managedLogoutRequestSchema,
  okSchema,
} from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import { parse } from '../http/parse.js';
import { ApiError } from '../http/api-error.js';
import type { IdentityService } from './service.js';
import { rateAddress } from './address.js';
export function managedIdentityRoutes(
  app: FastifyInstance,
  identity: IdentityService,
  onVercel = false,
) {
  app.addHook('onRequest', async (request) =>
    identity.rateLimit(
      rateAddress(request.ip, request.headers, onVercel),
      'managed-auth',
      120,
    ),
  );
  app.post('/session', async (request) =>
    managedSessionResponseSchema.parse(
      await identity.exchangeManaged(
        bearer(request),
        parse(managedSessionRequestSchema, request.body),
      ),
    ),
  );
  app.get('/session', async (request) => {
    if (!identity.managed) throw new ApiError('UNAVAILABLE', 503);
    return identity.managed.withSession(bearer(request), async (_tx, session) =>
      managedSessionResponseSchema.parse(session),
    );
  });
  app.post('/logout', async (request) => {
    if (!identity.managed) throw new ApiError('UNAVAILABLE', 503);
    return okSchema.parse(
      await identity.managed.logout(
        bearer(request),
        parse(managedLogoutRequestSchema, request.body).scope,
      ),
    );
  });
}
