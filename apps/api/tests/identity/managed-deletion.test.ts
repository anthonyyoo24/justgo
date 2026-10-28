import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { createManagedAuthDeletion } from '../../src/identity/managed-deletion.js';
const origin = 'https://example.supabase.co',
  key = 'sb_secret_server_only_synthetic_fixture_key';
describe('server-only Auth profile erasure', () => {
  it('hard deletes the exact verified subject with server credentials', async () => {
    const id = randomUUID(),
      request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ id })));
    await expect(
      createManagedAuthDeletion(origin, key, request)(id),
    ).resolves.toBeUndefined();
    const [url, options] = request.mock.calls[0]!;
    expect(String(url)).toBe(`${origin}/auth/v1/admin/users/${id}`);
    expect(options?.method).toBe('DELETE');
    expect(JSON.parse(String(options?.body))).toEqual({
      should_soft_delete: false,
    });
    expect(new Headers(options?.headers).get('authorization')).toBe(
      `Bearer ${key}`,
    );
  });
  it('accepts an already deleted provider user after an uncertain response', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'user_not_found', msg: 'User not found' }),
          { status: 404, headers: { 'X-Supabase-Api-Version': '2024-01-01' } },
        ),
      );
    await expect(
      createManagedAuthDeletion(origin, key, request)(randomUUID()),
    ).resolves.toBeUndefined();
  });
  it('keeps provider and transport failures retryable without leaking details', async () => {
    for (const status of [401, 403, 404, 500]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: 'private upstream details' }),
            { status },
          ),
        );
      await expect(
        createManagedAuthDeletion(origin, key, request)(randomUUID()),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'UNAVAILABLE' });
    }
    await expect(
      createManagedAuthDeletion(
        origin,
        key,
        vi.fn<typeof fetch>().mockRejectedValue(new Error('private secret')),
      )(randomUUID()),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
