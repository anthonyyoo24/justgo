import { apiRequest } from '../request.js';
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
    const database = drizzle.mock();
    const transaction = vi.spyOn(database, 'transaction');
    const app = buildApp({
      logger: false,
      identity: new IdentityService(database, { rateKey: 'route-contract' }),
      checkDatabase: async () => {},
      legacyIdentityEnabled,
    });

    const registered = new Set(
      app.routes
        .filter(
          (route) =>
            route.path.startsWith('/v1/') &&
            !['ALL', 'HEAD', 'OPTIONS'].includes(route.method),
        )
        .map(
          (route) =>
            `${route.method.toLowerCase()} ${route.path.replace(/:([^/]+)/g, '{$1}').replace(/\/$/, '')}`,
        ),
    );
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
    expect((await apiRequest(app, '/openapi.json')).json()).toEqual(document);
    const documented = Object.entries(document.paths).flatMap(([url, path]) =>
      Object.keys(path)
        .filter((method) => methods.has(method))
        .map((method) => `${method} ${url}`),
    );
    expect([...registered].sort()).toEqual(documented.sort());
    expect(transaction).not.toHaveBeenCalled();
  },
);
