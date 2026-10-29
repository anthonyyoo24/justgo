import type { ApiApp } from '../http/request.js';
import {
  parseRequestBody,
  requestBody,
  requestQuery,
} from '../http/request.js';
import {
  completionRestoreRequestSchema,
  completionRestoreResponseSchema,
  completionRestorePageSchema,
  journalSyncRequestSchema,
  journalSyncResponseSchema,
  journalSyncPageSchema,
  dataDeletionRequestSchema,
  dataDeletionResponseSchema,
  syncPageQuerySchema,
} from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
import { bearer } from '../http/bearer.js';
import { parse } from '../http/parse.js';
import { CompletionRestoreService } from './completions.js';
import { JournalSyncService } from './journal.js';
import { DeleteDataService } from './deletion.js';
export function dataSyncRoutes(app: ApiApp, identity: IdentityService) {
  const completions = new CompletionRestoreService(identity),
    journal = new JournalSyncService(identity),
    deletion = new DeleteDataService(identity);
  // 50 records with 10,000-character historical instructions are bounded separately from ordinary API bodies.
  const batchBody = parseRequestBody(4 * 1024 * 1024);
  app.post('/completion-restores', batchBody, async (request) =>
    request.json(
      completionRestoreResponseSchema.parse(
        await completions.restore(
          bearer(request),
          parse(completionRestoreRequestSchema, requestBody(request)),
        ),
      ),
    ),
  );
  app.get('/completion-restores', async (request) => {
    const query = parse(syncPageQuerySchema, requestQuery(request));
    return request.json(
      completionRestorePageSchema.parse(
        await completions.page(bearer(request), query.cursor, query.limit),
      ),
    );
  });
  app.post('/journal-sync', batchBody, async (request) =>
    request.json(
      journalSyncResponseSchema.parse(
        await journal.save(
          bearer(request),
          parse(journalSyncRequestSchema, requestBody(request)),
        ),
      ),
    ),
  );
  app.get('/journal-sync', async (request) => {
    const query = parse(syncPageQuerySchema, requestQuery(request));
    return request.json(
      journalSyncPageSchema.parse(
        await journal.page(bearer(request), query.cursor, query.limit),
      ),
    );
  });
  app.delete('/data', parseRequestBody(), async (request) =>
    request.json(
      dataDeletionResponseSchema.parse(
        await deletion.delete(
          bearer(request),
          parse(dataDeletionRequestSchema, requestBody(request)).expectedEpoch,
        ),
      ),
    ),
  );
}
