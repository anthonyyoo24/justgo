import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { accountDeletionResponseSchema } from '@justgo/contracts';
import { digest, type IdentityService } from '../identity/service.js';

export class DeleteAccountService {
  constructor(private readonly identity: IdentityService) {}
  delete(token: string) {
    return this.identity.withAccountDeletion(
      token,
      async (tx, userId, deletedAt) => {
        if (!deletedAt) {
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
          set deleted_at=now(), deletion_session_digest=${digest(token)} where id=${userId} returning deleted_at`);
          deletedAt = result.rows[0]!.deleted_at;
        }
        const credentials = await tx.execute<{ digest: string }>(
          sql`select digest from justgo.recovery_credentials where user_id=${userId} order by digest`,
        );
        return accountDeletionResponseSchema.parse({
          userId,
          deletedAt: new Date(deletedAt).toISOString(),
          credentialDigests: credentials.rows.map((row) => row.digest),
        });
      },
    );
  }
}
