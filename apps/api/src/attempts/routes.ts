import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  idSchema,
  patchAttemptSchema,
  patchAttemptResponseSchema,
  createAttemptSchema,
  attemptResultSchema,
  progressDayQuerySchema,
  progressDayResponseSchema,
} from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import { IdentityError } from '../identity/service.js';
import type { AttemptService } from './service.js';
import type { ProgressResources } from '../progress/resources.js';
import type { AttemptPatchService } from './patch.js';
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new IdentityError('INVALID_REQUEST', 400);
  return parsed.data;
};
export function attemptRoutes(
  app: FastifyInstance,
  service: AttemptService,
  progress: ProgressResources,
  patch: AttemptPatchService,
) {
  app.post('/', async (req, reply) => {
    const result = await service.create(
      bearer(req),
      parse(createAttemptSchema, req.body),
    );
    return reply
      .code(result.created ? 201 : 200)
      .send(attemptResultSchema.parse({ attempt: result.attempt }));
  });
  app.patch('/:id', async (req) =>
    patchAttemptResponseSchema.parse(
      await patch.patch(
        bearer(req),
        parse(idSchema, req.params).id,
        parse(patchAttemptSchema, req.body),
      ),
    ),
  );
  app.get('/', async (req) => {
    const { date, limit, cursor } = parse(progressDayQuerySchema, req.query);
    return progressDayResponseSchema.parse(
      await progress.day(bearer(req), date, limit, cursor),
    );
  });
}
