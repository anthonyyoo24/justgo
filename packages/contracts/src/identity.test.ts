import { describe, expect, it } from 'vitest';
import { sessionCreateSchema } from './identity.js';
import { openApiDocument } from './openapi.js';

const proposal = {
  deviceId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  sessionToken: 'a'.repeat(64),
};
const requests = [
  { kind: 'bootstrap', ...proposal, credential: 'b'.repeat(64) },
  { kind: 'recovery', ...proposal, credential: 'b'.repeat(64) },
  {
    kind: 'renewal',
    sessionId: proposal.sessionId,
    sessionToken: proposal.sessionToken,
  },
  { kind: 'transfer', code: 'ABCDEF0123456789', claimSecret: 'c'.repeat(64) },
];

describe('session resource creation proofs', () => {
  it('accepts only the selected strict proof and requires an explicit kind', () => {
    for (const request of requests) {
      expect(sessionCreateSchema.parse(request)).toEqual(request);
      const withoutKind: Record<string, unknown> = { ...request };
      delete withoutKind.kind;
      expect(sessionCreateSchema.safeParse(withoutKind).success).toBe(false);
      expect(
        sessionCreateSchema.safeParse({ ...request, kind: 'unknown' }).success,
      ).toBe(false);
      expect(
        sessionCreateSchema.safeParse({ ...request, userId: proposal.deviceId })
          .success,
      ).toBe(false);
      const secretKey =
        'credential' in request
          ? 'credential'
          : 'claimSecret' in request
            ? 'claimSecret'
            : 'sessionToken';
      expect(
        sessionCreateSchema.safeParse({ ...request, [secretKey]: 'weak' })
          .success,
      ).toBe(false);
    }
    expect(
      sessionCreateSchema.safeParse({ ...requests[0], kind: 'renewal' })
        .success,
    ).toBe(false);
    expect(
      sessionCreateSchema.safeParse({ ...requests[3], kind: 'recovery' })
        .success,
    ).toBe(false);
    expect(
      sessionCreateSchema.safeParse({ kind: 'recovery', ...proposal }).success,
    ).toBe(false);
    expect(
      sessionCreateSchema.safeParse({
        kind: 'transfer',
        code: 'ABCDEF0123456789',
      }).success,
    ).toBe(false);
  });
  it('publishes resource-only identity paths and the conditional renewal bearer requirement', () => {
    const paths = openApiDocument.paths;
    expect(
      Object.keys(paths).some((path) => path.startsWith('/v1/identity')),
    ).toBe(false);
    expect(paths['/v1/sessions'].post.description).toContain(
      'renewal kind requires the current bearer session',
    );
    expect(
      paths['/v1/sessions'].post.requestBody?.content['application/json']
        .schema,
    ).toEqual(expect.objectContaining({ oneOf: expect.any(Array) }));
    expect(paths['/v1/sessions/current'].get.security).toEqual([
      { deviceSession: [] },
    ]);
    for (const resource of ['devices', 'credentials']) {
      const path = paths[`/v1/${resource}/{id}` as keyof typeof paths];
      expect(path).toHaveProperty('delete');
      expect(path).not.toHaveProperty('post');
    }
    expect(
      paths['/v1/transfers/{id}'].delete.requestBody?.content[
        'application/json'
      ].schema,
    ).toEqual(expect.objectContaining({ required: ['code'] }));
    expect(paths['/v1/transfers'].post.security).toEqual([]);
    expect(paths['/v1/transfer-approvals'].post.security).toEqual([
      { deviceSession: [] },
    ]);
  });
});
