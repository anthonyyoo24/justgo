import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/build-app.js';
import { ApiError } from '../../src/http/api-error.js';
import { loggerOptions } from '../../src/http/diagnostics.js';

const privateValue = 'private-server-error-fixture';

function setup(
  checkDatabase: () => Promise<void> = async () => {},
  level: 'error' | 'info' = 'error',
) {
  let output = '';
  const app = buildApp({
    checkDatabase,
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
  const { level, time, pid, hostname, ...fields } = failure;
  expect(level).toBe(50);
  expect(time).toEqual(expect.any(Number));
  expect(pid).toEqual(expect.any(Number));
  expect(hostname).toEqual(expect.any(String));
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
      const { app, records, output } = setup(undefined, 'info');
      // Nested routes inherit the app-wide response boundary too.
      app.register(async (scope) => {
        scope.post(path, async (_request, reply) => {
          if (kind === 'direct')
            return reply.code(status).send({ detail: privateValue });
          if (kind === 'typed') throw new ApiError('UNAVAILABLE', 503);
          throw new Error(privateValue, {
            cause: {
              code: kind === 'database' ? '08006' : privateValue,
              query: privateValue,
              ownerId: privateValue,
            },
          });
        });
      });
      try {
        const response = await app.inject({
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
      } finally {
        await app.close();
      }
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
    app.addHook('onSend', async (request, _reply, payload) => {
      if (request.routeOptions.url === '/v1/database') {
        markDatabaseWaiting();
        await databaseRelease;
      }
      return payload;
    });
    app.get('/v1/database', async () => {
      throw new Error(privateValue, { cause: { code: '08006' } });
    });
    app.get('/v1/direct', async (_request, reply) => reply.code(502).send());
    const pendingDatabase = app.inject('/v1/database');
    try {
      await databaseWaiting;
      const direct = await app.inject('/v1/direct');
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
      await app.close();
    }
  });

  it('reports readiness failures at error level and leaves readiness responses unchanged', async () => {
    let available = true;
    const { app, records, output } = setup(async () => {
      if (!available) throw new Error(privateValue);
    }, 'info');
    try {
      expect((await app.inject('/ready')).json()).toEqual({ status: 'ready' });
      expect(records().filter((record) => Number(record.level) >= 40)).toEqual(
        [],
      );
      available = false;
      const unavailable = await app.inject({
        url: `/ready?token=${privateValue}`,
        headers: { 'x-request-id': privateValue },
      });
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.json()).toEqual({ status: 'unavailable' });
      expect(unavailable.headers['cache-control']).toBe('no-store');
      expectServerError(records(), 503, unavailable.headers['x-request-id']);
      available = true;
      expect((await app.inject('/ready')).json()).toEqual({ status: 'ready' });
      expectServerError(records(), 503, unavailable.headers['x-request-id']);
      expect(output()).not.toContain(privateValue);
    } finally {
      await app.close();
    }
  });

  it.each([200, 204, 400, 401, 404, 409, 429, 499])(
    'does not report a successful or client-error %s response as a server failure',
    async (status) => {
      const { app, records } = setup();
      app.get('/response', async (_request, reply) =>
        reply.code(status).send(),
      );
      try {
        expect((await app.inject('/response')).statusCode).toBe(status);
        expect(records()).toEqual([]);
      } finally {
        await app.close();
      }
    },
  );
});
