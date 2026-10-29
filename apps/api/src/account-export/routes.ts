import type { ApiApp } from '../http/request.js';
import { requestQuery } from '../http/request.js';
import {
  exportPageQuerySchema,
  completionExportPageSchema,
} from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import { parse } from '../http/parse.js';
import type { ExportService } from './service.js';
export function accountExportRoutes(app: ApiApp, service: ExportService) {
  app.get('/export', async (context) => {
    const token = bearer(context);
    const query = parse(exportPageQuerySchema, requestQuery(context));
    return context.json(
      completionExportPageSchema.parse(await service.page(token, query.cursor)),
    );
  });
}
