import type { FastifyInstance } from 'fastify';
import {
  accountAcceptanceResponseSchema,
  currentAcceptanceVersionsSchema,
} from '@justgo/contracts';
import { bearer } from '../http/bearer.js';
import { parse } from '../http/parse.js';
import type { AcceptanceService } from './service.js';

export function acceptanceRoutes(
  app: FastifyInstance,
  service: AcceptanceService,
) {
  app.get('/acceptance', async (request) =>
    accountAcceptanceResponseSchema.parse(await service.get(bearer(request))),
  );
  app.put('/acceptance', async (request) => {
    const token = bearer(request);
    const versions = parse(currentAcceptanceVersionsSchema, request.body);
    return accountAcceptanceResponseSchema.parse(
      await service.accept(token, versions),
    );
  });
}
