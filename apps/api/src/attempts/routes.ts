import type { ApiApp } from '../http/request.js';
import {
  parseRequestBody,
  requestBody,
  requestQuery,
} from '../http/request.js';
import { parse } from '../http/parse.js';
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
  app: ApiApp,
  service: AttemptService,
  progress: ProgressResources,
) {
  app.post('/', parseRequestBody(), async (context) => {
    const result = await service.create(
      bearer(context),
      parse(createAttemptSchema, requestBody(context)),
    );
    return context.json(
      completionAttemptResultSchema.parse({ attempt: result.attempt }),
      result.created ? 201 : 200,
    );
  });
  // Reject before reading or parsing a legacy private request body.
  app.patch('/:id', rejectPrivateJournalWrite);
  app.get('/', async (context) => {
    const { date, limit, cursor } = parse(
      progressDayQuerySchema,
      requestQuery(context),
    );
    return context.json(
      completionProgressDayResponseSchema.parse(
        await progress.day(bearer(context), date, limit, cursor),
      ),
    );
  });
}
