import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { ApiEnvironment } from '../../src/http/request.js';
import {
  fixturePathPrefix,
  underPathPrefix,
} from '../../scripts/fixture-path-prefix.js';

const prefix = '/functions/v1/api';
const bindings = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };

function echoApp() {
  const app = new Hono<ApiEnvironment>();
  app.all('*', async (context) => {
    const url = new URL(context.req.url);
    return context.json({
      method: context.req.method,
      path: url.pathname,
      search: url.search,
      body: await context.req.text(),
      remoteAddress: context.env.incoming?.socket.remoteAddress ?? null,
    });
  });
  return app;
}

describe('fixture API path prefix', () => {
  it.each([undefined, ''])('serves at the root for %j', (value) => {
    expect(fixturePathPrefix(value)).toBe('');
  });

  it.each([prefix, '/api', '/edge_functions/v1/api-2'])(
    'accepts %s',
    (value) => {
      expect(fixturePathPrefix(value)).toBe(value);
    },
  );

  it.each([
    '/',
    'functions/v1/api',
    '/functions/v1/api/',
    '/functions//api',
    '/functions/../api',
    '/functions/./api',
    '/functions/%2e%2e/api',
    '/functions/*',
    '/functions/:name',
    '/functions/v1/api?next=/v1/',
    '/functions/v1/api#v1',
    '/functions\\v1',
    ' /functions/v1/api',
    'http://127.0.0.1:3000/functions/v1/api',
  ])('rejects %j', (value) => {
    expect(() => fixturePathPrefix(value)).toThrow(/fixtures require/i);
  });

  it('serves the same app at the root when no prefix is set', () => {
    const app = echoApp();
    expect(underPathPrefix(app, '')).toBe(app);
  });

  it('strips the prefix once and keeps the query, body and bindings', async () => {
    const served = underPathPrefix(echoApp(), prefix);
    const response = await served.request(
      `${prefix}/v1/progress?month=2026-11&next=${prefix}/v1/`,
      { method: 'POST', body: 'synthetic-body' },
      bindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: 'POST',
      path: '/v1/progress',
      search: `?month=2026-11&next=${prefix}/v1/`,
      body: 'synthetic-body',
      remoteAddress: '127.0.0.1',
    });
  });

  it('strips a repeated prefix only once', async () => {
    const served = underPathPrefix(echoApp(), prefix);
    const response = await served.request(
      `${prefix}${prefix}/v1/sessions`,
      undefined,
      bindings,
    );
    await expect(response.json()).resolves.toMatchObject({
      path: `${prefix}/v1/sessions`,
    });
  });

  it.each([
    '/v1/sessions',
    '/ready',
    '/__fixtures/accounts',
    '/functions/v1/other/v1/sessions',
    '/functions/v1/apix/v1/sessions',
  ])('answers 404 for %s outside the prefix', async (path) => {
    const served = underPathPrefix(echoApp(), prefix);
    const response = await served.request(path, undefined, bindings);
    expect(response.status).toBe(404);
  });
});
