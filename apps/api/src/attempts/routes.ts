import { parse } from '../http/parse.js';
import type { FastifyInstance } from 'fastify';
import {
  createAttemptSchema,
  completionAttemptResultSchema,
  progressDayQuerySchema,
  completionProgressDayResponseSchema,
} from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import type { AttemptService } from './service.js';
import type { ProgressResources } from '../progress/service.js';
import { rejectPrivateJournalWrite } from './patch.js';

export function attemptRoutes(
  app: FastifyInstance,
  service: AttemptService,
  progress: ProgressResources,
) {
  app.post('/', async (req, reply) => {
    const result = await service.create(
      bearer(req),
      parse(createAttemptSchema, req.body),
    );
    return reply
      .code(result.created ? 201 : 200)
      .send(completionAttemptResultSchema.parse({ attempt: result.attempt }));
  });
  // Reject before Fastify reads/parses a legacy private request body.
  app.patch(
    '/:id',
    { onRequest: rejectPrivateJournalWrite },
    rejectPrivateJournalWrite,
  );
  app.get('/', async (req) => {
    const { date, limit, cursor } = parse(progressDayQuerySchema, req.query);
    return completionProgressDayResponseSchema.parse(
      await progress.day(bearer(req), date, limit, cursor),
    );
  });
}
