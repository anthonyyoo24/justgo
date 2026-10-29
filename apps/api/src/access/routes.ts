import type { ApiApp } from '../http/request.js';
import { ApiError } from '../http/api-error.js';
import { bearer } from '../http/bearer.js';
import type { AccessService } from './service.js';
export function accessRoutes(app: ApiApp, service?: AccessService) {
  app.get('/access', async (context) => {
    if (!service) throw new ApiError('UNAVAILABLE', 503);
    return context.json(await service.get(bearer(context)));
  });
}
