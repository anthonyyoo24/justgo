import { openApiDocument } from './openapi.ts';
import { describe, expect, it } from 'vitest';
import { identityErrorSchema } from './index.js';

describe('permanent request error contracts', () => {
  it.each([
    ['413', 'REQUEST_TOO_LARGE'],
    ['415', 'UNSUPPORTED_MEDIA_TYPE'],
  ] as const)(
    'documents HTTP %s with the typed %s envelope',
    (status, code) => {
      expect(identityErrorSchema.parse({ code, requestId: 'safe-id' })).toEqual(
        {
          code,
          requestId: 'safe-id',
        },
      );
      expect(
        identityErrorSchema.safeParse({
          code,
          requestId: 'safe-id',
          body: 'private-request-data',
        }).success,
      ).toBe(false);
      const response =
        openApiDocument.paths['/v1/attempts'].post.responses[status];
      expect(response?.description).toContain('do not retry unchanged input');
      expect(response?.content['application/json'].schema).toMatchObject({
        type: 'object',
        properties: {
          code: { type: 'string', const: code },
          requestId: { type: 'string' },
        },
        required: ['code', 'requestId'],
        additionalProperties: false,
      });
    },
  );
});

describe('versioned failure contract', () => {
  it('documents unlisted 4xx statuses as client errors and 503 as transient', () => {
    const fallback =
      openApiDocument.paths['/v1/attempts'].post.responses.default;
    expect(fallback.description).toContain(
      'an unlisted 4xx uses INVALID_REQUEST',
    );
    expect(fallback.description).toContain(
      '503 UNAVAILABLE is a transient service failure',
    );
    expect(fallback.content['application/json'].schema).toMatchObject({
      properties: {
        code: {
          enum: expect.arrayContaining(['INVALID_REQUEST', 'UNAVAILABLE']),
        },
      },
    });
  });
});
