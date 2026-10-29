import type { ApiContext } from '../../src/http/request.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpApp } from '../../src/http/app.js';
import {
  parseRequestBody,
  requestBody,
  requestQuery,
} from '../../src/http/request.js';
import { apiRequest } from '../request.js';

function app() {
  const server = createHttpApp({ logger: false });
  server.post('/v1/body', parseRequestBody(16), (context) =>
    context.json({ body: requestBody(context) ?? null }),
  );
  server.get('/v1/query', (context) => context.json(requestQuery(context)));
  return server;
}
function streamed(
  body: ReadableStream<Uint8Array>,
  headers: HeadersInit = { 'content-type': 'application/json' },
) {
  return new Request('http://localhost/v1/body', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit);
}
afterEach(() => vi.useRealTimers());
describe('bounded Fetch request parsing', () => {
  it('counts actual streamed UTF-8 bytes even without a length or with a forged small length', async () => {
    for (const length of [undefined, '1']) {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('"éééééééé"'));
        },
        cancel,
      });
      const response = await app().request(
        streamed(body, {
          'content-type': 'application/json',
          ...(length ? { 'content-length': length } : {}),
        }),
      );
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({
        code: 'REQUEST_TOO_LARGE',
      });
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it('accepts an exact bound and text, and rejects malformed JSON and an oversized declared length', async () => {
    const server = app();
    expect(
      (
        await apiRequest(server, {
          method: 'POST',
          url: '/v1/body',
          payload: { x: '12345678' },
        })
      ).json(),
    ).toEqual({ body: { x: '12345678' } });
    expect(
      (
        await apiRequest(server, {
          method: 'POST',
          url: '/v1/body',
          payload: 'text',
          headers: { 'content-type': 'text/plain' },
        })
      ).json(),
    ).toEqual({ body: 'text' });
    expect(
      (
        await apiRequest(server, {
          method: 'POST',
          url: '/v1/body',
          payload: '{',
          headers: { 'content-type': 'application/json' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await apiRequest(server, {
          method: 'POST',
          url: '/v1/body',
          payload: '{}',
          headers: {
            'content-type': 'application/json',
            'content-length': '17',
          },
        })
      ).statusCode,
    ).toBe(413);
    expect(
      (await apiRequest(server, { method: 'POST', url: '/v1/body' })).json(),
    ).toEqual({ body: null });
  });
  it.each([
    '{"__proto__":{"admin":true}}',
    '{"constructor":{"prototype":{}}}',
    '',
  ])(
    'rejects prototype-poisoning and empty JSON before route handling',
    async (payload) => {
      const server = createHttpApp({ logger: false });
      const handler = vi.fn((context: ApiContext) =>
        context.json({ ok: true }),
      );
      server.post('/v1/body', parseRequestBody(), handler);
      expect(
        (
          await apiRequest(server, {
            method: 'POST',
            url: '/v1/body',
            payload,
            headers: { 'content-type': 'application/json' },
          })
        ).statusCode,
      ).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    },
  );
  it('cancels a stalled read after the existing ten-second request limit', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const response = app().request(streamed(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(10000);
    const result = await response;
    expect(result.status).toBe(408);
    expect(await result.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves strict CORS preflights and the empty-body content length', async () => {
    const server = createHttpApp({
      logger: false,
      origins: ['https://app.example'],
    });
    const invalid = await apiRequest(server, {
      method: 'OPTIONS',
      url: '/v1/body',
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).toBe('Invalid Preflight Request');
    const valid = await apiRequest(server, {
      method: 'OPTIONS',
      url: '/v1/body',
      headers: {
        origin: 'https://app.example',
        'access-control-request-method': 'POST',
      },
    });
    expect(valid.statusCode).toBe(204);
    expect(valid.headers['content-length']).toBe('0');
    expect(valid.headers['access-control-allow-origin']).toBe(
      'https://app.example',
    );
  });
  it('preserves duplicate query values so strict schemas cannot silently accept the last value', async () => {
    expect(
      (await apiRequest(app(), '/v1/query?month=a&month=b&cursor=c')).json(),
    ).toEqual({ month: ['a', 'b'], cursor: 'c' });
  });
  it('applies security headers on both successes and errors without trusting an incoming request ID', async () => {
    const server = app();
    for (const path of ['/v1/query', '/v1/missing']) {
      const response = await apiRequest(server, {
        url: path,
        headers: { 'x-request-id': 'untrusted' },
      });
      expect(response.headers).toMatchObject({
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'referrer-policy': 'no-referrer',
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
      });
      expect(response.headers['x-request-id']).not.toBe('untrusted');
      expect(response.headers['content-security-policy']).toContain(
        "object-src 'none'",
      );
    }
  });
});
