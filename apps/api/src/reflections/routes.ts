import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  reflectionResponseSchema,
  reflectionMutationSchema,
  reflectionSkipSchema,
} from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import { IdentityError } from '../identity/service.js';
import type { ReflectionService } from './service.js';

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_REQUEST', 400);
  return result.data;
};
const params = z.object({ attemptId: z.uuid() }).strict();
export function reflectionRoutes(
  app: FastifyInstance,
  service: ReflectionService,
) {
  app.get('/:attemptId', async (req) =>
    reflectionResponseSchema.parse(
      await service.get(bearer(req), parse(params, req.params).attemptId),
    ),
  );
  for (const action of ['draft', 'final'] as const)
    app.post(`/:attemptId/${action}`, async (req) =>
      reflectionResponseSchema.parse(
        await service.write(
          bearer(req),
          parse(params, req.params).attemptId,
          action,
          parse(reflectionMutationSchema, req.body),
        ),
      ),
    );
  app.post('/:attemptId/skip', async (req) =>
    reflectionResponseSchema.parse(
      await service.write(
        bearer(req),
        parse(params, req.params).attemptId,
        'skip',
        parse(reflectionSkipSchema, req.body),
      ),
    ),
  );
}
