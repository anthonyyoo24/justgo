import type { Pool } from 'pg';
import type { ManagedAuthDeletion } from '../src/identity/managed-deletion.js';

/** Operator-only bounded retry for accepted deletions when the original phone never reconnects. */
export async function retryManagedAuthDeletions(
  pool: Pool,
  erase: ManagedAuthDeletion,
  limit = 50,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid Auth cleanup batch size');
  const pending = await pool.query<{ user_id: string; auth_user_id: string }>(
    `select d.user_id,d.auth_user_id
    from justgo.managed_auth_deletions d join justgo.users u on u.id=d.user_id
    join justgo.managed_auth_accounts m on m.user_id=d.user_id and m.auth_user_id=d.auth_user_id
    where d.completed_at is null and u.deleted_at is not null order by d.requested_at,d.user_id limit $1`,
    [limit],
  );
  let completed = 0,
    failed = 0;
  for (const row of pending.rows) {
    try {
      await erase(row.auth_user_id);
      await pool.query(
        `update justgo.managed_auth_deletions set completed_at=coalesce(completed_at,now()) where user_id=$1 and auth_user_id=$2`,
        [row.user_id, row.auth_user_id],
      );
      completed++;
    } catch {
      failed++;
    }
  }
  return { completed, failed };
}
