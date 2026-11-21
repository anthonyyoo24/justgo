import type { ApiApp, ApiContext } from '../http/request.js';
import { parseRequestBody, requestBody } from '../http/request.js';
import {
  managedSessionRequestSchema,
  managedSessionWireSchema,
  managedLogoutRequestSchema,
  okSchema,
  type ManagedSessionResponse,
} from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import { parse } from '../http/parse.js';
import { ApiError } from '../http/api-error.js';
import type { IdentityService } from './service.js';
const wire = ({ guest, ...session }: ManagedSessionResponse) =>
  managedSessionWireSchema.parse(guest ? { ...session, guest } : session);
export function managedIdentityRoutes(app: ApiApp, identity: IdentityService) {
  const general = async (request: ApiContext, next: () => Promise<void>) => {
    await identity.rateLimit(request.get('clientAddress'), 'managed-auth', 120);
    await next();
  };
  app.post('/session', general, parseRequestBody(), async (request) =>
    request.json(
      wire(
        await identity.exchangeManaged(
          bearer(request),
          parse(managedSessionRequestSchema, requestBody(request)),
        ),
      ),
    ),
  );
  app.get('/session', general, async (request) => {
    if (!identity.managed) throw new ApiError('UNAVAILABLE', 503);
    return request.json(
      await identity.managed.withSession(
        bearer(request),
        async (_tx, session) => wire(session),
      ),
    );
  });
  app.post('/logout', general, parseRequestBody(), async (request) => {
    if (!identity.managed) throw new ApiError('UNAVAILABLE', 503);
    return request.json(
      okSchema.parse(
        await identity.managed.logout(
          bearer(request),
          parse(managedLogoutRequestSchema, requestBody(request)).scope,
        ),
      ),
    );
  });
}
