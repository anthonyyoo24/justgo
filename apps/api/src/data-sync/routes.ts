import type { FastifyInstance } from 'fastify';
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
export function dataSyncRoutes(
  app: FastifyInstance,
  identity: IdentityService,
) {
  const completions = new CompletionRestoreService(identity),
    journal = new JournalSyncService(identity),
    deletion = new DeleteDataService(identity);
  // 50 records with 10,000-character historical instructions are bounded separately from ordinary API bodies.
  const batchOptions = { bodyLimit: 4 * 1024 * 1024 };
  app.post('/completion-restores', batchOptions, async (request) =>
    completionRestoreResponseSchema.parse(
      await completions.restore(
        bearer(request),
        parse(completionRestoreRequestSchema, request.body),
      ),
    ),
  );
  app.get('/completion-restores', async (request) => {
    const query = parse(syncPageQuerySchema, request.query);
    return completionRestorePageSchema.parse(
      await completions.page(bearer(request), query.cursor, query.limit),
    );
  });
  app.post('/journal-sync', batchOptions, async (request) =>
    journalSyncResponseSchema.parse(
      await journal.save(
        bearer(request),
        parse(journalSyncRequestSchema, request.body),
      ),
    ),
  );
  app.get('/journal-sync', async (request) => {
    const query = parse(syncPageQuerySchema, request.query);
    return journalSyncPageSchema.parse(
      await journal.page(bearer(request), query.cursor, query.limit),
    );
  });
  app.delete('/data', async (request) =>
    dataDeletionResponseSchema.parse(
      await deletion.delete(
        bearer(request),
        parse(dataDeletionRequestSchema, request.body).expectedEpoch,
      ),
    ),
  );
}
