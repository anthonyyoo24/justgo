import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  healthResponseSchema,
  readinessResponseSchema,
} from '@justgo/contracts';
import { loggerOptions } from './diagnostics.js';

export function buildApp(
  options: {
    checkDatabase: () => Promise<void>;
    origins?: string[];
    logger?: FastifyServerOptions['logger'];
  },
  createServer: typeof Fastify = Fastify,
) {
  const app = createServer({
    logger: options.logger ?? loggerOptions(),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    bodyLimit: 32 * 1024,
    requestTimeout: 10000,
    connectionTimeout: 10000,
  });
  app.register(helmet);
  app.register(cors, {
    origin: options.origins ?? [],
    methods: ['GET'],
    credentials: false,
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
  });
  app.get('/health', async () =>
    healthResponseSchema.parse({ status: 'ok', service: 'justgo-api' }),
  );
  app.get('/ready', async (request, reply) => {
    try {
      await options.checkDatabase();
      return readinessResponseSchema.parse({ status: 'ready' });
    } catch {
      request.log.warn(
        { event: 'database_unavailable' },
        'Readiness check failed',
      );
      return reply
        .code(503)
        .send(readinessResponseSchema.parse({ status: 'unavailable' }));
    }
  });
  app.setErrorHandler<{ statusCode?: number }>((error, request, reply) => {
    request.log.error({ err: error }, 'Request failed');
    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    void reply.code(statusCode).send({
      error: statusCode < 500 ? 'Invalid request' : 'Internal server error',
      requestId: request.id,
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: 'Not found', requestId: request.id }),
  );
  return app;
}
