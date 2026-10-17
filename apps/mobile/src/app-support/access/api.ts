import { accessResponseSchema } from '@justgo/contracts';
import type { AccountClient } from '../../lib/network/account-client';

/** The provider owns polling, clock alignment and admission decisions. */
export function readAccess(
  client: Pick<AccountClient, 'request'>,
  signal: AbortSignal,
) {
  return client.request('/v1/access', accessResponseSchema, { signal });
}
