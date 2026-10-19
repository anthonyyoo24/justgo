import { describe, expect, it } from 'vitest';
import {
  sessionCreateSchema,
  accountDeletionRequestSchema,
  accountDeletionResponseSchema,
  transferCancelSchema,
  receivingTransferCancelResponseSchema,
} from './identity.js';
import { openApiDocument } from './openapi.js';

const proposal = {
  deviceId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  sessionToken: 'a'.repeat(64),
};
it('requires explicit owner-independent deletion confirmation and a bounded private receipt shape', () => {
  expect(
    accountDeletionRequestSchema.parse({ confirmation: 'delete-account' }),
  ).toEqual({ confirmation: 'delete-account' });
  expect(
    accountDeletionRequestSchema.safeParse({
      confirmation: 'delete-account',
      userId: proposal.deviceId,
    }).success,
  ).toBe(false);
  expect(
    accountDeletionResponseSchema.safeParse({
      userId: proposal.deviceId,
      deletedAt: '2026-10-14T10:00:00Z',
      credentialDigests: ['a'.repeat(64)],
    }).success,
  ).toBe(true);
  expect(
    accountDeletionResponseSchema.safeParse({
      userId: proposal.deviceId,
      deletedAt: '2026-10-14T10:00:00Z',
      credentialDigests: [],
      sessionToken: proposal.sessionToken,
    }).success,
  ).toBe(false);
  expect(openApiDocument.paths['/v1/account'].delete.security).toEqual([
    { deviceSession: [] },
  ]);
});
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
      expect(
        sessionCreateSchema.safeParse({
          ...request,
          acceptance: { termsVersion: 'legacy', acceptedAt: '2026-10-17' },
        }).success,
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
    ).toEqual(expect.objectContaining({ anyOf: expect.any(Array) }));
    expect(paths['/v1/transfers/{id}'].delete.security).toEqual([
      {},
      { deviceSession: [] },
    ]);
    expect(paths['/v1/transfers/{id}'].delete.description).toContain(
      'approving account bearer session',
    );
    expect(paths['/v1/transfers'].post.security).toEqual([]);
    expect(paths['/v1/transfer-approvals'].post.security).toEqual([
      { deviceSession: [] },
    ]);
  });
});

it('publishes no legal agreement endpoint or bootstrap receipt fields', () => {
  expect(Object.keys(openApiDocument.paths)).not.toContain(
    '/v1/account/acceptance',
  );
  const body = JSON.stringify(
    openApiDocument.paths['/v1/sessions'].post.requestBody,
  );
  expect(body).not.toMatch(/acceptance|termsVersion|privacyVersion|acceptedAt/);
});

it('requires a complete receiving proposal or the strict approving-account code body', () => {
  const input = {
    ...proposal,
    id: '00000000-0000-4000-8000-000000000003',
    credential: 'b'.repeat(64),
    code: 'ABCDEF0123456789',
    claimSecret: 'c'.repeat(64),
  };
  expect(transferCancelSchema.parse(input)).toEqual(input);
  expect(transferCancelSchema.parse({ code: input.code })).toEqual({
    code: input.code,
  });
  for (const key of [
    'id',
    'credential',
    'deviceId',
    'sessionId',
    'sessionToken',
    'claimSecret',
  ]) {
    const incomplete: Record<string, unknown> = { ...input };
    delete incomplete[key];
    expect(transferCancelSchema.safeParse(incomplete).success).toBe(false);
  }
  expect(
    transferCancelSchema.safeParse({ ...input, userId: proposal.deviceId })
      .success,
  ).toBe(false);
  expect(
    receivingTransferCancelResponseSchema.parse({ status: 'cancelled' }),
  ).toEqual({ status: 'cancelled' });
  expect(
    receivingTransferCancelResponseSchema.parse({ status: 'redeemed' }),
  ).toEqual({ status: 'redeemed' });
  expect(
    receivingTransferCancelResponseSchema.safeParse({ status: 'waiting' })
      .success,
  ).toBe(false);
});
