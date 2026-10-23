import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../http/api-error.js';
export type ManagedAuthDeletion = (authUserId: string) => Promise<void>;

/** Server-only administrative client. No session, provider error or secret reaches a response. */
export function createManagedAuthDeletion(
  url: string,
  secretKey: string,
  request: typeof fetch = fetch,
): ManagedAuthDeletion {
  const admin = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        request(input, { ...init, signal: AbortSignal.timeout(5000) }),
    },
  });
  return async (authUserId) => {
    try {
      const { error } = await admin.auth.admin.deleteUser(authUserId, false);
      if (error && !(error.status === 404 && error.code === 'user_not_found'))
        throw new ApiError('UNAVAILABLE', 503);
    } catch {
      throw new ApiError('UNAVAILABLE', 503);
    }
  };
}
