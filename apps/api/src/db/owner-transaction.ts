import { AsyncLocalStorage } from 'node:async_hooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const open = new AsyncLocalStorage<true>();

/** Provider I/O inside these transactions would hold the owner's row lock for a network round trip. */
export function ownerTransactions(db: NodePgDatabase): NodePgDatabase {
  const marked: NodePgDatabase = Object.create(db);
  marked.transaction = (work, config) =>
    db.transaction((tx) => open.run(true, () => work(tx)), config);
  return marked;
}

export function refuseInsideOwnerTransaction() {
  if (open.getStore())
    throw new Error(
      'Provider I/O cannot run inside an owner transaction. Call it before IdentityService.withSession or after it returns.',
    );
}
