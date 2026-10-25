import { sql } from 'drizzle-orm';
import type {
  CompletionAttempt,
  CompletionRestoreRequest,
} from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
import { ApiError } from '../http/api-error.js';
import {
  attemptQuery,
  projectCompletion,
  readAttempt,
  type CompletionRow,
  type Tx,
} from '../attempts/model.js';
import { validateHistoricalContext } from './context.js';
import {
  readDataEpoch,
  requireDataEpoch,
  rejectDeletedCompletion,
} from './epoch.js';

async function sameCompletion(
  tx: Tx,
  userId: string,
  input: CompletionAttempt,
  old: CompletionAttempt,
) {
  const sameInstant =
    (
      await tx.execute<{ same: boolean }>(
        sql`select started_at=${input.startedAt}::timestamptz as same from justgo.attempts where user_id=${userId} and id=${input.id}`,
      )
    ).rows[0]?.same === true;
  return (
    sameInstant &&
    old.challengeId === input.challengeId &&
    old.venue === input.venue &&
    old.levelId === input.levelId &&
    old.instruction === input.instruction &&
    old.activityDate === input.activityDate &&
    old.startTimeZone === input.startTimeZone &&
    old.displayTimeZone === input.displayTimeZone
  );
}
export class CompletionRestoreService {
  constructor(
    private readonly identity: IdentityService,
    private readonly now: () => number = Date.now,
  ) {}
  restore(token: string, input: CompletionRestoreRequest) {
    return this.identity.withSession(token, async (tx, session) => {
      const dataEpoch = await requireDataEpoch(
        tx,
        session.userId,
        input.expectedEpoch,
      );
      if (
        new Set(input.attempts.map((attempt) => attempt.id)).size !==
        input.attempts.length
      )
        throw new ApiError('INVALID_REQUEST', 400);
      let added = 0;
      const attempts: CompletionAttempt[] = [];
      for (const attempt of input.attempts) {
        if (!input.restoreDeleted)
          await rejectDeletedCompletion(tx, session.userId, attempt.id);
        const old = await readAttempt(tx, session.userId, attempt.id);
        if (old) {
          const current = projectCompletion(old);
          if (!(await sameCompletion(tx, session.userId, attempt, current)))
            throw new ApiError('CONFLICT', 409);
          attempts.push(current);
          continue;
        }
        validateHistoricalContext(attempt, this.now());
        // Historical membership, including inactive placements, is valid; requests cannot create catalog entries.
        const card = (
          await tx.execute(
            sql`select c.id from justgo.challenges c where c.id=${attempt.challengeId} and c.level_id=${attempt.levelId} and exists(select 1 from justgo.venue_cards v where v.challenge_id=c.id and v.venue_id=${attempt.venue})`,
          )
        ).rows[0];
        if (!card) throw new ApiError('INVALID_REQUEST', 400);
        // One budget entry per bounded batch; fully identical retries stay available.
        if (added === 0)
          await this.identity.rateLimitAccount(tx, session.userId, 'write');
        await tx.execute(
          sql`insert into justgo.attempts(user_id,id,challenge_id,venue_id,level_id,started_at,start_time_zone,legacy_display_time_zone,instruction_snapshot,activity_date) values(${session.userId},${attempt.id},${attempt.challengeId},${attempt.venue},${attempt.levelId},${attempt.startedAt}::timestamptz,${attempt.startTimeZone},${attempt.startTimeZone === null ? attempt.displayTimeZone : null},${attempt.instruction},${attempt.activityDate})`,
        );
        const inserted = await readAttempt(tx, session.userId, attempt.id);
        if (!inserted) throw new ApiError('UNAVAILABLE', 503);
        attempts.push(projectCompletion(inserted));
        added++;
      }
      return { dataEpoch, attempts, added, identical: attempts.length - added };
    });
  }
  page(token: string, cursor: string | undefined, limit: number) {
    return this.identity.withSession(token, async (tx, session) => {
      await this.identity.rateLimitAccount(tx, session.userId, 'export');
      const rows = (
        await tx.execute<CompletionRow>(
          sql`${attemptQuery} where a.user_id=${session.userId} ${cursor ? sql`and a.id>${cursor}::uuid` : sql``} order by a.id limit ${limit + 1}`,
        )
      ).rows;
      return {
        dataEpoch: await readDataEpoch(tx, session.userId),
        attempts: rows.slice(0, limit).map(projectCompletion),
        nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
      };
    });
  }
}
