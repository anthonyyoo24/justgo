import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

type TransactionContextKey =
  | 'app.user_id'
  | 'app.auth_user_id'
  | 'app.session_digest'
  | 'app.credential_digest'
  | 'app.transfer_digest'
  | 'app.rate_key'
  | 'app.guest_catalog';

export const setTransactionContext = (
  tx: Transaction,
  key: TransactionContextKey,
  value: string,
) =>
  // Transaction-local, so a pooled connection never carries one owner into the next request.
  tx.execute(sql`select set_config(${key}, ${value}, true)`);
