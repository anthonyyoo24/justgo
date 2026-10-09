import { describe, expect, it } from 'vitest';
import { identityErrorSchema, openApiDocument } from './index.js';

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
