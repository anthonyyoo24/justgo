import { z } from 'zod';
import { ApiError } from '../http/api-error.js';

export type VerifiedManagedIdentity = {
  authUserId: string;
  sessionId: string;
  expiresAt: string;
};
export type ManagedAuthVerifier = (
  token: string,
) => Promise<VerifiedManagedIdentity>;
const claimsSchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  exp: z.number().int().positive(),
  role: z.literal('authenticated'),
  aud: z.literal('authenticated'),
  iss: z.string(),
});
const authUserSchema = z.object({
  id: z.uuid(),
  is_anonymous: z.boolean().optional(),
  identities: z.array(z.object({ provider: z.string() })),
});

/** Auth's get-user endpoint verifies the JWT. Decoded claims are trusted only after that succeeds. */
export function createManagedAuthVerifier(
  url: string,
  publishableKey: string,
  request: typeof fetch = fetch,
): ManagedAuthVerifier {
  const origin = new URL(url);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('Invalid Supabase Auth URL');
  return async (token) => {
    let response: Response;
    try {
      response = await request(new URL('/auth/v1/user', origin), {
        headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
    } catch {
      throw new ApiError('UNAVAILABLE', 503);
    }
    if (!response.ok)
      throw new ApiError(
        response.status >= 500 ? 'UNAVAILABLE' : 'UNAUTHORIZED',
        response.status >= 500 ? 503 : 401,
      );
    try {
      const user = authUserSchema.parse(await response.json());
      const claims = claimsSchema.parse(
        JSON.parse(
          Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
        ),
      );
      if (
        claims.sub !== user.id ||
        user.is_anonymous ||
        !user.identities.some(
          ({ provider }) => provider === 'apple' || provider === 'google',
        ) ||
        claims.iss !== new URL('/auth/v1', origin).href ||
        claims.exp * 1000 <= Date.now()
      )
        throw new Error('Rejected managed identity');
      return {
        authUserId: user.id,
        sessionId: claims.session_id,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
      };
    } catch {
      throw new ApiError('UNAUTHORIZED');
    }
  };
}
