import type { FastifyInstance } from 'fastify';
import { exportPageQuerySchema, exportPageSchema } from '@justgo/contracts';
import { bearer } from '../identity/routes.js';
import { IdentityError } from '../identity/service.js';
import type { ExportService } from './service.js';

export function privacyRoutes(app: FastifyInstance, service: ExportService) {
  app.get('/export', async (request) => {
    const token = bearer(request);
    const query = exportPageQuerySchema.safeParse(request.query);
    if (!query.success) throw new IdentityError('INVALID_REQUEST', 400);
    return exportPageSchema.parse(await service.page(token, query.data.cursor));
  });
}
