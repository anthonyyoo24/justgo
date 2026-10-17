import { catalogSchema } from '@justgo/contracts';
import type { AccountClient } from '../../lib/network/account-client';

/** Download only; the controller owns cache adoption and account fencing. */
export function readChallengeCatalog(
  client: Pick<AccountClient, 'request'>,
  signal: AbortSignal,
) {
  return client.request('/v1/challenges', catalogSchema, { signal });
}
