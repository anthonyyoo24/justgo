import { ApiError } from './api-error.js';

/**
 * The API's only route to another service. A followed redirect resends headers
 * such as `apikey` to the Location (Fetch strips only Authorization across
 * origins), and Workers rejects `redirect: 'error'` before sending. So
 * redirects stay manual, and a 3xx fails closed with its body unread.
 */
export function outboundFetch(transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await transport(input, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status > 399) return response;
    await response.body?.cancel().catch(() => {});
    throw new ApiError('UNAVAILABLE', 503);
  };
}
