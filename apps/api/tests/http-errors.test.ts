import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { identityErrorSchema } from '@justgo/contracts';
import { buildApp } from '../src/build-app.js';
import { IdentityError, IdentityService } from '../src/identity/service.js';

const authorization = `Bearer ${'a'.repeat(64)}`;
const privateValue = 'private-parser-fixture';
const completion = {
  id: '00000000-0000-4000-8000-000000000001',
  challengeId: 'st-01',
  venue: 'streets',
  startedAt: '2026-10-01T12:00:00Z',
  startTimeZone: 'UTC',
};

function setup() {
  const db = drizzle.mock();
  const transaction = vi
    .spyOn(db, 'transaction')
    .mockRejectedValue(new Error(privateValue));
  const app = buildApp({
    logger: false,
    checkDatabase: async () => {},
    identity: new IdentityService(db, { rateKey: 'http-error-test-key' }),
  });
  return { app, transaction };
}

describe('versioned API request errors', () => {
  it.each([
    {
      name: 'oversized JSON',
      contentType: 'application/json',
      payload: JSON.stringify({ venue: privateValue.repeat(2000) }),
      status: 413,
      code: 'REQUEST_TOO_LARGE',
    },
    {
      name: 'unsupported media type',
      contentType: 'application/xml',
      payload: `<venue>${privateValue}</venue>`,
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    },
    {
      name: 'malformed JSON',
      contentType: 'application/json',
      payload: `{"venue":"${privateValue}`,
      status: 400,
      code: 'INVALID_REQUEST',
    },
    {
      name: 'invalid request fields',
      contentType: 'application/json',
      payload: JSON.stringify({ venue: 'cafe', userId: privateValue }),
      status: 400,
      code: 'INVALID_REQUEST',
    },
  ])(
    'rejects $name before domain I/O with its safe typed status',
    async ({ contentType, payload, status, code }) => {
      const { app, transaction } = setup();
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/attempts',
          headers: {
            authorization,
            'content-type': contentType,
            'x-request-id': privateValue,
          },
          payload,
        });
        expect(response.statusCode).toBe(status);
        expect(identityErrorSchema.parse(response.json())).toEqual({
          code,
          requestId: response.headers['x-request-id'],
        });
        expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['retry-after']).toBeUndefined();
        expect(response.body).not.toContain(privateValue);
        expect(transaction).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it('rejects a missing bearer before domain I/O', async () => {
    const { app, transaction } = setup();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attempts',
        payload: completion,
      });
      expect(response.statusCode).toBe(401);
      expect(identityErrorSchema.parse(response.json())).toEqual({
        code: 'UNAUTHORIZED',
        requestId: response.headers['x-request-id'],
      });
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each([
    {
      name: 'expired session',
      error: new IdentityError('SESSION_EXPIRED'),
      status: 401,
      code: 'SESSION_EXPIRED',
    },
    {
      name: 'domain conflict',
      error: new IdentityError('CONFLICT', 409),
      status: 409,
      code: 'CONFLICT',
    },
    {
      name: 'database uniqueness conflict',
      error: Object.assign(new Error(privateValue), { code: '23505' }),
      status: 409,
      code: 'CONFLICT',
    },
    {
      name: 'wrapped database uniqueness conflict',
      error: new Error(privateValue, { cause: { code: '23505' } }),
      status: 409,
      code: 'CONFLICT',
    },
    {
      name: 'rate limit',
      error: new IdentityError('RATE_LIMITED', 429),
      status: 429,
      code: 'RATE_LIMITED',
    },
    {
      name: 'genuine service failure',
      error: new Error(privateValue),
      status: 503,
      code: 'UNAVAILABLE',
    },
  ])('preserves $name responses', async ({ error, status, code }) => {
    const { app, transaction } = setup();
    transaction.mockRejectedValue(error);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/attempts',
        headers: { authorization },
        payload: completion,
      });
      expect(response.statusCode).toBe(status);
      expect(identityErrorSchema.parse(response.json())).toEqual({
        code,
        requestId: response.headers['x-request-id'],
      });
      expect(response.headers['retry-after']).toBe(
        status === 429 ? '600' : undefined,
      );
      expect(response.body).not.toContain(privateValue);
      expect(transaction).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
