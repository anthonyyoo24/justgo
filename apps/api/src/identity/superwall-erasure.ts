import { ApiError } from '../http/api-error.js';
import { outboundFetch } from '../http/outbound-fetch.js';

/** Asks Superwall to erase what it holds for one JustGO owner. */
export type SuperwallErasure = (userId: string) => Promise<void>;
export type SuperwallErasureConfig = { apiKey: string; applicationId: string };

const origin = 'https://api.superwall.com';

/**
 * Superwall's documented user erasure. The app identifies a signed-in owner by
 * its JustGO owner ID, so that ID is the `app_user_id`. Superwall holds the
 * request for 25 days before it deletes, and a repeat returns the scheduled
 * request, so a replayed deletion may send it again. JustGO bills only through
 * the App Store, and deleting the account never cancels that subscription, so
 * the request acknowledges active subscriptions rather than fail with 409.
 */
export function createSuperwallErasure(
  config: SuperwallErasureConfig,
  transport?: typeof fetch,
): SuperwallErasure {
  const request = outboundFetch(transport);
  const url = new URL(
    `/v2/applications/${encodeURIComponent(config.applicationId)}/user_erasures`,
    origin,
  );
  return async (userId) => {
    let response: Response;
    try {
      response = await request(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          app_user_id: userId,
          acknowledge_active_subscriptions: true,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ApiError('UNAVAILABLE', 503);
    }
    // Nothing from Superwall's answer reaches a response or a log.
    await response.body?.cancel().catch(() => {});
    if (!response.ok) throw new ApiError('UNAVAILABLE', 503);
  };
}
