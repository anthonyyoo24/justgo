import type { FastifyInstance } from 'fastify';
import { catalogSchema } from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import type { ChallengeService } from './service.js';
export function challengeRoutes(
  app: FastifyInstance,
  service: ChallengeService,
) {
  app.get('/', async (req) =>
    catalogSchema.parse(await service.catalog(bearer(req))),
  );
}
