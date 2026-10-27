import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/build-app.js';

describe('API response reporting boundary', () => {
  it('awaits the sanitized reporter before sending a 5xx response', async () => {
    let started = () => {};
    let finish = () => {};
    const reportingStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const reportingFinished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const reporter = vi.fn(async () => {
      started();
      await reportingFinished;
    });
    const app = buildApp({
      checkDatabase: async () => {},
      logger: false,
      reportServerError: reporter,
    });
    app.get('/v1/private-error', async () => {
      throw new Error('private content', { cause: { code: '08006' } });
    });
    let completed = false;
    const pending = app.inject('/v1/private-error').then((response) => {
      completed = true;
      return response;
    });
    try {
      await reportingStarted;
      expect(completed).toBe(false);
      expect(reporter).toHaveBeenCalledExactlyOnceWith({
        requestId: expect.stringMatching(/^[a-f0-9-]{36}$/),
        statusCode: 503,
        sqlState: '08006',
      });
      finish();
      const response = await pending;
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        code: 'UNAVAILABLE',
        requestId: response.headers['x-request-id'],
      });
    } finally {
      finish();
      await pending;
      await app.close();
    }
  });

  it('preserves responses when reporting fails and ignores success/client errors', async () => {
    const reporter = vi.fn(async () => {
      throw new Error('private transport error');
    });
    const app = buildApp({
      checkDatabase: async () => {},
      logger: false,
      reportServerError: reporter,
    });
    app.get('/failure', async (_request, reply) =>
      reply.code(502).send({ error: 'failed' }),
    );
    try {
      expect((await app.inject('/health')).statusCode).toBe(200);
      expect((await app.inject('/missing')).statusCode).toBe(404);
      expect(reporter).not.toHaveBeenCalled();
      const response = await app.inject('/failure');
      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ error: 'failed' });
      expect(reporter).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });
});
