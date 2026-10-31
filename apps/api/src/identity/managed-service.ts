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
  (
    await tx.execute<{ live: boolean | null }>(
      sql`select justgo_auth_private.is_live_session_v1(${identity.sessionId}::uuid,${identity.authUserId}::uuid) as live`,
    )
  ).rows[0]?.live === true;

/** Roll back a losing candidate owner before reading the committed mapping. */
class MappingCreatedConcurrently extends Error {}

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
  private async mapping(tx: Tx, authUserId: string) {
    return (
      await tx.execute<{ user_id: string }>(
        sql`select user_id from justgo.managed_auth_accounts where auth_user_id=${authUserId}`,
      )
    ).rows[0];
  }
  private async hasMapping(token: string) {
    const identity = await this.verified(token);
    return this.db.transaction(async (tx) => {
      await this.prepare(tx, identity);
      return (await this.mapping(tx, identity.authUserId)) !== undefined;
    });
  }
  async exchange(
    token: string,
    input: ManagedSessionRequest,
  ): Promise<ManagedSessionResponse> {
    let missingMapping = false;
    const exchange = async (): Promise<ManagedSessionResponse> => {
      const identity = await this.verified(token);
      return this.db.transaction(async (tx) => {
        await this.prepare(tx, identity);
        const mapping = await this.mapping(tx, identity.authUserId);
        missingMapping = !mapping;
        const legacyOwner = input.legacySessionToken
          ? await this.legacy(tx, input.legacySessionToken, mapping?.user_id)
          : undefined;
        if (mapping && legacyOwner && mapping.user_id !== legacyOwner)
          throw new ApiError('CONFLICT', 409);
        const userId = mapping?.user_id ?? legacyOwner ?? this.allocateUserId();
        await context(tx, 'app.user_id', userId);
        if (!mapping) {
          if (!legacyOwner)
            await tx.execute(
              sql`insert into justgo.users(id) values(${userId})`,
            );
          await this.lockOwner(tx, userId);
          const inserted = await tx.execute<{ user_id: string }>(
            sql`insert into justgo.managed_auth_accounts(auth_user_id,user_id) values(${identity.authUserId},${userId}) on conflict(auth_user_id) do nothing returning user_id`,
          );
          if (!inserted.rows.length) throw new MappingCreatedConcurrently();
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
    };
    try {
      return await exchange();
    } catch (error) {
      // Only first-mapping contention can retry. The failed transaction has
      // rolled back its candidate owner and any legacy revocations. An existing
      // owner's row lock still serializes sessions, deletion and revocation.
      const legacyMappingAppeared =
        missingMapping &&
        !!input.legacySessionToken &&
        error instanceof ApiError &&
        error.code === 'SESSION_REVOKED' &&
        (await this.hasMapping(token));
      if (
        !(error instanceof MappingCreatedConcurrently) &&
        !legacyMappingAppeared
      )
        throw error;
      // One retry runs every normal proof/live-session/deleted-owner check again.
      return exchange();
    }
  }
  async withSession<T>(
    token: string,
    work: (tx: Tx, session: ManagedSessionResponse) => Promise<T>,
  ): Promise<T> {
    const identity = await this.verified(token);
    return this.db.transaction(async (tx) => {
      await this.prepare(tx, identity);
      const mapping = await this.mapping(tx, identity.authUserId);
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
