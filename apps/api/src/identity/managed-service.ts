import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  ManagedSessionRequest,
  ManagedSessionResponse,
} from '@justgo/contracts';
import { ApiError } from '../http/api-error.js';
import type {
  ManagedAuthVerifier,
  VerifiedManagedIdentity,
} from './managed-verifier.js';

type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];
export type ManagedLiveSessionReader = (
  tx: Tx,
  identity: VerifiedManagedIdentity,
) => Promise<boolean>;
type LegacyReader = (
  tx: Tx,
  token: string,
  linkedOwner?: string,
) => Promise<string>;
const context = (tx: Tx, key: string, value: string) =>
  tx.execute(sql`select set_config(${key},${value},true)`);
const liveSession: ManagedLiveSessionReader = async (tx, identity) =>
  Boolean(
    (
      await tx.execute(
        sql`select id from auth.sessions where id=${identity.sessionId}::uuid and user_id=${identity.authUserId}::uuid and (not_after is null or not_after>now())`,
      )
    ).rows[0],
  );

export class ManagedIdentityService {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly verify: ManagedAuthVerifier,
    private readonly legacy: LegacyReader,
    private readonly live: ManagedLiveSessionReader = liveSession,
    private readonly allocateUserId: () => string = randomUUID,
  ) {}
  private async verified(token: string) {
    return this.verify(token);
  }
  private async prepare(tx: Tx, identity: VerifiedManagedIdentity) {
    await context(tx, 'app.auth_user_id', identity.authUserId);
    if (!(await this.live(tx, identity))) throw new ApiError('SESSION_REVOKED');
  }
  private async lockOwner(tx: Tx, userId: string) {
    await context(tx, 'app.user_id', userId);
    const row = (
      await tx.execute<{ deleted_at: Date | null; data_epoch: number }>(
        sql`select deleted_at,data_epoch from justgo.users where id=${userId} for update`,
      )
    ).rows[0];
    if (!row || row.deleted_at) throw new ApiError('CREDENTIAL_REJECTED');
    return row;
  }
  async exchange(
    token: string,
    input: ManagedSessionRequest,
  ): Promise<ManagedSessionResponse> {
    const identity = await this.verified(token);
    return this.db.transaction(async (tx) => {
      await this.prepare(tx, identity);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${identity.authUserId},2))`,
      );
      const mapping = (
        await tx.execute<{ user_id: string }>(
          sql`select user_id from justgo.managed_auth_accounts where auth_user_id=${identity.authUserId}`,
        )
      ).rows[0];
      const legacyOwner = input.legacySessionToken
        ? await this.legacy(tx, input.legacySessionToken, mapping?.user_id)
        : undefined;
      if (mapping && legacyOwner && mapping.user_id !== legacyOwner)
        throw new ApiError('CONFLICT', 409);
      const userId = mapping?.user_id ?? legacyOwner ?? this.allocateUserId();
      await context(tx, 'app.user_id', userId);
      if (!mapping) {
        if (!legacyOwner)
          await tx.execute(sql`insert into justgo.users(id) values(${userId})`);
        await this.lockOwner(tx, userId);
        await tx.execute(
          sql`insert into justgo.managed_auth_accounts(auth_user_id,user_id) values(${identity.authUserId},${userId})`,
        );
        if (legacyOwner) {
          await tx.execute(
            sql`update justgo.device_sessions set revoked_at=coalesce(revoked_at,now()) where user_id=${userId}`,
          );
          await tx.execute(
            sql`update justgo.recovery_credentials set revoked_at=coalesce(revoked_at,now()) where user_id=${userId}`,
          );
          await tx.execute(
            sql`update justgo.device_transfers set cancelled_at=coalesce(cancelled_at,now()) where user_id=${userId}`,
          );
        }
      }
      const owner = await this.lockOwner(tx, userId);
      if (!(await this.live(tx, identity)))
        throw new ApiError('SESSION_REVOKED');
      const previous = (
        await tx.execute<{ device_id: string; revoked_at: Date | null }>(
          sql`select device_id,revoked_at from justgo.managed_auth_sessions where id=${identity.sessionId}`,
        )
      ).rows[0];
      if (previous?.revoked_at) throw new ApiError('SESSION_REVOKED');
      if (previous && previous.device_id !== input.deviceId)
        throw new ApiError('CONFLICT', 409);
      await tx.execute(
        sql`insert into justgo.managed_auth_sessions(id,auth_user_id,user_id,device_id,expires_at) values(${identity.sessionId},${identity.authUserId},${userId},${input.deviceId},${identity.expiresAt}::timestamptz) on conflict(id) do update set expires_at=excluded.expires_at`,
      );
      return {
        ...identity,
        userId,
        deviceId: input.deviceId,
        dataEpoch: owner.data_epoch,
      };
    });
  }
  async withSession<T>(
    token: string,
    work: (tx: Tx, session: ManagedSessionResponse) => Promise<T>,
  ): Promise<T> {
    const identity = await this.verified(token);
    return this.db.transaction(async (tx) => {
      await this.prepare(tx, identity);
      const mapping = (
        await tx.execute<{ user_id: string }>(
          sql`select user_id from justgo.managed_auth_accounts where auth_user_id=${identity.authUserId}`,
        )
      ).rows[0];
      if (!mapping) throw new ApiError('UNAUTHORIZED');
      const owner = await this.lockOwner(tx, mapping.user_id);
      const session = (
        await tx.execute<{ device_id: string; revoked_at: Date | null }>(
          sql`select device_id,revoked_at from justgo.managed_auth_sessions where id=${identity.sessionId} and auth_user_id=${identity.authUserId} and user_id=${mapping.user_id}`,
        )
      ).rows[0];
      if (!session || session.revoked_at || !(await this.live(tx, identity)))
        throw new ApiError('SESSION_REVOKED');
      return work(tx, {
        ...identity,
        userId: mapping.user_id,
        deviceId: session.device_id,
        dataEpoch: owner.data_epoch,
      });
    });
  }
  logout(token: string, scope: 'session' | 'all') {
    return this.withSession(token, async (tx, session) => {
      await tx.execute(
        sql`update justgo.managed_auth_sessions set revoked_at=coalesce(revoked_at,now()) where user_id=${session.userId} ${scope === 'session' ? sql`and id=${session.sessionId}` : sql``}`,
      );
      return { ok: true as const };
    });
  }
}
