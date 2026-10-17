import { parse } from '../http/parse.js';
import type { FastifyInstance } from 'fastify';
import {
  progressSummaryQuerySchema,
  progressSummarySchema,
  progressCalendarQuerySchema,
  progressCalendarSchema,
} from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import type { ProgressResources } from './service.js';

/**
 * Register independent summary and calendar reads with validated query inputs.
 * Day-history paging belongs to the attempt routes, not a combined Progress read.
 */
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
