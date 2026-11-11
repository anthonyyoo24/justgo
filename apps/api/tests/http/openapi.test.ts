import { apiRequest } from '../request.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
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

type Parameter = { name: string; in: string };
type Operation = {
  parameters?: Parameter[];
  responses: Record<string, { content?: unknown }>;
};
type PathItem = { parameters?: Parameter[] } & Partial<
  Record<(typeof documentedMethods)[number], Operation>
>;
const documentedMethods = ['get', 'post', 'patch', 'put', 'delete'] as const;
const typedCode = z.object({
  'application/json': z.object({
    schema: z.object({
      properties: z.object({ code: z.object({ const: z.string() }) }),
    }),
  }),
});

const id = '00000000-0000-4000-8000-000000000001';
const restoredCompletion = {
  id,
  challengeId: 'challenge',
  venue: 'streets',
  levelId: 'level-1',
  instruction: 'Historical instruction',
  startedAt: '2026-09-18T23:55:00.000Z',
  startTimeZone: 'America/Toronto',
  displayTimeZone: 'America/Toronto',
  activityDate: '2026-09-18',
};
const validInput: Record<string, { query?: string; payload?: unknown }> = {
  'get /v1/attempts': { query: 'date=2026-10-01' },
  'post /v1/attempts': {
    payload: {
      id,
      challengeId: 'st-01',
      venue: 'streets',
      startedAt: '2026-10-01T12:00:00Z',
      startTimeZone: 'UTC',
    },
  },
  'post /v1/completion-restores': {
    payload: { expectedEpoch: 0, attempts: [restoredCompletion] },
  },
  'post /v1/journal-sync': {
    payload: {
      expectedEpoch: 0,
      versions: [
        {
          versionId: id,
          attemptId: id,
          parents: [],
          feelingScaleVersion: 1,
          reflection: { feeling: null, text: 'Saved writing', revision: 1 },
        },
      ],
    },
  },
  'delete /v1/data': { payload: { expectedEpoch: 0 } },
  'get /v1/progress/summary': { query: 'timeZone=UTC' },
  'get /v1/progress/calendar': { query: 'month=2026-10' },
};

type Probe = {
  status: string;
  rateLimit: 'open' | 'down';
  request: (
    key: string,
    method: string,
    path: string,
    parameters: Parameter[],
  ) => { url: string; contentType?: string; payload?: string } | undefined;
};
const fill = (path: string, value: string) => path.replace(/\{[^}]+\}/g, value);
const probes: Record<string, Probe> = {
  'invalid input': {
    status: '400',
    rateLimit: 'open',
    request: (_key, method, path, parameters) => {
      const query = parameters
        .filter((parameter) => parameter.in === 'query')
        .map((parameter) => `${parameter.name}=not-valid`)
        .join('&');
      return {
        url: `${fill(path, 'not-valid')}${query ? `?${query}` : ''}`,
        ...(method === 'get'
          ? {}
          : { contentType: 'application/json', payload: '[]' }),
      };
    },
  },
  'oversized body': {
    status: '413',
    rateLimit: 'open',
    request: (_key, method, path) =>
      method === 'get'
        ? undefined
        : {
            url: fill(path, id),
            contentType: 'application/json',
            payload: 'x'.repeat(4 * 1024 * 1024 + 1),
          },
  },
  'unsupported media type': {
    status: '415',
    rateLimit: 'open',
    request: (_key, method, path) =>
      method === 'get'
        ? undefined
        : {
            url: fill(path, id),
            contentType: 'application/xml',
            payload: '<request/>',
          },
  },
  'every dependency down': {
    status: '503',
    rateLimit: 'down',
    request: (key, _method, path) => {
      const input = validInput[key];
      return {
        url: `${fill(path, id)}${input?.query ? `?${input.query}` : ''}`,
        ...(input?.payload === undefined
          ? {}
          : {
              contentType: 'application/json',
              payload: JSON.stringify(input.payload),
            }),
      };
    },
  },
};

function probeApp(
  legacyIdentityEnabled: boolean,
  rateLimit: Probe['rateLimit'],
) {
  const database = drizzle.mock();
  vi.spyOn(database, 'transaction').mockRejectedValue(
    new Error('database offline'),
  );
  const offline = () => Promise.reject(new Error('provider offline'));
  const identity = new IdentityService(database, {
    rateKey: 'status-contract',
    managedAuthVerifier: offline,
  });
  if (rateLimit === 'open') vi.spyOn(identity, 'rateLimit').mockResolvedValue();
  return buildApp({
    logger: false,
    identity,
    checkDatabase: async () => {},
    legacyIdentityEnabled,
    guestAccessReader: offline,
    entitlementReader: offline,
    uploadEligibilityReader: offline,
  });
}

describe.each([true, false])(
  'documented statuses with legacy identity enabled=%s',
  (legacyIdentityEnabled) => {
    const paths: Record<string, PathItem> = (
      legacyIdentityEnabled ? openApiDocument : managedOpenApiDocument
    ).paths;
    const operations = Object.entries(paths).flatMap(([path, item]) =>
      documentedMethods.flatMap((method) => {
        const operation = item[method];
        return operation
          ? [
              {
                key: `${method} ${path}`,
                method,
                path,
                operation,
                parameters: [
                  ...(item.parameters ?? []),
                  ...(operation.parameters ?? []),
                ],
              },
            ]
          : [];
      }),
    );

    it.each(Object.entries(probes))(
      'returns the documented status and code for %s',
      async (_name, probe) => {
        const mismatches: string[] = [];
        let exercised = 0;
        for (const { key, method, path, operation, parameters } of operations) {
          const request = probe.request(key, method, path, parameters);
          if (!request) continue;
          const response = await apiRequest(
            probeApp(legacyIdentityEnabled, probe.rateLimit),
            {
              method: method.toUpperCase(),
              url: request.url,
              headers: {
                authorization: `Bearer ${'a'.repeat(64)}`,
                'content-type': request.contentType,
              },
              payload: request.payload,
            },
          );
          const status = String(response.statusCode);
          const documented = operation.responses[status];
          if (operation.responses[probe.status]) exercised++;
          if (operation.responses[probe.status] && status !== probe.status)
            mismatches.push(
              `${key} documents ${probe.status} but returned ${status}`,
            );
          else if (!documented)
            mismatches.push(`${key} returned undocumented ${status}`);
          else {
            const code = typedCode.safeParse(documented.content);
            if (
              code.success &&
              response.json().code !==
                code.data['application/json'].schema.properties.code.const
            )
              mismatches.push(
                `${key} returned ${status} with undocumented code ${String(response.json().code)}`,
              );
          }
        }
        expect(mismatches).toEqual([]);
        expect(exercised).toBeGreaterThan(0);
      },
    );
  },
);
