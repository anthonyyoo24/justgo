import { sql } from 'drizzle-orm';
import { type Attempt } from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
export type Tx = Parameters<Parameters<IdentityService['withSession']>[1]>[0];
export type AttemptRow = Record<string, unknown> & {
  id: string;
  challenge_id: string;
  venue_id: Attempt['venue'];
  level_id: 'level-1';
  instruction: string;
  started_at: Date | string;
  cursor_started_at: string;
  start_time_zone: string | null;
  legacy_display_time_zone: string | null;
  activity_date: string;
  reflection_feeling: NonNullable<Attempt['reflection']>['feeling'];
  reflection_text: string | null;
  reflection_revision: number;
};
export const attemptQuery = sql`select a.*, to_char(a.started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_started_at,c.text as instruction from justgo.attempts a join justgo.challenges c on c.id=a.challenge_id`;
/**
 * Project stored history without losing start-time precision or date attribution.
 * Unknown legacy start zones retain their recorded display zone; revision zero
 * represents an absent reflection rather than a draft.
 */
export const projectAttempt = (row: AttemptRow): Attempt => ({
  id: row.id,
  challengeId: row.challenge_id,
  venue: row.venue_id,
  levelId: row.level_id,
  instruction: row.instruction,
  // pg's Date parser drops microseconds. Preserve the stored instant in wire data.
  startedAt: row.cursor_started_at.replace(/(\.\d{3})000Z$/, '$1Z'),
  startTimeZone: row.start_time_zone,
  displayTimeZone: (row.start_time_zone ?? row.legacy_display_time_zone)!,
  activityDate: row.activity_date,
  reflection:
    row.reflection_revision === 0
      ? null
      : {
          feeling: row.reflection_feeling,
          text: row.reflection_text,
          revision: row.reflection_revision,
        },
});
/**
 * Read an attempt within the supplied owner transaction.
 * The explicit owner predicate is retained alongside database row-level security.
 */
export const readAttempt = async (tx: Tx, userId: string, id: string) =>
  (
    await tx.execute<AttemptRow>(
      sql`${attemptQuery} where a.user_id=${userId} and a.id=${id}`,
    )
  ).rows[0];
