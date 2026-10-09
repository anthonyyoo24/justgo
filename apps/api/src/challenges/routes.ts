import type { FastifyInstance } from 'fastify';
import { catalogSchema } from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import type { ChallengeService } from './service.js';
/**
 * Register the authenticated current-catalog resource with response validation.
 * Deck selection, skips and unfinished challenge lifecycle have no server routes.
 */
export function challengeRoutes(
  app: FastifyInstance,
  service: ChallengeService,
) {
  app.get('/', async (req) =>
    catalogSchema.parse(await service.catalog(bearer(req))),
  );
}
