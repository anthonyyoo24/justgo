import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { outboundFetch } from '../http/outbound-fetch.js';

export type VerifiedManagedIdentity = {
  authUserId: string;
  sessionId: string;
  expiresAt: string;
  /** An anonymous Auth user with no identity, accepted only while billing is on. */
  guest: boolean;
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
  transport?: typeof fetch,
  { guests = false }: { guests?: boolean } = {},
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
  const request = outboundFetch(transport);
  return async (token) => {
    let response: Response;
    try {
      response = await request(new URL('/auth/v1/user', origin), {
        headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ApiError('UNAVAILABLE', 503);
    }
    if (!response.ok) {
      const { status } = response;
      const unavailable =
        status < 400 || status === 408 || status === 429 || status >= 500;
      await response.body?.cancel().catch(() => {});
      throw new ApiError(
        unavailable ? 'UNAVAILABLE' : 'UNAUTHORIZED',
        unavailable ? 503 : 401,
      );
    }
    try {
      const user = authUserSchema.parse(await response.json());
      const claims = claimsSchema.parse(
        JSON.parse(
          Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
        ),
      );
      // A guest is an anonymous user that no identity has joined yet. Linking
      // Apple or Google clears is_anonymous, so a user is one or the other.
      const guest =
        guests && user.is_anonymous === true && user.identities.length === 0;
      const account =
        user.is_anonymous !== true &&
        user.identities.some(
          ({ provider }) => provider === 'apple' || provider === 'google',
        );
      if (
        claims.sub !== user.id ||
        !(guest || account) ||
        claims.iss !== new URL('/auth/v1', origin).href ||
        claims.exp * 1000 <= Date.now()
      )
        throw new Error('Rejected managed identity');
      return {
        authUserId: user.id,
        sessionId: claims.session_id,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
        guest,
      };
    } catch {
      throw new ApiError('UNAUTHORIZED');
    }
  };
}
