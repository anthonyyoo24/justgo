import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eraseAccount } from '../src/identity/delete-account.js';

const abandoned = sql`m.guest and u.deleted_at is null and u.created_at < now() - interval '30 days'
  and not exists (select 1 from justgo.app_store_subscriptions s where s.user_id=u.id and s.expires_at > now() - interval '30 days')`;

/**
 * Operator-only deletion of guest accounts made more than 30 days ago that hold
 * no subscription unexpired in the last 30 days. Returns the listed user IDs on
 * a dry run, and the deleted ones otherwise.
 */
export async function cleanUpGuestAccounts(
  db: NodePgDatabase,
  { dryRun, limit = 100 }: { dryRun: boolean; limit?: number },
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid guest cleanup batch size');
  const listed = (
    await db.execute<{ id: string }>(
      sql`select u.id from justgo.users u join justgo.managed_auth_accounts m on m.user_id=u.id
      where ${abandoned} order by u.created_at,u.id limit ${limit}`,
    )
  ).rows.map((row) => row.id);
  if (dryRun) return listed;
  const deleted: string[] = [];
  for (const userId of listed) {
    const erased = await db.transaction(async (tx) => {
      // Linking and verification change a guest only under this owner lock, so
      // the listing is read again once the lock is held.
      await tx.execute(
        sql`select 1 from justgo.users where id=${userId} for update`,
      );
      const still = await tx.execute(
        sql`select 1 from justgo.users u join justgo.managed_auth_accounts m on m.user_id=u.id
        where u.id=${userId} and ${abandoned}`,
      );
      if (!still.rows.length) return false;
      await eraseAccount(tx, userId, null);
      return true;
    });
    if (erased) deleted.push(userId);
  }
  return deleted;
}
