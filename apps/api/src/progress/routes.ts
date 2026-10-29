import type { ApiApp } from '../http/request.js';
import { requestQuery } from '../http/request.js';
import { parse } from '../http/parse.js';
import {
  progressSummaryQuerySchema,
  progressSummarySchema,
  progressCalendarQuerySchema,
  progressCalendarSchema,
} from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import type { ProgressResources } from './service.js';
/** Independent summary and calendar reads; day paging belongs to attempts. */
export function progressRoutes(app: ApiApp, resources: ProgressResources) {
  app.get('/summary', async (context) =>
    context.json(
      progressSummarySchema.parse(
        await resources.summary(
          bearer(context),
          parse(progressSummaryQuerySchema, requestQuery(context)).timeZone,
        ),
      ),
    ),
  );
  app.get('/calendar', async (context) =>
    context.json(
      progressCalendarSchema.parse(
        await resources.calendar(
          bearer(context),
          parse(progressCalendarQuerySchema, requestQuery(context)).month,
        ),
      ),
    ),
  );
}
