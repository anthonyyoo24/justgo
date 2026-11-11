import { AsyncLocalStorage } from 'node:async_hooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Work deferred from inside a transaction keeps its store after commit, so the
// mark is a flag the transaction lowers when it returns.
const marks = new AsyncLocalStorage<{ open: boolean }>();

/** Provider I/O inside these transactions would hold the owner's row lock for a network round trip. */
export function ownerTransactions(db: NodePgDatabase): NodePgDatabase {
  const marked: NodePgDatabase = Object.create(db);
  marked.transaction = async (work, config) => {
    const mark = { open: true };
    try {
      return await db.transaction(
        (tx) => marks.run(mark, () => work(tx)),
        config,
      );
    } finally {
      mark.open = false;
    }
  };
  return marked;
}

export function refuseInsideOwnerTransaction() {
  if (marks.getStore()?.open)
    throw new Error(
      'Provider I/O cannot run inside an owner transaction. Call it before IdentityService.withSession or after it returns.',
    );
}
