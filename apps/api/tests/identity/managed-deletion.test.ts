import { randomUUID } from 'node:crypto';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createManagedAuthDeletion } from '../../src/identity/managed-deletion.js';

vi.mock('@supabase/supabase-js', { spy: true });

const origin = 'https://example.supabase.co',
  key = 'sb_secret_server_only_synthetic_fixture_key';

async function loopback(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

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
    // supabase-js 2.119 looks the user up before it deletes them, so the
    // Auth server sees a GET and then the hard DELETE for the same subject.
    expect(request).toHaveBeenCalledTimes(2);
    const [lookup, remove] = request.mock.calls.map(([url, options]) => ({
      url: String(url),
      options,
    }));
    for (const call of [lookup!, remove!]) {
      expect(call.url).toBe(`${origin}/auth/v1/admin/users/${id}`);
      expect(new Headers(call.options?.headers).get('authorization')).toBe(
        `Bearer ${key}`,
      );
    }
    expect(lookup!.options?.method).toBe('GET');
    expect(remove!.options?.method).toBe('DELETE');
    expect(JSON.parse(String(remove!.options?.body))).toEqual({
      should_soft_delete: false,
    });
    expect(timeout).toHaveBeenCalledTimes(2);
    expect(timeout.mock.calls).toEqual([[5000], [5000]]);
    expect(lookup!.options?.signal).toBe(timeout.mock.results[0]!.value);
    expect(remove!.options?.signal).toBe(timeout.mock.results[1]!.value);
  });

  it('stays retryable when the delete fails after the lookup found the user', async () => {
    const id = randomUUID();
    for (const failure of [
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: 'private upstream details' }),
            {
              status: 500,
            },
          ),
        ),
      () => Promise.reject(new Error('private secret')),
    ]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify({ id })))
        .mockImplementationOnce(failure);
      await expect(
        createManagedAuthDeletion(origin, key, request)(id),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'UNAVAILABLE' });
      expect(request.mock.calls.map(([, options]) => options?.method)).toEqual([
        'GET',
        'DELETE',
      ]);
    }
  });

  it('accepts a user deleted elsewhere between the lookup and the delete', async () => {
    const id = randomUUID();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'user_not_found', msg: 'User not found' }),
          { status: 404, headers: { 'X-Supabase-Api-Version': '2024-01-01' } },
        ),
      );
    await expect(
      createManagedAuthDeletion(origin, key, request)(id),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
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

  it.each([301, 302, 303, 307, 308])(
    'fails closed on Auth redirect %s without sending the secret to its Location',
    async (status) => {
      const authRequests: string[] = [];
      const locationRequests: string[] = [];
      const location = await loopback((request, response) => {
        locationRequests.push(`${request.method} ${request.url}`);
        response.end('{}');
      });
      const auth = await loopback((request, response) => {
        authRequests.push(`${request.method} ${request.url}`);
        response
          .writeHead(status, { location: `${location.origin}/collect` })
          .end('{}');
      });
      try {
        await expect(
          createManagedAuthDeletion(auth.origin, key)(randomUUID()),
        ).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
        expect(authRequests).toHaveLength(1);
        expect(locationRequests).toEqual([]);
      } finally {
        await Promise.all([auth.close(), location.close()]);
      }
    },
  );
});
