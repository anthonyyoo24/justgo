import { ApiError } from '../http/api-error.js';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  BootstrapRequest,
  CredentialCreate,
  IdentityErrorCode,
  SessionProposal,
  SessionResponse,
  TransferStart,
} from '@justgo/contracts';

type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];
type Row = Record<string, unknown>;
type SessionRow = Row & {
  id: string;
  user_id: string;
  device_id: string;
  digest: string;
  expires_at: Date;
  revoked_at: Date | null;
  rotated_to: string | null;
};
type CredentialRow = Row & {
  id: string;
  user_id: string;
  digest: string;
  revoked_at: Date | null;
};
type TransferRow = Row & {
  id: string;
  code_digest: string;
  claim_digest: string;
  user_id: string | null;
  device_id: string;
  session_id: string;
  session_digest: string;
  credential_digest: string;
  verification: string;
  verification_attempts: number;
  expires_at: Date;
  approved_at: Date | null;
  redeemed_at: Date | null;
  cancelled_at: Date | null;
};
export const digest = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');
const one = async <T extends Row>(tx: Tx, query: SQL) =>
  (await tx.execute<T>(query)).rows[0];
const context = (tx: Tx, key: string, value: string) =>
  tx.execute(sql`select set_config(${key}, ${value}, true)`);
const fail = (code: IdentityErrorCode, status = 401): never => {
  throw new ApiError(code, status);
};
const response = (row: SessionRow): SessionResponse => ({
  userId: row.user_id,
  deviceId: row.device_id,
  sessionId: row.id,
  expiresAt: new Date(row.expires_at).toISOString(),
});

export type IdentityOptions = {
  sessionHours?: number;
  transferMinutes?: number;
  rateLimit?: number;
  rateKey: string;
  // Trusted server-side allocation seam; never supplied by an HTTP caller.
  newUserId?: () => string;
};
export class IdentityService {
  private readonly sessionHours: number;
  private readonly transferMinutes: number;
  constructor(
    readonly db: NodePgDatabase,
    private readonly options: IdentityOptions,
  ) {
    this.sessionHours = options.sessionHours ?? 168;
    this.transferMinutes = options.transferMinutes ?? 10;
  }
  // Durable, atomic, shared across API instances. Never store raw addresses or bearer secrets.
  async rateLimit(
    address: string,
    lane: string,
    limit = this.options.rateLimit ?? 30,
  ) {
    const key = createHmac('sha256', this.options.rateKey)
      .update(`${lane}:${address}`)
      .digest('hex');
    const bucket = await this.db.transaction(async (tx) => {
      await context(tx, 'app.rate_key', key);
      const row = await one<{ count: number; retry_after_seconds: number }>(
        tx,
        sql`
        insert into justgo.identity_rate_buckets (key,count,window_start) values (${key},1,now())
        on conflict (key) do update set
          count = case when identity_rate_buckets.window_start <= now()-interval '10 minutes' then 1 else identity_rate_buckets.count+1 end,
          window_start = case when identity_rate_buckets.window_start <= now()-interval '10 minutes' then now() else identity_rate_buckets.window_start end
        returning count,
          greatest(1, least(600, ceil(extract(epoch from (window_start + interval '10 minutes' - now())))))::integer as retry_after_seconds`,
      );
      return row!;
    });
    if (bucket.count > limit)
      throw new ApiError('RATE_LIMITED', 429, bucket.retry_after_seconds);
  }
  private async owner(tx: Tx, userId: string) {
    // Only called with a server-generated new account or a verified digest-bound identity.
    await context(tx, 'app.user_id', userId);
    const row = await one<{ deleted_at: Date | null }>(
      tx,
      sql`select deleted_at from justgo.users where id=${userId} for update`,
    );
    if (!row || row.deleted_at) fail('CREDENTIAL_REJECTED');
  }
  private async findSession(tx: Tx, token: string) {
    const hash = digest(token);
    await context(tx, 'app.session_digest', hash);
    const row = await one<SessionRow>(
      tx,
      sql`select * from justgo.device_sessions where digest=${hash}`,
    );
    if (!row) return fail('UNAUTHORIZED');
    await this.owner(tx, row.user_id);
    // Recheck after serializing owner mutations: revocation must win over a stale read.
    return (await one<SessionRow>(
      tx,
      sql`select * from justgo.device_sessions where id=${row.id}`,
    ))!;
  }
  private async active(tx: Tx, row: SessionRow) {
    if (row.revoked_at) fail('SESSION_REVOKED');
    const device = await one(
      tx,
      sql`select id from justgo.devices where user_id=${row.user_id} and id=${row.device_id} and revoked_at is null`,
    );
    if (!device) fail('SESSION_REVOKED');
    const valid = await one(
      tx,
      sql`select id from justgo.device_sessions where id=${row.id} and expires_at > now()`,
    );
    if (!valid) fail('SESSION_EXPIRED');
  }
  async withSession<T>(
    token: string,
    work: (tx: Tx, session: SessionResponse) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const row = await this.findSession(tx, token);
      await this.active(tx, row);
      return work(tx, response(row));
    });
  }
  /** A deleted account exposes only its receipt to the original deletion proof. */
  async withAccountDeletion<T>(
    token: string,
    work: (tx: Tx, userId: string, deletedAt: Date | null) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const hash = digest(token);
      await context(tx, 'app.session_digest', hash);
      const receipt = await one<{ id: string; deleted_at: Date }>(
        tx,
        sql`select id, deleted_at from justgo.users where deletion_session_digest=${hash} and deleted_at is not null`,
      );
      if (receipt) {
        await context(tx, 'app.user_id', receipt.id);
        return work(tx, receipt.id, receipt.deleted_at);
      }
      try {
        const row = await this.findSession(tx, token);
        await this.active(tx, row);
        return await work(tx, row.user_id, null);
      } catch (error) {
        // A concurrent identical delete may have committed while owner() waited.
        if (
          !(error instanceof ApiError) ||
          !['CREDENTIAL_REJECTED', 'UNAUTHORIZED'].includes(error.code)
        )
          throw error;
        const committed = await one<{ id: string; deleted_at: Date }>(
          tx,
          sql`select id, deleted_at from justgo.users where deletion_session_digest=${hash} and deleted_at is not null`,
        );
        if (!committed) throw error;
        await context(tx, 'app.user_id', committed.id);
        return work(tx, committed.id, committed.deleted_at);
      }
    });
  }
  private async issue(
    tx: Tx,
    userId: string,
    proposal: SessionProposal,
    tokenDigest = digest(proposal.sessionToken),
  ) {
    await tx.execute(
      sql`insert into justgo.devices (id,user_id) values (${proposal.deviceId},${userId}) on conflict do nothing`,
    );
    const device = await one(
      tx,
      sql`select id from justgo.devices where id=${proposal.deviceId} and user_id=${userId} and revoked_at is null`,
    );
    if (!device) return fail('SESSION_REVOKED');
    const existing = await one<SessionRow>(
      tx,
      sql`select * from justgo.device_sessions where id=${proposal.sessionId}`,
    );
    if (existing) {
      if (
        existing.digest !== tokenDigest ||
        existing.device_id !== proposal.deviceId
      )
        fail('CONFLICT', 409);
      await this.active(tx, existing);
      return response(existing);
    }
    const row = await one<SessionRow>(
      tx,
      sql`insert into justgo.device_sessions (id,user_id,device_id,digest,expires_at)
      values (${proposal.sessionId},${userId},${proposal.deviceId},${tokenDigest},now()+${this.sessionHours}*interval '1 hour') returning *`,
    );
    return response(row!);
  }
  async bootstrap(input: BootstrapRequest, create = true) {
    return this.db.transaction(async (tx) => {
      const hash = digest(input.credential);
      // Serialize missing-row creation; unique digest remains the final invariant.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${hash},0))`,
      );
      await context(tx, 'app.credential_digest', hash);
      let credential = await one<CredentialRow>(
        tx,
        sql`select * from justgo.recovery_credentials where digest=${hash}`,
      );
      if (!credential) {
        if (!create) return fail('CREDENTIAL_REJECTED');
        const userId = this.options.newUserId?.() ?? randomUUID();
        await context(tx, 'app.user_id', userId);
        await tx.execute(sql`insert into justgo.users (id) values (${userId})`);
        credential = (await one<CredentialRow>(
          tx,
          sql`insert into justgo.recovery_credentials (id,user_id,digest,kind) values (${randomUUID()},${userId},${hash},'sync') returning *`,
        ))!;
      }
      await this.owner(tx, credential.user_id);
      credential = (await one<CredentialRow>(
        tx,
        sql`select * from justgo.recovery_credentials where digest=${hash}`,
      ))!;
      if (credential.revoked_at) return fail('CREDENTIAL_REJECTED');
      return this.issue(tx, credential.user_id, input);
    });
  }
  me(token: string) {
    return this.withSession(token, async (_tx, session) => session);
  }
  async renew(
    token: string,
    next: { sessionId: string; sessionToken: string },
  ) {
    return this.db.transaction(async (tx) => {
      const row = await this.findSession(tx, token);
      if (row.rotated_to) {
        if (row.rotated_to !== next.sessionId) return fail('SESSION_REVOKED');
        const issued = await one<SessionRow>(
          tx,
          sql`select * from justgo.device_sessions where id=${next.sessionId} and digest=${digest(next.sessionToken)}`,
        );
        if (!issued) return fail('SESSION_REVOKED');
        await this.active(tx, issued);
        return response(issued);
      }
      await this.active(tx, row);
      if (next.sessionId === row.id || digest(next.sessionToken) === row.digest)
        return fail('CONFLICT', 409);
      const issued = await this.issue(tx, row.user_id, {
        ...next,
        deviceId: row.device_id,
      });
      await tx.execute(
        sql`update justgo.device_sessions set revoked_at=now(),rotated_to=${next.sessionId} where id=${row.id}`,
      );
      return issued;
    });
  }
  listDevices(token: string) {
    return this.withSession(token, async (tx) => ({
      devices: (
        await tx.execute<{
          id: string;
          created_at: Date;
          revoked_at: Date | null;
        }>(
          sql`select id,created_at,revoked_at from justgo.devices order by created_at`,
        )
      ).rows.map((r) => ({
        id: r.id,
        createdAt: new Date(r.created_at).toISOString(),
        revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      })),
    }));
  }
  revokeDevice(token: string, id: string) {
    return this.withSession(token, async (tx) => {
      const row = await one(
        tx,
        sql`update justgo.devices set revoked_at=coalesce(revoked_at,now()) where id=${id} returning id`,
      );
      if (!row) fail('NOT_FOUND', 404);
      await tx.execute(
        sql`update justgo.device_sessions set revoked_at=coalesce(revoked_at,now()) where device_id=${id}`,
      );
      return { ok: true as const };
    });
  }
  listCredentials(token: string) {
    return this.withSession(token, async (tx) => ({
      credentials: (
        await tx.execute<{
          id: string;
          kind: 'sync' | 'key';
          created_at: Date;
          revoked_at: Date | null;
        }>(
          sql`select id,kind,created_at,revoked_at from justgo.recovery_credentials order by created_at`,
        )
      ).rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        createdAt: new Date(r.created_at).toISOString(),
        revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      })),
    }));
  }
  addCredential(token: string, input: CredentialCreate) {
    return this.withSession(token, async (tx, session) => {
      const hash = digest(input.credential);
      const found = await one<CredentialRow & { kind: string }>(
        tx,
        sql`select * from justgo.recovery_credentials where id=${input.id} or digest=${hash}`,
      );
      if (found) {
        if (
          found.id !== input.id ||
          found.digest !== hash ||
          found.kind !== input.kind ||
          found.revoked_at
        )
          fail('CONFLICT', 409);
      } else
        await tx.execute(
          sql`insert into justgo.recovery_credentials (id,user_id,digest,kind) values (${input.id},${session.userId},${hash},${input.kind})`,
        );
      return { ok: true as const };
    });
  }
  revokeCredential(token: string, id: string) {
    return this.withSession(token, async (tx) => {
      const found = await one(
        tx,
        sql`update justgo.recovery_credentials set revoked_at=coalesce(revoked_at,now()) where id=${id} returning id`,
      );
      if (!found) fail('NOT_FOUND', 404);
      return { ok: true as const };
    });
  }
  private transferView(row: TransferRow) {
    return {
      id: row.id,
      expiresAt: new Date(row.expires_at).toISOString(),
      status: row.cancelled_at
        ? ('cancelled' as const)
        : row.redeemed_at
          ? ('redeemed' as const)
          : row.approved_at
            ? ('approved' as const)
            : ('waiting' as const),
    };
  }
  // Separate domains for code generation and the per-transfer stored verifier.
  // The claim digest alone must not reveal the six digits to a database reader.
  private transferVerification(claimHash: string) {
    const bytes = createHmac('sha256', this.options.rateKey)
      .update(`justgo:transfer:code:v1:${claimHash}`)
      .digest();
    return (bytes.readUInt32BE(0) % 1000000).toString().padStart(6, '0');
  }
  private transferVerifier(id: string, verification: string) {
    return createHmac('sha256', this.options.rateKey)
      .update(`justgo:transfer:verifier:v1:${id}:${verification}`)
      .digest('hex');
  }
  private matchesVerification(row: TransferRow, verification: string) {
    return timingSafeEqual(
      Buffer.from(row.verification, 'hex'),
      Buffer.from(this.transferVerifier(row.id, verification), 'hex'),
    );
  }
  private async transfer(tx: Tx, code: string) {
    const hash = digest(code);
    await context(tx, 'app.transfer_digest', hash);
    const row = await one<TransferRow>(
      tx,
      sql`select * from justgo.device_transfers where code_digest=${hash}`,
    );
    if (!row) return fail('NOT_FOUND', 404);
    return row;
  }
  private async liveTransfer(tx: Tx, row: TransferRow) {
    if (row.cancelled_at) fail('CREDENTIAL_REJECTED');
    if (
      !(await one(
        tx,
        sql`select id from justgo.device_transfers where id=${row.id} and expires_at>now()`,
      ))
    )
      fail('TRANSFER_EXPIRED', 410);
  }
  private matchesTransfer(row: TransferRow, input: TransferStart) {
    return (
      row.id === input.id &&
      row.claim_digest === digest(input.claimSecret) &&
      row.session_id === input.sessionId &&
      row.session_digest === digest(input.sessionToken) &&
      row.device_id === input.deviceId &&
      row.credential_digest === digest(input.credential)
    );
  }
  private async createTransfer(
    tx: Tx,
    input: TransferStart,
    cancelled = false,
  ) {
    const verification = this.transferVerifier(
      input.id,
      this.transferVerification(digest(input.claimSecret)),
    );
    return (await one<TransferRow>(
      tx,
      sql`insert into justgo.device_transfers (id,code_digest,claim_digest,device_id,session_id,session_digest,credential_digest,verification,expires_at,cancelled_at)
        values (${input.id},${digest(input.code)},${digest(input.claimSecret)},${input.deviceId},${input.sessionId},${digest(input.sessionToken)},${digest(input.credential)},${verification},now()+${this.transferMinutes}*interval '1 minute',case when ${cancelled} then now() else null end) returning *`,
    ))!;
  }
  async startTransfer(input: TransferStart) {
    return this.db.transaction(async (tx) => {
      const codeHash = digest(input.code),
        claimHash = digest(input.claimSecret);
      await context(tx, 'app.transfer_digest', codeHash);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${codeHash},1))`,
      );
      const existing = await one<TransferRow>(
        tx,
        sql`select * from justgo.device_transfers where code_digest=${codeHash}`,
      );
      if (existing) {
        if (!this.matchesTransfer(existing, input))
          return fail('CONFLICT', 409);
        await this.liveTransfer(tx, existing);
        const verification = this.transferVerification(claimHash);
        // A key rotation invalidates old pending transfers; never display unusable digits.
        if (!this.matchesVerification(existing, verification))
          return fail('CREDENTIAL_REJECTED');
        return { ...this.transferView(existing), verification };
      }
      const verification = this.transferVerification(claimHash);
      const row = await this.createTransfer(tx, input);
      return { ...this.transferView(row), verification };
    });
  }
  inspectTransfer(token: string, code: string) {
    return this.withSession(token, async (tx) => {
      const row = await this.transfer(tx, code);
      await this.liveTransfer(tx, row);
      return this.transferView(row);
    });
  }
  async approveTransfer(token: string, code: string, verification: string) {
    const approved = await this.withSession(token, async (tx, session) => {
      let row = await this.transfer(tx, code);
      row = (await one<TransferRow>(
        tx,
        sql`select * from justgo.device_transfers where id=${row.id} for update`,
      ))!;
      await this.liveTransfer(tx, row);
      if (row.redeemed_at || (row.user_id && row.user_id !== session.userId))
        return fail('CONFLICT', 409);
      if (!this.matchesVerification(row, verification)) {
        // Commit failed attempts even when approval is rejected. Bound guessing across
        // addresses/accounts/API instances, in addition to the HTTP rate limiter.
        await tx.execute(
          sql`update justgo.device_transfers set
            verification_attempts=least(verification_attempts+1,5),
            cancelled_at=case when verification_attempts>=4 then now() else cancelled_at end
            where id=${row.id}`,
        );
        return false;
      }
      await tx.execute(
        sql`update justgo.device_transfers set user_id=${session.userId},approved_at=coalesce(approved_at,now()) where id=${row.id}`,
      );
      return true;
    });
    if (!approved) return fail('CONFLICT', 409);
    return { ok: true as const };
  }
  cancelTransfer(token: string, id: string, code: string) {
    return this.withSession(token, async (tx, session) => {
      const found = await this.transfer(tx, code);
      const row = (await one<TransferRow>(
        tx,
        sql`select * from justgo.device_transfers where id=${found.id} for update`,
      ))!;
      if (row.id !== id || row.user_id !== session.userId || row.redeemed_at)
        return fail('NOT_FOUND', 404);
      await tx.execute(
        sql`update justgo.device_transfers set cancelled_at=now() where id=${row.id}`,
      );
      return { ok: true as const };
    });
  }
  cancelReceivingTransfer(input: TransferStart) {
    return this.db.transaction(async (tx) => {
      const codeHash = digest(input.code);
      await context(tx, 'app.transfer_digest', codeHash);
      // Serialize with creation too: cancellation may arrive before a delayed POST.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${codeHash},1))`,
      );
      const row = await one<TransferRow>(
        tx,
        sql`select * from justgo.device_transfers where code_digest=${codeHash} for update`,
      );
      if (!row) {
        await this.createTransfer(tx, input, true);
        return { status: 'cancelled' as const };
      }
      if (!this.matchesTransfer(row, input)) fail('CREDENTIAL_REJECTED');
      if (row.redeemed_at) return { status: 'redeemed' as const };
      await tx.execute(
        sql`update justgo.device_transfers set cancelled_at=coalesce(cancelled_at,now()) where id=${row.id}`,
      );
      return { status: 'cancelled' as const };
    });
  }
  async redeemTransfer(code: string, claimSecret: string) {
    return this.db.transaction(async (tx) => {
      let row = await this.transfer(tx, code);
      if (row.claim_digest !== digest(claimSecret))
        return fail('CREDENTIAL_REJECTED');
      if (!row.user_id) {
        await this.liveTransfer(tx, row);
        return fail('TRANSFER_PENDING', 409);
      }
      await this.owner(tx, row.user_id);
      row = (await one<TransferRow>(
        tx,
        sql`select * from justgo.device_transfers where id=${row.id} for update`,
      ))!;
      await this.liveTransfer(tx, row);
      if (!row.approved_at || row.cancelled_at)
        return fail('CREDENTIAL_REJECTED');
      // Exact claimant retries recover the same session, never a second redemption.
      if (!row.redeemed_at) {
        await tx.execute(
          sql`insert into justgo.recovery_credentials (id,user_id,digest,kind) values (${randomUUID()},${row.user_id},${row.credential_digest},'sync')`,
        );
      }
      const issued = await this.issue(
        tx,
        row.user_id!,
        {
          deviceId: row.device_id,
          sessionId: row.session_id,
          sessionToken: '',
        },
        row.session_digest,
      );
      await tx.execute(
        sql`update justgo.device_transfers set redeemed_at=coalesce(redeemed_at,now()) where id=${row.id}`,
      );
      return issued;
    });
  }
  // Phase 08 will call this within its confirmed deletion flow before removing private content.
  retireAccount(token: string) {
    return this.withSession(token, async (tx, session) => {
      await tx.execute(
        sql`update justgo.users set deleted_at=now() where id=${session.userId}`,
      );
      await tx.execute(
        sql`update justgo.recovery_credentials set revoked_at=coalesce(revoked_at,now())`,
      );
      await tx.execute(
        sql`update justgo.device_sessions set revoked_at=coalesce(revoked_at,now())`,
      );
      await tx.execute(
        sql`update justgo.device_transfers set cancelled_at=coalesce(cancelled_at,now()) where user_id=${session.userId}`,
      );
    });
  }
}
