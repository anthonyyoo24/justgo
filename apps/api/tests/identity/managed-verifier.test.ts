import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { createManagedAuthVerifier } from '../../src/identity/managed-verifier.js';
const origin = 'https://example.supabase.co';
const subject = randomUUID(),
  session = randomUUID();
const claims = {
  sub: subject,
  session_id: session,
  exp: Math.floor(Date.now() / 1000) + 3600,
  role: 'authenticated',
  aud: 'authenticated',
  iss: `${origin}/auth/v1`,
};
const token = (payload: Record<string, unknown> = claims) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
describe('Supabase bearer verification', () => {
  it.each(['apple', 'google'])(
    'verifies %s user with Auth before using signed claims',
    async (provider) => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: subject,
            is_anonymous: false,
            identities: [{ provider }],
          }),
        ),
      );
      const verify = createManagedAuthVerifier(origin, 'public-key', request);
      await expect(verify(token())).resolves.toEqual({
        authUserId: subject,
        sessionId: session,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
      });
      expect(request).toHaveBeenCalledWith(
        new URL(`${origin}/auth/v1/user`),
        expect.objectContaining({
          headers: { apikey: 'public-key', authorization: `Bearer ${token()}` },
          redirect: 'manual',
        }),
      );
    },
  );
  it.each([
    { id: randomUUID(), identities: [{ provider: 'apple' }] },
    { id: subject, is_anonymous: true, identities: [{ provider: 'google' }] },
    { id: subject, identities: [{ provider: 'email' }] },
    { id: subject, identities: [] },
  ])(
    'rejects wrong subjects and unsupported/anonymous identities',
    async (user) => {
      const verify = createManagedAuthVerifier(
        origin,
        'public-key',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(JSON.stringify(user))),
      );
      await expect(verify(token())).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    },
  );
  it.each([
    { ...claims, iss: 'https://attacker.example/auth/v1' },
    { ...claims, exp: 1 },
    { ...claims, role: 'service_role' },
    { ...claims, session_id: 'bad' },
  ])('rejects invalid token context after verification', async (payload) => {
    const verify = createManagedAuthVerifier(
      origin,
      'public-key',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: subject,
            identities: [{ provider: 'apple' }],
          }),
        ),
      ),
    );
    await expect(verify(token(payload))).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
  it.each([
    [401, 'UNAUTHORIZED', 401],
    [403, 'UNAUTHORIZED', 401],
    [408, 'UNAVAILABLE', 503],
    [429, 'UNAVAILABLE', 503],
    [500, 'UNAVAILABLE', 503],
  ] as const)(
    'maps Auth HTTP %i to %s without exposing its body',
    async (status, code, apiStatus) => {
      const response = new Response('private response', { status });
      const request = vi.fn<typeof fetch>().mockResolvedValue(response);
      const verify = createManagedAuthVerifier(origin, 'public-key', request);
      await expect(verify(token())).rejects.toMatchObject({
        code,
        status: apiStatus,
        message: code,
      });
      expect(request).toHaveBeenCalledOnce();
      expect(response.bodyUsed).toBe(true);
    },
  );
  it('fails closed without exposing transport errors', async () => {
    const verify = createManagedAuthVerifier(
      origin,
      'public-key',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('private token')),
    );
    await expect(verify(token())).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'UNAVAILABLE',
    });
    expect(() =>
      createManagedAuthVerifier('http://example.supabase.co', 'public-key'),
    ).toThrow('Invalid Supabase Auth URL');
  });

  it.each([301, 302, 303, 307, 308])(
    'rejects Auth redirect %s without following it or using its body',
    async (status) => {
      const response = new Response('private redirect response', {
        status,
        headers: { location: 'https://untrusted.invalid/auth' },
      });
      const read = vi.spyOn(response, 'json');
      const cancel = vi.spyOn(response.body!, 'cancel');
      const request = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(
        createManagedAuthVerifier(origin, 'public-key', request)(token()),
      ).rejects.toMatchObject({
        code: 'UNAVAILABLE',
        status: 503,
        message: 'UNAVAILABLE',
      });
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0]![1]?.redirect).toBe('manual');
      expect(read).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
});
