import type { ApiApp } from '../http/request.js';
import { catalogSchema } from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import type { ChallengeService } from './service.js';
/** Authenticated catalog only; unfinished challenge lifecycle stays on the phone. */
export function challengeRoutes(app: ApiApp, service: ChallengeService) {
  app.get('/', async (context) =>
    context.json(catalogSchema.parse(await service.catalog(bearer(context)))),
  );
}
