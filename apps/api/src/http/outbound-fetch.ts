import { ApiError } from './api-error.js';
import { refuseInsideOwnerTransaction } from '../db/owner-transaction.js';

/**
 * Fetch drops only Authorization on a cross-origin redirect, so following one
 * would resend `apikey` to the Location. Workers rejects `redirect: 'error'`
 * before sending, so this uses `manual`.
 */
export function outboundFetch(transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    refuseInsideOwnerTransaction();
    const response = await transport(input, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status > 399) return response;
    await response.body?.cancel().catch(() => {});
    throw new ApiError('UNAVAILABLE', 503);
  };
}
