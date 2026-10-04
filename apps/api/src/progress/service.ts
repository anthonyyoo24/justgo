import { sql, type SQL } from 'drizzle-orm';
import {
  FEELING_SCALE_VERSION,
  hasVerifiedAccess,
  type LegacyProgressDayResponse,
  type LegacyProgressEntry,
  type LegacyProgressResponse,
} from '@justgo/contracts';
import { z } from 'zod';
import { IdentityError, type IdentityService } from '../identity/service.js';
import type { EntitlementReader } from '../access/service.js';

type Tx = Parameters<Parameters<IdentityService['withSession']>[1]>[0];
type Row = Record<string, unknown>;
const one = async <T extends Row>(tx: Tx, query: SQL) =>
  (await tx.execute<T>(query)).rows[0];
const cursorShape = z.tuple([z.iso.date(), z.string().min(1), z.uuid()]);
type DayCursor = z.infer<typeof cursorShape>;
const decodeCursor = (value: string, date: string): DayCursor => {
  try {
    const parsed = cursorShape.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    if (parsed[0] !== date || Number.isNaN(Date.parse(parsed[1])))
      throw new Error('Invalid cursor');
    return parsed;
  } catch {
    throw new IdentityError('INVALID_REQUEST', 400);
  }
};
const encodeCursor = (date: string, at: string, id: string) =>
  Buffer.from(JSON.stringify([date, at, id])).toString('base64url');

type DayRow = Row & {
  id: string;
  ended_at: Date | string | null;
  started_at: Date | string;
  cursor_ended_at: string;
  time_zone: string;
  card_id: string | null;
  venue_id: LegacyProgressEntry['venue'];
  challenge_id: string;
  revision_id: string | null;
  level_id: 'level-1';
  instruction: string;
  reflection_status: LegacyProgressEntry['reflectionStatus'];
  feeling_version: 1 | null;
  feeling: LegacyProgressEntry['feeling'];
  reflection_text: string | null;
};
const entry = (r: DayRow): LegacyProgressEntry => ({
  attemptId: r.id,
  completedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
  ...(r.ended_at ? {} : { activityAt: new Date(r.started_at).toISOString() }),
  timeZone: r.time_zone,
  cardId: r.card_id,
  venue: r.venue_id,
  challengeId: r.challenge_id,
  revisionId: r.revision_id,
  levelId: r.level_id,
  instruction: r.instruction,
  feelingVersion: r.feeling_version ?? FEELING_SCALE_VERSION,
  reflectionStatus: r.reflection_status,
  feeling: r.reflection_status === 'submitted' ? r.feeling : null,
  reflectionText:
    r.reflection_status === 'submitted' ? r.reflection_text : null,
});

export class ProgressService {
  constructor(
    private readonly identity: IdentityService,
    private readonly entitlement?: EntitlementReader,
  ) {}
  private run<T>(token: string, work: (tx: Tx, userId: string) => Promise<T>) {
    return this.identity.withSession(token, async (tx, session) => {
      const access = await this.entitlement?.(tx);
      if (!hasVerifiedAccess(access))
        throw new IdentityError(
          access?.status === 'unpaid' ? 'ACCESS_REQUIRED' : 'UNAVAILABLE',
          access?.status === 'unpaid' ? 403 : 503,
        );
      return work(tx, session.userId);
    });
  }
  summary(token: string, month: string, timeZone: string) {
    return this.run(
      token,
      async (tx, userId): Promise<LegacyProgressResponse> => {
        const today = (await one<{ date: string }>(
          tx,
          sql`select to_char(transaction_timestamp() at time zone ${timeZone}, 'YYYY-MM-DD') as date`,
        ))!.date;
        const totals = (await one<{
          total_reps: number;
          current_streak: number;
          best_streak: number;
        }>(
          tx,
          sql`with active_days as (
          select coalesce(activity_date,completion_date)::date as day
          from justgo.attempts
          where user_id=${userId} and status='completed'
          group by coalesce(activity_date,completion_date)
        ), islands as (
          select day, day - row_number() over (order by day)::integer as run_id
          from active_days
        ), runs as (
          select max(day) as last_day, count(*)::integer as length
          from islands group by run_id
        ), current_runs as (
          select max(day) as last_day, count(*)::integer as length
          from islands where day<=${today}::date group by run_id
        )
        select
          (select count(*)::integer from justgo.attempts where user_id=${userId} and status='completed') as total_reps,
          coalesce((select max(length) from current_runs where last_day in (${today}::date, ${today}::date - 1)),0)::integer as current_streak,
          coalesce((select max(length) from runs),0)::integer as best_streak`,
        ))!;
        const days = (
          await tx.execute<{ date: string; reps: number }>(sql`
          select coalesce(activity_date,completion_date) as date, count(*)::integer as reps
          from justgo.attempts
          where user_id=${userId} and status='completed'
            and coalesce(activity_date,completion_date) >= ${month + '-01'}
            and coalesce(activity_date,completion_date) < to_char((${month + '-01'}::date + interval '1 month'), 'YYYY-MM-DD')
          group by coalesce(activity_date,completion_date) order by coalesce(activity_date,completion_date)`)
        ).rows;
        return {
          month,
          today,
          currentStreak: totals.current_streak,
          bestStreak: totals.best_streak,
          totalReps: totals.total_reps,
          monthlyReps: days.reduce((sum, day) => sum + day.reps, 0),
          activeDays: days.length,
          days: [...days],
        };
      },
    );
  }
  day(token: string, date: string, limit: number, encodedCursor?: string) {
    const cursor = encodedCursor ? decodeCursor(encodedCursor, date) : null;
    return this.run(
      token,
      async (tx, userId): Promise<LegacyProgressDayResponse> => {
        const totals = (await one<{
          total_reps: number;
        }>(
          tx,
          sql`select count(*)::integer as total_reps
          from justgo.attempts
          where user_id=${userId} and status='completed' and coalesce(activity_date,completion_date)=${date}`,
        ))!;
        const rows = (
          await tx.execute<DayRow>(sql`
          select a.id,a.ended_at,a.started_at,coalesce(a.ended_at,a.started_at)::text as cursor_ended_at,
            coalesce(a.start_time_zone,a.legacy_display_time_zone,a.time_zone) as time_zone,
            a.card_id,a.venue_id,a.challenge_id,a.revision_id,a.level_id,
            coalesce(cr.text,c.text) as instruction,
            case when a.reflection_revision>0 then 'submitted' else coalesce(r.status,'none') end as reflection_status,
            r.feeling_version,
            case when a.reflection_revision>0 then a.reflection_feeling when r.status='submitted' then r.feeling end as feeling,
            case when a.reflection_revision>0 then a.reflection_text when r.status='submitted' then r.reflection_text end as reflection_text
          from justgo.attempts a
          join justgo.challenges c on c.id=a.challenge_id
          left join justgo.challenge_revisions cr on cr.id=a.revision_id
          left join justgo.reflections r on r.user_id=a.user_id and r.attempt_id=a.id
          where a.user_id=${userId} and a.status='completed' and coalesce(a.activity_date,a.completion_date)=${date}
          ${cursor ? sql`and (coalesce(a.ended_at,a.started_at),a.id) > (${cursor[1]}::timestamptz,${cursor[2]}::uuid)` : sql``}
          order by coalesce(a.ended_at,a.started_at),a.id limit ${limit + 1}`)
        ).rows;
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
          date,
          totalReps: totals.total_reps,
          entries: page.map(entry),
          nextCursor:
            rows.length > limit && last
              ? encodeCursor(date, last.cursor_ended_at, last.id)
              : null,
        };
      },
    );
  }
}
