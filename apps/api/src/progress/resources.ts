import { sql } from 'drizzle-orm';
import {
  hasVerifiedAccess,
  type ProgressSummary,
  type ProgressCalendar,
  type ProgressDayResponse,
} from '@justgo/contracts';
import { z } from 'zod';
import { IdentityError, type IdentityService } from '../identity/service.js';
import type { EntitlementReader } from '../access/service.js';
import {
  attemptQuery,
  projectAttempt,
  type AttemptRow,
  type Tx,
} from '../attempts/model.js';
const cursorSchema = z.tuple([z.iso.date(), z.iso.datetime(), z.uuid()]);
const decodeCursor = (value: string, date: string) => {
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    if (parsed[0] !== date) throw new Error();
    return parsed;
  } catch {
    throw new IdentityError('INVALID_REQUEST', 400);
  }
};
export class ProgressResources {
  constructor(
    private readonly identity: IdentityService,
    private readonly entitlement?: EntitlementReader,
  ) {}
  private run<T>(token: string, work: (tx: Tx, userId: string) => Promise<T>) {
    return this.identity.withSession(token, async (tx, session) => {
      // The owner lock also serializes creates/PATCHes across devices, so totals
      // and rows in these multi-query reads share one product-write boundary.
      const access = await this.entitlement?.(tx);
      if (!hasVerifiedAccess(access))
        throw new IdentityError(
          access?.status === 'unpaid' ? 'ACCESS_REQUIRED' : 'UNAVAILABLE',
          access?.status === 'unpaid' ? 403 : 503,
        );
      return work(tx, session.userId);
    });
  }
  summary(token: string, timeZone: string) {
    return this.run(token, async (tx, userId): Promise<ProgressSummary> => {
      const today = (
        await tx.execute<{ date: string }>(
          sql`select to_char(transaction_timestamp() at time zone ${timeZone},'YYYY-MM-DD') as date`,
        )
      ).rows[0]!.date;
      const month = today.slice(0, 7),
        first = month + '-01';
      const totals = (
        await tx.execute<{
          total_reps: number;
          current_streak: number;
          best_streak: number;
          preceding_run: number;
          best_before_month: number;
        }>(sql`
        with days as (select coalesce(activity_date,completion_date)::date as day from justgo.attempts where user_id=${userId} and status='completed' group by coalesce(activity_date,completion_date)),
        islands as (select day,day-row_number() over(order by day)::integer as run_id from days),
        runs as (select max(day) as last_day,count(*)::integer as length from islands group by run_id),
        current_runs as (select max(day) as last_day,count(*)::integer as length from islands where day<=${today}::date group by run_id),
        previous_runs as (select max(day) as last_day,count(*)::integer as length from islands where day<${first}::date group by run_id)
        select (select count(*)::integer from justgo.attempts where user_id=${userId} and status='completed') as total_reps,
        coalesce((select max(length) from current_runs where last_day in (${today}::date,${today}::date-1)),0)::integer as current_streak,
        coalesce((select max(length) from runs),0)::integer as best_streak,
        coalesce((select max(length) from previous_runs where last_day=${first}::date-1),0)::integer as preceding_run,
        coalesce((select max(length) from previous_runs),0)::integer as best_before_month`)
      ).rows[0]!;
      return {
        today,
        timeZone,
        totalReps: totals.total_reps,
        currentStreak: totals.current_streak,
        bestStreak: totals.best_streak,
        streakContext: {
          month,
          precedingRun: totals.preceding_run,
          bestBeforeMonth: totals.best_before_month,
        },
      };
    });
  }
  calendar(token: string, month: string) {
    return this.run(token, async (tx, userId): Promise<ProgressCalendar> => {
      const days = (
        await tx.execute<{
          date: string;
          reps: number;
        }>(sql`select coalesce(activity_date,completion_date) as date,count(*)::integer as reps from justgo.attempts
        where user_id=${userId} and status='completed' and coalesce(activity_date,completion_date)>=${month + '-01'} and coalesce(activity_date,completion_date)<to_char(${month + '-01'}::date+interval '1 month','YYYY-MM-DD')
        group by coalesce(activity_date,completion_date) order by coalesce(activity_date,completion_date)`)
      ).rows;
      return {
        month,
        monthlyReps: days.reduce((sum, day) => sum + day.reps, 0),
        activeDays: days.length,
        days: [...days],
      };
    });
  }
  day(token: string, date: string, limit: number, encodedCursor?: string) {
    const cursor = encodedCursor ? decodeCursor(encodedCursor, date) : null;
    return this.run(token, async (tx, userId): Promise<ProgressDayResponse> => {
      const total = (
        await tx.execute<{ count: number }>(
          sql`select count(*)::integer as count from justgo.attempts where user_id=${userId} and status='completed' and coalesce(activity_date,completion_date)=${date}`,
        )
      ).rows[0]!.count;
      const rows = (
        await tx.execute<AttemptRow>(sql`${attemptQuery} where a.user_id=${userId} and a.status='completed' and coalesce(a.activity_date,a.completion_date)=${date}
        ${cursor ? sql`and (a.started_at,a.id)>(${cursor[1]}::timestamptz,${cursor[2]}::uuid)` : sql``}
        order by a.started_at,a.id limit ${limit + 1}`)
      ).rows;
      const page = rows.slice(0, limit),
        last = page.at(-1);
      return {
        date,
        totalReps: total,
        entries: page.map(projectAttempt),
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(
                JSON.stringify([date, last.cursor_started_at, last.id]),
              ).toString('base64url')
            : null,
      };
    });
  }
}
