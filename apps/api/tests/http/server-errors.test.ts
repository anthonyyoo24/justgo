import { Hono } from 'hono';
import type { StatusCode, ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiEnvironment } from '../../src/http/request.js';
import { apiRequest } from '../request.js';
import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/build-app.js';
import { ApiError } from '../../src/http/api-error.js';
import { loggerOptions } from '../../src/http/diagnostics.js';
import type { ServerErrorReporter } from '../../src/http/server-error-reporter.js';

const privateValue = 'private-server-error-fixture';

function setup(
  checkDatabase: () => Promise<void> = async () => {},
  level: 'error' | 'info' = 'error',
  reportServerError?: ServerErrorReporter,
) {
  let output = '';
  const app = buildApp({
    checkDatabase,
    ...(reportServerError ? { reportServerError } : {}),
    logger: {
      ...loggerOptions(level),
      stream: new Writable({
        write(chunk, _encoding, next) {
          output += chunk.toString();
          next();
        },
      }),
    },
  });
  return {
    app,
    output: () => output,
    records: () =>
      output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

function expectServerError(
  records: Record<string, unknown>[],
  statusCode: number,
  requestId: string | number | string[] | undefined,
  expectedSqlState?: string,
) {
  expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  const failures = records.filter((record) => Number(record.level) >= 40);
  expect(failures).toHaveLength(1);
  const failure = failures[0];
  if (!failure) throw new Error('Expected one server-error event');
  const { level, time, ...fields } = failure;
  expect(level).toBe(50);
  expect(time).toEqual(expect.any(Number));
  expect(fields).toEqual({
    reqId: requestId,
    statusCode,
    code: 'HTTP_SERVER_ERROR',
    msg: 'HTTP server failure',
    ...(expectedSqlState ? { sqlState: expectedSqlState } : {}),
  });
}

describe('sanitized server response diagnostics', () => {
  it.each([
    { kind: 'typed', path: '/v1/failure/:ownerId', status: 503 },
    { kind: 'database', path: '/v1/failure/:ownerId', status: 503 },
    { kind: 'database', path: '/failure/:ownerId', status: 500 },
    { kind: 'unexpected', path: '/v1/failure/:ownerId', status: 503 },
    { kind: 'unexpected', path: '/failure/:ownerId', status: 500 },
    { kind: 'direct', path: '/v1/failure/:ownerId', status: 502 },
    { kind: 'direct', path: '/failure/:ownerId', status: 599 },
  ])(
    'reports $kind $status responses once with no request or exception data',
    async ({ kind, path, status }) => {
      const reporter = vi.fn<ServerErrorReporter>().mockResolvedValue();
      const { app, records, output } = setup(undefined, 'info', reporter);
      // Nested routes inherit the app-wide response boundary too.
      const scope = new Hono<ApiEnvironment>();
      {
        scope.post(path, (context) => {
          if (kind === 'direct')
            return context.json(
              { detail: privateValue },
              status as ContentfulStatusCode,
            );
          if (kind === 'typed') throw new ApiError('UNAVAILABLE', 503);
          throw new Error(privateValue, {
            cause: {
              code: kind === 'database' ? '08006' : privateValue,
              query: privateValue,
              ownerId: privateValue,
            },
          });
        });
      }
      app.route('/', scope);

      const response = await apiRequest(app, {
        method: 'POST',
        url: `${path.replace(':ownerId', privateValue)}?token=${privateValue}`,
        headers: {
          authorization: `Bearer ${privateValue}`,
          cookie: privateValue,
          'x-request-id': privateValue,
        },
        payload: { reflection: privateValue, userId: privateValue },
      });
      expect(response.statusCode).toBe(status);
      expectServerError(
        records(),
        status,
        response.headers['x-request-id'],
        kind === 'database' ? '08006' : undefined,
      );
      expect(output()).not.toContain(privateValue);
      expect(reporter).toHaveBeenCalledExactlyOnceWith({
        statusCode: status,
        requestId: response.headers['x-request-id'],
        ...(kind === 'database' ? { sqlState: '08006' } : {}),
      });
      expect(JSON.stringify(reporter.mock.calls)).not.toContain(privateValue);
      if (kind !== 'direct')
        expect(response.json()).toEqual(
          path.startsWith('/v1/')
            ? {
                code: 'UNAVAILABLE',
                requestId: response.headers['x-request-id'],
              }
            : {
                error: 'Internal server error',
                requestId: response.headers['x-request-id'],
              },
        );
    },
  );

  it('keeps SQLSTATE attached to its own request while another failure completes', async () => {
    const { app, records, output } = setup(undefined, 'info');
    let markDatabaseWaiting = () => {};
    let releaseDatabase = () => {};
    const databaseWaiting = new Promise<void>((resolve) => {
      markDatabaseWaiting = resolve;
    });
    const databaseRelease = new Promise<void>((resolve) => {
      releaseDatabase = resolve;
    });
    app.use('/v1/database', async (_context, next) => {
      await next();
      {
        markDatabaseWaiting();
        await databaseRelease;
      }
    });
    app.get('/v1/database', async () => {
      throw new Error(privateValue, { cause: { code: '08006' } });
    });
    app.get('/v1/direct', (context) => context.body(null, 502));
    const pendingDatabase = apiRequest(app, '/v1/database');
    try {
      await databaseWaiting;
      const direct = await apiRequest(app, '/v1/direct');
      expectServerError(records(), 502, direct.headers['x-request-id']);
      releaseDatabase();
      const database = await pendingDatabase;
      expect(database.statusCode).toBe(503);
      const databaseRequestId = database.headers['x-request-id'];
      expect(databaseRequestId).not.toBe(direct.headers['x-request-id']);
      expectServerError(
        records().filter((record) => record.reqId === databaseRequestId),
        503,
        databaseRequestId,
        '08006',
      );
      expect(output()).not.toContain(privateValue);
    } finally {
      releaseDatabase();
      await pendingDatabase;
    }
  });

  it('reports readiness failures at error level and leaves readiness responses unchanged', async () => {
    let available = true;
    const reporter = vi.fn<ServerErrorReporter>().mockResolvedValue();
    const { app, records, output } = setup(
      async () => {
        if (!available) throw new Error(privateValue);
      },
      'info',
      reporter,
    );

    expect((await apiRequest(app, '/ready')).json()).toEqual({
      status: 'ready',
    });
    expect(records().filter((record) => Number(record.level) >= 40)).toEqual(
      [],
    );
    available = false;
    const unavailable = await apiRequest(app, {
      url: `/ready?token=${privateValue}`,
      headers: { 'x-request-id': privateValue },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ status: 'unavailable' });
    expect(unavailable.headers['cache-control']).toBe('no-store');
    expectServerError(records(), 503, unavailable.headers['x-request-id']);
    expect(reporter).toHaveBeenCalledExactlyOnceWith({
      statusCode: 503,
      requestId: unavailable.headers['x-request-id'],
    });
    available = true;
    expect((await apiRequest(app, '/ready')).json()).toEqual({
      status: 'ready',
    });
    expectServerError(records(), 503, unavailable.headers['x-request-id']);
    expect(output()).not.toContain(privateValue);
  });

  it.each([200, 204, 400, 401, 404, 409, 429, 499])(
    'does not report a successful or client-error %s response as a server failure',
    async (status) => {
      const reporter = vi.fn<ServerErrorReporter>().mockResolvedValue();
      const { app, records } = setup(undefined, 'error', reporter);
      app.get('/response', (context) =>
        context.body(null, status as StatusCode),
      );

      expect((await apiRequest(app, '/response')).statusCode).toBe(status);
      expect(records()).toEqual([]);
      expect(reporter).not.toHaveBeenCalled();
    },
  );
});
