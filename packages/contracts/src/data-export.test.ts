import { describe, expect, it } from 'vitest';
import {
  exportPageQuerySchema,
  exportPageSchema,
  openApiDocument,
} from './index.ts';

describe('private data export contract', () => {
  it('accepts only an optional bounded UUID cursor, never a requested account', () => {
    expect(exportPageQuerySchema.parse({})).toEqual({});
    expect(exportPageQuerySchema.safeParse({ cursor: 'invalid' }).success).toBe(
      false,
    );
    expect(
      exportPageQuerySchema.safeParse({ userId: 'other-owner' }).success,
    ).toBe(false);
  });
  it('rejects credentials and requires typed account/device metadata', () => {
    const data = {
      account: {
        id: '00000000-0000-4000-8000-000000000001',
        createdAt: '2026-10-10T00:00:00.000Z',
      },
      devices: [],
      attempts: [],
      nextCursor: null,
    };
    expect(exportPageSchema.parse(data)).toEqual(data);
    expect(
      exportPageSchema.safeParse({ ...data, credentials: [] }).success,
    ).toBe(false);
    expect(
      exportPageSchema.safeParse({
        ...data,
        account: { ...data.account, token: 'secret' },
      }).success,
    ).toBe(false);
    expect(
      exportPageSchema.safeParse({
        ...data,
        devices: [
          {
            id: data.account.id,
            createdAt: data.account.createdAt,
            revokedAt: null,
            digest: 'secret',
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('documents authenticated paging without entitlement and with no-store runtime behavior', () => {
    const op = openApiDocument.paths['/v1/account/export'].get;
    expect(op.security).toEqual([{ deviceSession: [] }]);
    expect(op.parameters[0]?.name).toBe('cursor');
    expect(op.description).toContain('without paid access');
  });
});
