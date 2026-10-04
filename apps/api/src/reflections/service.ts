import { createHash } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import {
  FEELING_SCALE_VERSION,
  hasVerifiedAccess,
  type LegacyReflectionResponse,
  type LegacyReflectionSkip,
  type LegacyReflectionWrite,
} from '@justgo/contracts';
import { IdentityError, type IdentityService } from '../identity/service.js';
import { readAttempt, projectAttempt } from '../attempts/model.js';
import type { EntitlementReader } from '../access/service.js';

type Tx = Parameters<Parameters<IdentityService['withSession']>[1]>[0];
type Row = Record<string, unknown>;
const one = async <T extends Row>(tx: Tx, query: SQL) =>
  (await tx.execute<T>(query)).rows[0];
type ReflectionRow = Row & {
  attempt_id: string;
  revision: number;
  status: 'draft' | 'submitted' | 'skipped';
  feeling_version: 1;
  feeling: LegacyReflectionResponse['feeling'];
  reflection_text: string | null;
  input_method: 'typed' | null;
  updated_at: Date | string;
};
type ReceiptRow = Row & {
  attempt_id: string;
  action: 'draft' | 'final' | 'skip';
  input_digest: string;
  response: LegacyReflectionResponse;
};
const conflict = (): never => {
  throw new IdentityError('CONFLICT', 409);
};
const response = (
  attemptId: string,
  row?: ReflectionRow,
): LegacyReflectionResponse =>
  row
    ? {
        attemptId,
        revision: row.revision,
        status: row.status,
        feelingVersion: row.feeling_version,
        feeling: row.feeling,
        text: row.reflection_text,
        inputMethod: row.input_method,
        updatedAt: new Date(row.updated_at).toISOString(),
      }
    : {
        attemptId,
        revision: 0,
        status: 'none',
        feelingVersion: FEELING_SCALE_VERSION,
        feeling: null,
        text: null,
        inputMethod: null,
        updatedAt: null,
      };
const normalizedText = (value: string | null) => (value?.trim() ? value : null);

export class ReflectionService {
  constructor(
    private readonly identity: IdentityService,
    private readonly entitlement?: EntitlementReader,
  ) {}
  private run<T>(token: string, work: (tx: Tx, userId: string) => Promise<T>) {
    return this.identity.withSession(token, async (tx, session) => {
      // Identity already owns this row lock; all owner writes serialize here.
      const access = await this.entitlement?.(tx);
      if (!hasVerifiedAccess(access))
        throw new IdentityError(
          access?.status === 'unpaid' ? 'ACCESS_REQUIRED' : 'UNAVAILABLE',
          access?.status === 'unpaid' ? 403 : 503,
        );
      return work(tx, session.userId);
    });
  }
  private async completed(tx: Tx, userId: string, attemptId: string) {
    const attempt = await one<{ status: string }>(
      tx,
      sql`select status from justgo.attempts where user_id=${userId} and id=${attemptId}`,
    );
    if (!attempt) throw new IdentityError('NOT_FOUND', 404);
    if (attempt.status !== 'completed') conflict();
  }
  private read(tx: Tx, userId: string, attemptId: string) {
    return one<ReflectionRow>(
      tx,
      sql`select * from justgo.reflections where user_id=${userId} and attempt_id=${attemptId}`,
    );
  }
  get(token: string, attemptId: string) {
    return this.run(token, async (tx, userId) => {
      await this.completed(tx, userId, attemptId);
      const old = await this.read(tx, userId, attemptId);
      const canonical = projectAttempt(
        (await readAttempt(tx, userId, attemptId))!,
      );
      if (
        !canonical.reflection ||
        (old?.status === 'submitted' &&
          old.revision === canonical.reflection.revision)
      )
        return response(attemptId, old);
      return {
        attemptId,
        revision: canonical.reflection.revision,
        status: 'submitted' as const,
        feelingVersion: FEELING_SCALE_VERSION,
        feeling: canonical.reflection.feeling,
        text: canonical.reflection.text,
        inputMethod: canonical.reflection.text ? ('typed' as const) : null,
        updatedAt: null,
      };
    });
  }
  write(
    token: string,
    attemptId: string,
    action: 'draft' | 'final' | 'skip',
    input: LegacyReflectionWrite | LegacyReflectionSkip,
  ) {
    return this.run(token, async (tx, userId) => {
      await this.completed(tx, userId, attemptId);
      const feeling =
        action === 'skip' ? null : (input as LegacyReflectionWrite).feeling;
      const text =
        action === 'skip'
          ? null
          : normalizedText((input as LegacyReflectionWrite).text);
      const digest = createHash('sha256')
        .update(
          JSON.stringify([
            attemptId,
            action,
            input.expectedRevision,
            feeling,
            text,
          ]),
        )
        .digest('hex');
      const receipt = await one<ReceiptRow>(
        tx,
        sql`select * from justgo.reflection_actions where user_id=${userId} and id=${input.actionId}`,
      );
      if (receipt) {
        if (
          receipt.attempt_id !== attemptId ||
          receipt.action !== action ||
          receipt.input_digest !== digest
        )
          conflict();
        return receipt.response;
      }
      const old = await this.read(tx, userId, attemptId);
      if ((await readAttempt(tx, userId, attemptId))!.reflection_revision > 0)
        conflict();
      if ((old?.revision ?? 0) !== input.expectedRevision) conflict();
      if (old && old.status !== 'draft') conflict();
      if (action === 'final' && !feeling && !text)
        throw new IdentityError('INVALID_REQUEST', 400);
      const status =
        action === 'final'
          ? 'submitted'
          : action === 'skip'
            ? 'skipped'
            : 'draft';
      const saved = old
        ? await one<ReflectionRow>(
            tx,
            sql`update justgo.reflections set revision=revision+1,status=${status},feeling=${feeling},reflection_text=${text},input_method=${text ? 'typed' : null},updated_at=clock_timestamp() where user_id=${userId} and attempt_id=${attemptId} returning *`,
          )
        : await one<ReflectionRow>(
            tx,
            sql`insert into justgo.reflections (user_id,attempt_id,status,feeling,reflection_text,input_method,updated_at) values (${userId},${attemptId},${status},${feeling},${text},${text ? 'typed' : null},clock_timestamp()) returning *`,
          );
      if (action === 'final')
        await tx.execute(
          sql`update justgo.attempts set reflection_feeling=${saved!.feeling},reflection_text=${saved!.reflection_text},reflection_revision=${saved!.revision} where user_id=${userId} and id=${attemptId}`,
        );
      const result = response(attemptId, saved);
      await tx.execute(
        sql`insert into justgo.reflection_actions (user_id,id,attempt_id,action,input_digest,response) values (${userId},${input.actionId},${attemptId},${action},${digest},${JSON.stringify(result)}::jsonb)`,
      );
      return result;
    });
  }
}
