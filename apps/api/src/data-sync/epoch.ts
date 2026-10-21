import { sql } from 'drizzle-orm';
import { ApiError } from '../http/api-error.js';
import type { Tx } from '../attempts/model.js';
export async function readDataEpoch(tx: Tx, userId: string) {
  const row = (
    await tx.execute<{ data_epoch: number }>(
      sql`select data_epoch from justgo.users where id=${userId}`,
    )
  ).rows[0];
  if (!row) throw new ApiError('UNAUTHORIZED');
  return row.data_epoch;
}
export async function requireDataEpoch(
  tx: Tx,
  userId: string,
  expected: number | undefined,
  required = true,
) {
  const epoch = await readDataEpoch(tx, userId);
  if ((required || epoch > 0 || expected !== undefined) && expected !== epoch)
    throw new ApiError('DATA_EPOCH_CHANGED', 409);
  return epoch;
}
export async function rejectDeletedCompletion(
  tx: Tx,
  userId: string,
  id: string,
  allowExistingJournal = false,
) {
  if (
    (
      await tx.execute(
        sql`select d.attempt_id from justgo.deleted_completion_ids d where d.user_id=${userId} and d.attempt_id=${id} and not exists(select 1 from justgo.attempts a where a.user_id=d.user_id and a.id=d.attempt_id) ${allowExistingJournal ? sql`and not exists(select 1 from justgo.journal_versions v where v.user_id=d.user_id and v.attempt_id=d.attempt_id)` : sql``}`,
      )
    ).rows[0]
  )
    throw new ApiError('DATA_DELETED', 409);
}
