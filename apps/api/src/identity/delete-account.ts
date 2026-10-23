import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { accountDeletionResponseSchema } from '@justgo/contracts';
import { digest, type IdentityService } from './service.js';
import { ApiError } from '../http/api-error.js';

export class DeleteAccountService {
  constructor(private readonly identity: IdentityService) {}
  async delete(token: string) {
    if (token.includes('.') && !this.identity.managedAuthDeletion)
      throw new ApiError('UNAVAILABLE', 503);
    const result = await this.identity.withAccountDeletion(
      token,
      async (tx, userId, deletedAt) => {
        if (!deletedAt) {
          const mapping = (
            await tx.execute<{ auth_user_id: string }>(
              sql`select auth_user_id from justgo.managed_auth_accounts where user_id=${userId}`,
            )
          ).rows[0];
          if (mapping)
            await tx.execute(
              sql`insert into justgo.managed_auth_deletions(user_id,auth_user_id) values(${userId},${mapping.auth_user_id}) on conflict(user_id) do nothing`,
            );
          // Approved transfer credentials also need tombstones, even before redemption.
          const transfers = await tx.execute<{ credential_digest: string }>(
            sql`select credential_digest from justgo.device_transfers where user_id=${userId}`,
          );
          for (const transfer of transfers.rows)
            await tx.execute(sql`insert into justgo.recovery_credentials (id,user_id,digest,kind,revoked_at)
            values (${randomUUID()},${userId},${transfer.credential_digest},'sync',now()) on conflict (digest) do nothing`);
          await tx.execute(
            sql`update justgo.recovery_credentials set revoked_at=coalesce(revoked_at,now()) where user_id=${userId}`,
          );
          // All authenticated product/identity mutations take the same owner lock.
          await tx.execute(
            sql`delete from justgo.journal_versions where user_id=${userId}`,
          );
          await tx.execute(
            sql`update justgo.managed_auth_sessions set revoked_at=coalesce(revoked_at,now()) where user_id=${userId}`,
          );
          await tx.execute(
            sql`delete from justgo.attempt_patch_receipts where user_id=${userId}`,
          );
          await tx.execute(
            sql`delete from justgo.attempts where user_id=${userId}`,
          );
          await tx.execute(
            sql`delete from justgo.device_transfers where user_id=${userId}`,
          );
          await tx.execute(
            sql`delete from justgo.device_sessions where user_id=${userId}`,
          );
          await tx.execute(
            sql`delete from justgo.devices where user_id=${userId}`,
          );
          const result = await tx.execute<{
            deleted_at: Date;
          }>(sql`update justgo.users
          set deleted_at=now(), deletion_session_digest=${digest(token)}, analytics_restricted_at=null where id=${userId} returning deleted_at`);
          deletedAt = result.rows[0]!.deleted_at;
        }
        const credentials = await tx.execute<{ digest: string }>(
          sql`select digest from justgo.recovery_credentials where user_id=${userId} order by digest`,
        );
        const receipt = accountDeletionResponseSchema.parse({
          userId,
          deletedAt: new Date(deletedAt).toISOString(),
          credentialDigests: credentials.rows.map((row) => row.digest),
        });
        const pending = (
          await tx.execute<{ auth_user_id: string; completed_at: Date | null }>(
            sql`select auth_user_id,completed_at from justgo.managed_auth_deletions where user_id=${userId}`,
          )
        ).rows[0];
        return { receipt, pending };
      },
    );
    if (result.pending && !result.pending.completed_at) {
      if (!this.identity.managedAuthDeletion)
        throw new ApiError('UNAVAILABLE', 503);
      // Provider I/O stays outside the locked owner transaction. Local deletion and
      // this durable outbox already block every account read/write and resurrection.
      await this.identity.managedAuthDeletion(result.pending.auth_user_id);
      await this.identity.withAccountDeletion(token, async (tx, userId) => {
        await tx.execute(
          sql`update justgo.managed_auth_deletions set completed_at=coalesce(completed_at,now()) where user_id=${userId} and auth_user_id=${result.pending?.auth_user_id}`,
        );
      });
    }
    return result.receipt;
  }
}
