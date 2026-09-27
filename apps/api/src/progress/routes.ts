import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  calendarDateSchema,
  progressDayQuerySchema,
  progressDayResponseSchema,
  progressQuerySchema,
  progressResponseSchema,
} from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import { IdentityError } from '../identity/service.js';
import type { ProgressService } from './service.js';

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_REQUEST', 400);
  return result.data;
};
export function progressRoutes(app: FastifyInstance, service: ProgressService) {
  app.get('/', async (req) => {
    const { month, timeZone } = parse(progressQuerySchema, req.query);
    return progressResponseSchema.parse(
      await service.summary(bearer(req), month, timeZone),
    );
  });
  app.get('/days/:date', async (req) => {
    const { date } = parse(
      z.object({ date: calendarDateSchema }).strict(),
      req.params,
    );
    const { limit, cursor } = parse(progressDayQuerySchema, req.query);
    return progressDayResponseSchema.parse(
      await service.day(bearer(req), date, limit, cursor),
    );
  });
}
