import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createManagedAuthDeletion } from '../../src/identity/managed-deletion.js';

vi.mock('@supabase/supabase-js', { spy: true });

const origin = 'https://example.supabase.co',
  key = 'sb_secret_server_only_synthetic_fixture_key';
describe('server-only Auth profile erasure', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['', key, 'supabaseUrl is required.'],
    ['   ', key, 'supabaseUrl is required.'],
    [
      'example.supabase.co',
      key,
      'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.',
    ],
    [
      'file:///tmp/auth',
      key,
      'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.',
    ],
    ['https://', key, 'Invalid supabaseUrl: Provided URL is malformed.'],
    [origin, '', 'supabaseKey is required.'],
  ])(
    'rejects invalid configuration before deletion (%s)',
    (url, secret, error) => {
      expect(() => createManagedAuthDeletion(url, secret)).toThrow(error);
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  it('creates a client only when hard deleting the exact verified subject', async () => {
    const id = randomUUID(),
      request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ id }))),
      timeout = vi.spyOn(AbortSignal, 'timeout'),
      removeUser = createManagedAuthDeletion(origin, key, request);
    expect(createClient).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    await expect(removeUser(id)).resolves.toBeUndefined();
    expect(createClient).toHaveBeenCalledExactlyOnceWith(origin, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: expect.any(Function) },
    });
    const [url, options] = request.mock.calls[0]!;
    expect(String(url)).toBe(`${origin}/auth/v1/admin/users/${id}`);
    expect(options?.method).toBe('DELETE');
    expect(JSON.parse(String(options?.body))).toEqual({
      should_soft_delete: false,
    });
    expect(new Headers(options?.headers).get('authorization')).toBe(
      `Bearer ${key}`,
    );
    expect(timeout).toHaveBeenCalledExactlyOnceWith(5000);
    expect(options?.signal).toBe(timeout.mock.results[0]!.value);
  });

  it('keeps deferred client initialization failures retryable and private', async () => {
    const request = vi.fn<typeof fetch>();
    vi.mocked(createClient).mockImplementationOnce(() => {
      throw new Error('private initialization details');
    });
    await expect(
      createManagedAuthDeletion(origin, key, request)(randomUUID()),
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: 503,
      message: 'UNAVAILABLE',
    });
    expect(request).not.toHaveBeenCalled();
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
