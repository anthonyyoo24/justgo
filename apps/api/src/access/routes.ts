import type { FastifyInstance } from 'fastify';
import { ApiError } from '../http/api-error.js';
import { bearer } from '../http/bearer.js';
import type { AccessService } from './service.js';

export function accessRoutes(app: FastifyInstance, service?: AccessService) {
  app.get('/access', async (request) => {
    if (!service) throw new ApiError('UNAVAILABLE', 503);
    return service.get(bearer(request));
  });
}
