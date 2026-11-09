import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { setTransactionContext } from '../../../src/db/transaction-context.js';

type Transaction = Parameters<typeof setTransactionContext>[0];

export const withOwner = <T>(
  db: NodePgDatabase,
  userId: string,
  operation: (tx: Transaction) => Promise<T>,
) =>
  db.transaction(async (tx) => {
    await setTransactionContext(tx, 'app.user_id', userId);
    return operation(tx);
  });
