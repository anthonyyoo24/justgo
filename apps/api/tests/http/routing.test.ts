import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/build-app.js';
import { IdentityService } from '../../src/identity/service.js';
import { apiRequest } from '../request.js';

function setup(onVercel = false) {
  const identity = new IdentityService(drizzle.mock(), {
    rateKey: 'routing-fixture',
  });
  const rate = vi.spyOn(identity, 'rateLimit').mockResolvedValue();
  const app = buildApp({
    logger: false,
    checkDatabase: async () => {},
    identity,
    onVercel,
  });
  return { app, rate };
}

describe('HTTP router compatibility', () => {
  it('retains strict static routes and both forms of prefixed root resources', async () => {
    const { app } = setup();
    for (const path of [
      '/health/',
      '/ready/',
      '/v1/auth/session/',
      '/v1/access/',
    ])
      expect((await apiRequest(app, path)).statusCode).toBe(404);
    for (const path of [
      '/v1/challenges',
      '/v1/challenges/',
      '/v1/attempts?date=2026-10-28',
      '/v1/attempts/?date=2026-10-28',
    ])
      expect((await apiRequest(app, path)).statusCode).toBe(401);
    expect((await apiRequest(app, '/health')).statusCode).toBe(200);
  });
  it('serves automatic HEAD routes with the GET status and headers but no response body', async () => {
    const { app } = setup();
    for (const [url, status] of [
      ['/health', 200],
      ['/v1/challenges', 401],
      ['/missing', 404],
    ] as const) {
      const result = await apiRequest(app, { url, method: 'HEAD' });
      expect(result.statusCode).toBe(status);
      expect(result.body).toBe('');
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    }
  });
  it('rejects malformed URL encoding through the safe client-error boundary', async () => {
    const { app, rate } = setup();
    for (const url of ['/v1/sessions/%', '/v1/attempts/%E0%A4']) {
      const response = await apiRequest(app, {
        method: 'PATCH',
        url,
        payload: 'unread-private-data',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: 'INVALID_REQUEST',
        requestId: response.headers['x-request-id'],
      });
      expect(response.body).not.toContain('unread-private-data');
    }
    expect(rate).not.toHaveBeenCalled();
  });
  it('keeps identity budgets route-local and trusts only the selected adapter address', async () => {
    const { app, rate } = setup();
    await apiRequest(app, {
      url: '/v1/sessions/current',
      remoteAddress: '127.1.1.1',
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'cf-connecting-ip': '203.0.113.2',
        'x-vercel-forwarded-for': '203.0.113.3',
      },
    });
    expect(rate).toHaveBeenCalledExactlyOnceWith('127.1.1.1', 'identity', 120);
    rate.mockClear();
    await apiRequest(app, '/v1/challenges');
    expect(rate).not.toHaveBeenCalled();
    await apiRequest(app, '/v1/auth/session');
    expect(rate).toHaveBeenCalledExactlyOnceWith(
      '127.0.0.1',
      'managed-auth',
      120,
    );
    const vercel = setup(true);
    await apiRequest(vercel.app, {
      url: '/v1/sessions/current',
      remoteAddress: '127.1.1.1',
      headers: { 'x-vercel-forwarded-for': '203.0.113.3' },
    });
    expect(vercel.rate).toHaveBeenCalledExactlyOnceWith(
      '203.0.113.3',
      'identity',
      120,
    );
  });
});
