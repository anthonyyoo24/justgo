import { sql } from 'drizzle-orm';
import type { IdentityService } from '../identity/service.js';
import { requireDataEpoch } from './epoch.js';
import { ApiError } from '../http/api-error.js';
export class DeleteDataService {
  constructor(private readonly identity: IdentityService) {}
  delete(token: string, expectedEpoch: number) {
    return this.identity.withSession(token, async (tx, session) => {
      const previous = (
        await tx.execute<{ data_epoch: number; data_deleted_at: Date | null }>(
          sql`select data_epoch,data_deleted_at from justgo.users where id=${session.userId}`,
        )
      ).rows[0];
      if (!previous) throw new ApiError('UNAUTHORIZED');
      // An uncertain response retries the same deletion generation without deleting newer activity.
      if (previous.data_epoch === expectedEpoch + 1 && previous.data_deleted_at)
        return {
          dataEpoch: previous.data_epoch,
          deletedAt: new Date(previous.data_deleted_at).toISOString(),
        };
      await requireDataEpoch(tx, session.userId, expectedEpoch);
      await tx.execute(
        sql`insert into justgo.deleted_completion_ids(user_id,attempt_id) select user_id,id from justgo.attempts where user_id=${session.userId} union select user_id,attempt_id from justgo.journal_versions where user_id=${session.userId} on conflict do nothing`,
      );
      await tx.execute(
        sql`delete from justgo.journal_versions where user_id=${session.userId}`,
      );
      await tx.execute(
        sql`delete from justgo.attempt_patch_receipts where user_id=${session.userId}`,
      );
      await tx.execute(
        sql`delete from justgo.attempts where user_id=${session.userId}`,
      );
      const row = (
        await tx.execute<{ data_epoch: number; data_deleted_at: Date }>(
          sql`update justgo.users set data_epoch=data_epoch+1,data_deleted_at=now() where id=${session.userId} returning data_epoch,data_deleted_at`,
        )
      ).rows[0];
      if (!row) throw new ApiError('UNAVAILABLE', 503);
      return {
        dataEpoch: row.data_epoch,
        deletedAt: new Date(row.data_deleted_at).toISOString(),
      };
    });
  }
}
