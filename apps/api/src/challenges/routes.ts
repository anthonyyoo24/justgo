import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  catalogSchema,
  legacyAttemptResultSchema,
  legacyChallengeStateSchema,
  legacyFinishAttemptSchema,
  okSchema,
  legacyQueueSchema,
  legacySelectVenueSchema,
  legacySkipChallengeSchema,
  legacyStartAttemptSchema,
  venueSchema,
} from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import { IdentityError } from '../identity/service.js';
import type { ChallengeService } from './service.js';
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_REQUEST', 400);
  return result.data;
};
export function challengeRoutes(
  app: FastifyInstance,
  service: ChallengeService,
) {
  app.get('/', async (req) =>
    catalogSchema.parse(await service.catalog(bearer(req))),
  );
  app.get('/state', async (req) =>
    legacyChallengeStateSchema.parse(await service.state(bearer(req))),
  );
  app.get('/queue/:venue', async (req) =>
    legacyQueueSchema.parse(
      await service.getQueue(
        bearer(req),
        parse(z.object({ venue: venueSchema }), req.params).venue,
      ),
    ),
  );
  app.post('/venue', async (req) =>
    okSchema.parse(
      await service.selectVenue(
        bearer(req),
        parse(legacySelectVenueSchema, req.body).venue,
      ),
    ),
  );
  app.post('/skip', async (req) =>
    legacyQueueSchema.parse(
      await service.skip(
        bearer(req),
        parse(legacySkipChallengeSchema, req.body),
      ),
    ),
  );
  app.post('/start', async (req) =>
    legacyAttemptResultSchema.parse(
      await service.start(
        bearer(req),
        parse(legacyStartAttemptSchema, req.body),
      ),
    ),
  );
  app.post('/finish', async (req) =>
    legacyAttemptResultSchema.parse(
      await service.finish(
        bearer(req),
        parse(legacyFinishAttemptSchema, req.body),
      ),
    ),
  );
  app.get('/attempt/:id', async (req) =>
    legacyAttemptResultSchema.parse(
      await service.getAttempt(
        bearer(req),
        parse(z.object({ id: z.uuid() }), req.params).id,
      ),
    ),
  );
}
