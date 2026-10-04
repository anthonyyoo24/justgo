import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  attemptResultSchema,
  challengeStateSchema,
  finishAttemptSchema,
  okSchema,
  queueSchema,
  selectVenueSchema,
  skipChallengeSchema,
  startAttemptSchema,
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
  app.get('/state', async (req) =>
    challengeStateSchema.parse(await service.state(bearer(req))),
  );
  app.get('/queue/:venue', async (req) =>
    queueSchema.parse(
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
        parse(selectVenueSchema, req.body).venue,
      ),
    ),
  );
  app.post('/skip', async (req) =>
    queueSchema.parse(
      await service.skip(bearer(req), parse(skipChallengeSchema, req.body)),
    ),
  );
  app.post('/start', async (req) =>
    attemptResultSchema.parse(
      await service.start(bearer(req), parse(startAttemptSchema, req.body)),
    ),
  );
  app.post('/finish', async (req) =>
    attemptResultSchema.parse(
      await service.finish(bearer(req), parse(finishAttemptSchema, req.body)),
    ),
  );
  app.get('/attempt/:id', async (req) =>
    attemptResultSchema.parse(
      await service.getAttempt(
        bearer(req),
        parse(z.object({ id: z.uuid() }), req.params).id,
      ),
    ),
  );
}
