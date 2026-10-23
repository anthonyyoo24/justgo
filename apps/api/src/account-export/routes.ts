import type { FastifyInstance } from 'fastify';
import {
  exportPageQuerySchema,
  completionExportPageSchema,
} from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import { parse } from '../http/parse.js';
import type { ExportService } from './service.js';

export function accountExportRoutes(
  app: FastifyInstance,
  service: ExportService,
) {
  app.get('/export', async (request) => {
    const token = bearer(request);
    const query = parse(exportPageQuerySchema, request.query);
    return completionExportPageSchema.parse(
      await service.page(token, query.cursor),
    );
  });
}
