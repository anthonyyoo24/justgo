import Fastify, { type FastifyServerOptions } from 'fastify';
import { drizzle } from 'drizzle-orm/node-postgres';
import { expect, it, vi } from 'vitest';
import {
  openApiDocument,
  managedOpenApiDocument,
} from '@justgo/contracts/openapi';
import { buildApp } from '../../src/build-app.js';
import { IdentityService } from '../../src/identity/service.js';

it.each([true, false])(
  'keeps documented methods equal to registered routes with legacy identity enabled=%s',
  async (legacyIdentityEnabled) => {
    const registered = new Set<string>();
    const createServer = ((options: FastifyServerOptions) => {
      const server = Fastify(options);
      server.addHook('onRoute', (route) => {
        if (!route.url.startsWith('/v1/')) return;
        const url = route.url.replace(/:([^/]+)/g, '{$1}').replace(/\/$/, '');
        for (const method of [route.method].flat())
          if (method !== 'HEAD' && method !== 'OPTIONS')
            registered.add(`${method.toLowerCase()} ${url}`);
      });
      return server;
    }) as typeof Fastify;
    const database = drizzle.mock();
    const transaction = vi.spyOn(database, 'transaction');
    const app = buildApp(
      {
        logger: false,
        identity: new IdentityService(database, { rateKey: 'route-contract' }),
        checkDatabase: async () => {},
        legacyIdentityEnabled,
      },
      createServer,
    );
    try {
      await app.ready();
      const methods = new Set([
        'get',
        'post',
        'patch',
        'put',
        'delete',
        'head',
        'options',
      ]);
      const document = legacyIdentityEnabled
        ? openApiDocument
        : managedOpenApiDocument;
      expect((await app.inject('/openapi.json')).json()).toEqual(document);
      const documented = Object.entries(document.paths).flatMap(([url, path]) =>
        Object.keys(path)
          .filter((method) => methods.has(method))
          .map((method) => `${method} ${url}`),
      );
      expect([...registered].sort()).toEqual(documented.sort());
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  },
);
