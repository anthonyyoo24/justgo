import { exportPageSchema } from '@justgo/contracts';
import type { AccountClient } from '../../../lib/network/account-client';

/** Fetch one page; collection owns cursor validation and account checks. */
export function readExportPage(
  client: Pick<AccountClient, 'request'>,
  cursor: string | null,
  signal: AbortSignal,
) {
  return client.request(
    '/v1/account/export' +
      (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
    exportPageSchema,
    { signal },
  );
}
