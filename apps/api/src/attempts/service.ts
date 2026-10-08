import { sql } from 'drizzle-orm';
import type { CreateAttempt } from '@justgo/contracts';
import { IdentityError, type IdentityService } from '../identity/service.js';
import { projectAttempt, readAttempt, type Tx } from './model.js';
// Phase 07A supplies a database-backed projection of verified coverage at startedAt.
// Never perform provider network I/O inside this transaction or trust a phone premium flag.
export type UploadEligibilityReader = (
  tx: Tx,
  context: { userId: string; startedAt: string },
) => Promise<'eligible' | 'ineligible' | 'unavailable'>;
export const FUTURE_START_TOLERANCE_MS = 5 * 60_000;
export class AttemptService {
  constructor(
    private readonly identity: IdentityService,
    private readonly eligibility?: UploadEligibilityReader,
    private readonly now: () => number = Date.now,
  ) {}
  create(token: string, input: CreateAttempt) {
    return this.identity.withSession(token, async (tx, session) => {
      const old = await readAttempt(tx, session.userId, input.id);
      if (old) {
        const sameStart = (
          await tx.execute<{ same: boolean }>(
            sql`select started_at=${input.startedAt}::timestamptz as same from justgo.attempts where user_id=${session.userId} and id=${input.id}`,
          )
        ).rows[0]!.same;
        if (
          old.challenge_id !== input.challengeId ||
          old.venue_id !== input.venue ||
          !sameStart ||
          old.start_time_zone !== input.startTimeZone
        )
          throw new IdentityError('CONFLICT', 409);
        return { attempt: projectAttempt(old), created: false };
      }
      if (Date.parse(input.startedAt) > this.now() + FUTURE_START_TOLERANCE_MS)
        throw new IdentityError('INVALID_REQUEST', 400);
      const eligible = await this.eligibility?.(tx, {
        userId: session.userId,
        startedAt: input.startedAt,
      });
      if (eligible !== 'eligible')
        throw new IdentityError(
          eligible === 'ineligible' ? 'ATTEMPT_INELIGIBLE' : 'UNAVAILABLE',
          eligible === 'ineligible' ? 403 : 503,
        );
      // Historical placement membership remains valid after catalog deactivation or wording edits.
      const card = (
        await tx.execute<{
          level_id: string;
        }>(sql`select c.level_id from justgo.challenges c
        where c.id=${input.challengeId} and c.level_id='level-1' and exists(select 1 from justgo.venue_cards v where v.challenge_id=c.id and v.venue_id=${input.venue})`)
      ).rows[0];
      if (!card) throw new IdentityError('INVALID_REQUEST', 400);
      await tx.execute(sql`insert into justgo.attempts(user_id,id,challenge_id,venue_id,level_id,started_at,start_time_zone,activity_date)
        values(${session.userId},${input.id},${input.challengeId},${input.venue},${card.level_id},${input.startedAt}::timestamptz,${input.startTimeZone},
        to_char(${input.startedAt}::timestamptz at time zone ${input.startTimeZone},'YYYY-MM-DD'))`);
      return {
        attempt: projectAttempt(
          (await readAttempt(tx, session.userId, input.id))!,
        ),
        created: true,
      };
    });
  }
}
