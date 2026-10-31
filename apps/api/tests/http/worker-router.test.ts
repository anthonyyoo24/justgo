import type { MiddlewareHandler } from 'hono';
import { TrieRouter } from 'hono/router/trie-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/build-app.js';
import { createHttpApp, type HttpOptions } from '../../src/http/app.js';
import type { ApiEnvironment } from '../../src/http/request.js';
import type { ServerErrorReporter } from '../../src/http/server-error-reporter.js';
import { WorkerRouter } from '../../src/http/worker-router.js';
import { createWorker } from '../../src/worker.js';
import { apiRequest } from '../request.js';

const wildcardPaths = ['/*', '/./*', '/../*', '/%2e%2e/*', '/%2A'];
const controls = [
  '/health',
  '/ready',
  '/missing',
  '/v1/missing',
  '/foo/*',
  '/v1/sessions/%',
];
type LogRecord = { msg?: string; reqId?: string };

function setup(
  factory: (options: HttpOptions) => ReturnType<typeof createHttpApp>,
  router?: HttpOptions['router'],
) {
  const records: LogRecord[] = [];
  const clientAddress = vi.fn(() => '127.0.0.1');
  const reportServerError = vi.fn<ServerErrorReporter>().mockResolvedValue();
  const options: HttpOptions = {
    ...(router ? { router } : {}),
    origins: ['https://app.invalid'],
    clientAddress,
    reportServerError,
    logger: {
      stream: {
        write: (line) => records.push(JSON.parse(line) as LogRecord),
      },
    },
  };
  return { app: factory(options), records, clientAddress, reportServerError };
}

function comparable(response: Awaited<ReturnType<typeof apiRequest>>) {
  const { 'x-request-id': requestId, ...headers } = response.headers;
  return {
    statusCode: response.statusCode,
    headers,
    body: requestId
      ? response.body.replaceAll(requestId, '<request-id>')
      : response.body,
  };
}

function expectOneRequest(records: LogRecord[], requestId: string | undefined) {
  expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    records.filter((record) => record.msg === 'incoming request'),
  ).toHaveLength(1);
  expect(
    records.filter((record) => record.msg === 'request completed'),
  ).toHaveLength(1);
  expect(new Set(records.map((record) => record.reqId))).toEqual(
    new Set([requestId]),
  );
}

describe('Worker router registrations', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves match order, parameters and independently repeated payloads', () => {
    const router = new WorkerRouter<string>();
    router.add('ALL', '*', 'shared');
    router.add('ALL', '*', 'shared');
    router.add('GET', '/v1/:ownerId/*', 'scope');
    router.add('POST', '/v1/:ownerId/:resource', 'other method');
    router.add('GET', '/v1/:ownerId/:resource', 'leaf');

    expect(router.match('GET', '/v1/alice/*')).toEqual([
      [
        ['shared', {}],
        ['shared', {}],
        ['scope', { ownerId: 'alice' }],
        ['leaf', { ownerId: 'alice', resource: '*' }],
      ],
    ]);
    expect(router.match('GET', '/*')).toEqual([
      [
        ['shared', {}],
        ['shared', {}],
      ],
    ]);
  });

  it('preserves indexed parameter maps and their stash through the public router contract', () => {
    const add = vi.spyOn(TrieRouter.prototype, 'add');
    const router = new WorkerRouter<string>();
    router.add('GET', '/:ownerId', 'leaf');
    const registration = add.mock.calls[0]?.[2];
    expect(add).toHaveBeenCalledOnce();
    vi.spyOn(TrieRouter.prototype, 'match').mockReturnValueOnce([
      [
        [registration, { ownerId: 0 }],
        [registration, { ownerId: 0 }],
      ],
      ['alice'],
    ]);
    expect(router.match('GET', '/alice')).toEqual([
      [['leaf', { ownerId: 0 }]],
      ['alice'],
    ]);
  });

  it('runs intentionally repeated middleware twice with normal nesting and decoded route parameters', async () => {
    const app = createHttpApp({ router: new WorkerRouter(), logger: false });
    const order: string[] = [];
    const repeated: MiddlewareHandler<ApiEnvironment> = async (
      _context,
      next,
    ) => {
      order.push('before');
      await next();
      order.push('after');
    };
    app.use('*', repeated);
    app.use('*', repeated);
    app.get('/owner/:ownerId', (context) => {
      order.push('route');
      return context.json({ ownerId: context.req.param('ownerId') });
    });

    expect((await apiRequest(app, '/*')).statusCode).toBe(404);
    expect(order).toEqual(['before', 'before', 'after', 'after']);
    order.length = 0;
    const response = await apiRequest(app, '/owner/%61lice');
    expect(response.json()).toEqual({ ownerId: 'alice' });
    expect(order).toEqual(['before', 'before', 'route', 'after', 'after']);
  });
});

describe.each([
  ['HTTP boundary', (options: HttpOptions) => createHttpApp(options)],
  [
    'composed app',
    (options: HttpOptions) =>
      buildApp({ ...options, checkDatabase: async () => {} }),
  ],
] as const)('%s router compatibility', (_name, factory) => {
  it.each([...wildcardPaths, ...controls])(
    'preserves responses and runs the real middleware once for %s',
    async (url) => {
      for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS']) {
        const normal = setup(factory);
        const worker = setup(factory, new WorkerRouter());
        const request = {
          url,
          method,
          headers: {
            origin: 'https://app.invalid',
            'access-control-request-method': 'POST',
          },
        };
        const baseline = await apiRequest(normal.app, request);
        const response = await apiRequest(worker.app, request);
        expect(comparable(response)).toEqual(comparable(baseline));
        for (const [fixture, result] of [
          [normal, baseline],
          [worker, response],
        ] as const) {
          expectOneRequest(fixture.records, result.headers['x-request-id']);
          expect(fixture.clientAddress).toHaveBeenCalledOnce();
          expect(fixture.reportServerError).not.toHaveBeenCalled();
        }
      }
    },
  );
});

describe('Worker router server failures', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(wildcardPaths)(
    'reports an HTTP failure once for %s',
    async (path) => {
      const fixture = setup(createHttpApp, new WorkerRouter());
      fixture.app.all('*', (context) =>
        context.json(
          {
            error: 'Internal server error',
            requestId: context.get('diagnostic').id,
          },
          500,
        ),
      );
      const response = await apiRequest(fixture.app, path);
      const requestId = response.headers['x-request-id'];
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'Internal server error',
        requestId,
      });
      expectOneRequest(fixture.records, requestId);
      expect(
        fixture.records.filter(
          (record) => record.msg === 'HTTP server failure',
        ),
      ).toHaveLength(1);
      expect(fixture.reportServerError).toHaveBeenCalledExactlyOnceWith({
        statusCode: 500,
        requestId,
      });
    },
  );

  it.each([...wildcardPaths, '/health', '/ready'])(
    'uses the same single-request boundary after Worker startup fails for %s',
    async (path) => {
      const records: LogRecord[] = [];
      const capture = (line: string) => {
        records.push(JSON.parse(line) as LogRecord);
      };
      vi.spyOn(console, 'info').mockImplementation(capture);
      vi.spyOn(console, 'error').mockImplementation(capture);
      const createDatabase = vi.fn(() => {
        throw new Error('Database adapter must not run');
      });
      const buildApp = vi.fn(() => {
        throw new Error('App composition must not run');
      });
      const worker = createWorker({
        readConfiguration: () => {
          throw new Error('Synthetic startup failure');
        },
        createDatabase,
        buildApp,
      });
      const waitUntil = vi.fn();
      const response = await worker.fetch(
        new Request('https://api.invalid' + path),
        {},
        { waitUntil },
      );
      const requestId = response.headers.get('x-request-id');
      expect(response.status).toBe(path === '/ready' ? 503 : 500);
      expect(response.headers.get('x-justgo-startup-stage')).toBe(
        'configuration',
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await response.json()).toEqual(
        path === '/ready'
          ? { status: 'unavailable' }
          : { error: 'Internal server error', requestId },
      );
      expectOneRequest(records, requestId ?? undefined);
      expect(
        records.filter((record) => record.msg === 'HTTP server failure'),
      ).toHaveLength(1);
      expect(createDatabase).not.toHaveBeenCalled();
      expect(buildApp).not.toHaveBeenCalled();
      expect(waitUntil).not.toHaveBeenCalled();
    },
  );
});
