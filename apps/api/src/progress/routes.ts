import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  calendarDateSchema,
  progressSummaryQuerySchema,
  progressSummarySchema,
  progressCalendarQuerySchema,
  progressCalendarSchema,
  legacyProgressDayQuerySchema,
  legacyProgressDayResponseSchema,
  legacyProgressQuerySchema,
  legacyProgressResponseSchema,
} from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import { IdentityError } from '../identity/service.js';
import type { ProgressService } from './service.js';
import type { ProgressResources } from './resources.js';

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_REQUEST', 400);
  return result.data;
};
export function progressRoutes(
  app: FastifyInstance,
  service: ProgressService,
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
  app.get('/', async (req) => {
    const { month, timeZone } = parse(legacyProgressQuerySchema, req.query);
    return legacyProgressResponseSchema.parse(
      await service.summary(bearer(req), month, timeZone),
    );
  });
  app.get('/days/:date', async (req) => {
    const { date } = parse(
      z.object({ date: calendarDateSchema }).strict(),
      req.params,
    );
    const { limit, cursor } = parse(legacyProgressDayQuerySchema, req.query);
    return legacyProgressDayResponseSchema.parse(
      await service.day(bearer(req), date, limit, cursor),
    );
  });
}
