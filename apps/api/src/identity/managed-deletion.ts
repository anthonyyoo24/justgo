import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../http/api-error.js';
export type ManagedAuthDeletion = (authUserId: string) => Promise<void>;

/** Server-only administrative client. No session, provider error or secret reaches a response. */
export function createManagedAuthDeletion(
  url: string,
  secretKey: string,
  request: typeof fetch = fetch,
): ManagedAuthDeletion {
  // Preserve fail-fast configuration validation without initializing the SDK on every request.
  const trimmedUrl = url.trim();
  if (!trimmedUrl) throw new Error('supabaseUrl is required.');
  if (!/^https?:\/\//i.test(trimmedUrl))
    throw new Error('Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.');
  try {
    new URL(trimmedUrl);
  } catch {
    throw new Error('Invalid supabaseUrl: Provided URL is malformed.');
  }
  if (!secretKey) throw new Error('supabaseKey is required.');
  return async (authUserId) => {
    try {
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
      const { error } = await admin.auth.admin.deleteUser(authUserId, false);
      if (error && !(error.status === 404 && error.code === 'user_not_found'))
        throw new ApiError('UNAVAILABLE', 503);
    } catch {
      throw new ApiError('UNAVAILABLE', 503);
    }
  };
}
