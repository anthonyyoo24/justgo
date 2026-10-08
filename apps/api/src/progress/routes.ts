import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  progressSummaryQuerySchema,
  progressSummarySchema,
  progressCalendarQuerySchema,
  progressCalendarSchema,
} from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import { IdentityError } from '../identity/service.js';
import type { ProgressResources } from './resources.js';

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_REQUEST', 400);
  return result.data;
};
export function progressRoutes(
  app: FastifyInstance,
  resources: ProgressResources,
) {
  app.get('/summary', async (req) =>
    progressSummarySchema.parse(
      await resources.summary(
        bearer(req),
        parse(progressSummaryQuerySchema, req.query).timeZone,
      ),
    ),
  );
  app.get('/calendar', async (req) =>
    progressCalendarSchema.parse(
      await resources.calendar(
        bearer(req),
        parse(progressCalendarQuerySchema, req.query).month,
      ),
    ),
  );
}
