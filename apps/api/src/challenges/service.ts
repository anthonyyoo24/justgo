import { sql, type SQL } from 'drizzle-orm';
import {
  hasVerifiedAccess,
  type Attempt,
  type ChallengeCard,
  type ChallengeQueue,
  type Venue,
} from '@justgo/contracts';
import type { z } from 'zod';
import type {
  finishAttemptSchema,
  skipChallengeSchema,
  startAttemptSchema,
} from '@justgo/contracts';
import { IdentityError, type IdentityService } from '../identity/service.js';
import type { EntitlementReader } from '../access/service.js';
type Tx = Parameters<Parameters<IdentityService['withSession']>[1]>[0];
type Row = Record<string, unknown>;
const one = async <T extends Row>(tx: Tx, query: SQL) =>
  (await tx.execute<T>(query)).rows[0];
const conflict = (): never => {
  throw new IdentityError('CONFLICT', 409);
};
const serverNow = async (tx: Tx) => {
  const row = (await one<{ at: Date | string }>(
    tx,
    sql`select clock_timestamp() as at`,
  ))!;
  return new Date(row.at).toISOString();
};
type Selection = {
  venue: Venue;
  cardId: string;
  revisionId: string;
  queueVersion: number;
};
type AttemptRow = Row & {
  id: string;
  card_id: string;
  venue_id: Venue;
  revision_id: string;
  challenge_id: string;
  level_id: 'level-1';
  text: string;
  duration_seconds: number;
  status: Attempt['status'];
  started_at: Date;
  deadline_at: Date;
  ended_at: Date | null;
  completion_date: string | null;
  time_zone: string | null;
  elapsed_seconds: number | null;
  queue_version: number;
};
const attempt = (r: AttemptRow): Attempt => ({
  id: r.id,
  card: {
    id: r.card_id,
    venue: r.venue_id,
    revisionId: r.revision_id,
    challengeId: r.challenge_id,
    levelId: r.level_id,
    text: r.text,
    durationSeconds: r.duration_seconds,
  },
  status: r.status,
  startedAt: new Date(r.started_at).toISOString(),
  deadlineAt: new Date(r.deadline_at).toISOString(),
  endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
  completionDate: r.completion_date,
  timeZone: r.time_zone,
  elapsedSeconds: r.elapsed_seconds,
});
const attemptQuery = sql`select a.*, r.text, r.duration_seconds from justgo.attempts a join justgo.challenge_revisions r on r.id=a.revision_id`;
export class ChallengeService {
  constructor(
    private readonly identity: IdentityService,
    private readonly entitlement?: EntitlementReader,
  ) {}
  private run<T>(token: string, work: (tx: Tx, userId: string) => Promise<T>) {
    return this.identity.withSession(token, async (tx, session) => {
      // All domain mutations serialize on the same owner, including different devices.
      // Identity owns/rechecks the user lock before this callback.
      await tx.execute(
        sql`select id from justgo.users where id=${session.userId} for update`,
      );
      const access = await this.entitlement?.(tx);
      if (!hasVerifiedAccess(access))
        throw new IdentityError(
          access?.status === 'unpaid' ? 'ACCESS_REQUIRED' : 'UNAVAILABLE',
          access?.status === 'unpaid' ? 403 : 503,
        );
      return work(tx, session.userId);
    });
  }
  private async queue(
    tx: Tx,
    userId: string,
    venue: Venue,
  ): Promise<ChallengeQueue> {
    const cards = (
      await tx.execute<ChallengeCard & Row>(sql`
      select c.id, c.venue_id as venue, r.id as "revisionId", r.challenge_id as "challengeId", r.level_id as "levelId", r.text, r.duration_seconds as "durationSeconds"
      from justgo.venue_cards c join justgo.challenge_revisions r on r.id=c.revision_id where c.venue_id=${venue} order by c.position`)
    ).rows;
    await tx.execute(
      sql`insert into justgo.venue_queues(user_id,venue_id,card_ids) values (${userId},${venue},array(select jsonb_array_elements_text(${JSON.stringify(cards.map((c) => c.id))}::jsonb))) on conflict do nothing`,
    );
    const saved = (await one<{ card_ids: string[]; version: number }>(
      tx,
      sql`select card_ids,version from justgo.venue_queues where user_id=${userId} and venue_id=${venue}`,
    ))!;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const ordered = [
      ...saved.card_ids.filter((id) => byId.has(id)),
      ...cards.map((c) => c.id).filter((id) => !saved.card_ids.includes(id)),
    ];
    return {
      venue,
      version: saved.version,
      cards: ordered.map((id) => byId.get(id)!),
    };
  }
  private async advance(tx: Tx, userId: string, venue: Venue, cardId: string) {
    const queue = await this.queue(tx, userId, venue);
    const ids = queue.cards.map((c) => c.id).filter((id) => id !== cardId);
    if (queue.cards.some((c) => c.id === cardId)) ids.push(cardId);
    await tx.execute(
      sql`update justgo.venue_queues set card_ids=array(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)),version=version+1 where user_id=${userId} and venue_id=${venue}`,
    );
    return this.queue(tx, userId, venue);
  }
  private async selected(tx: Tx, userId: string, input: Selection) {
    const queue = await this.queue(tx, userId, input.venue);
    const card = queue.cards[0];
    if (
      queue.version !== input.queueVersion ||
      card?.id !== input.cardId ||
      card.revisionId !== input.revisionId
    )
      conflict();
    if (
      await one(
        tx,
        sql`select id from justgo.attempts where user_id=${userId} and status='active'`,
      )
    )
      conflict();
    return card!;
  }
  private async readAttempt(tx: Tx, userId: string, id: string) {
    return one<AttemptRow>(
      tx,
      sql`${attemptQuery} where a.user_id=${userId} and a.id=${id}`,
    );
  }
  state(token: string) {
    return this.run(token, async (tx, userId) => {
      const preference = await one<{ venue_id: Venue }>(
        tx,
        sql`select venue_id from justgo.challenge_preferences where user_id=${userId}`,
      );
      const active = await one<AttemptRow>(
        tx,
        sql`${attemptQuery} where a.user_id=${userId} and a.status='active'`,
      );
      const latest = await one<AttemptRow>(
        tx,
        sql`${attemptQuery} where a.user_id=${userId} and a.status<>'active' order by a.ended_at desc,a.id limit 1`,
      );
      return {
        selectedVenue: preference?.venue_id ?? 'streets',
        active: active ? attempt(active) : null,
        latestOutcome: latest ? attempt(latest) : null,
        serverNow: await serverNow(tx),
      };
    });
  }
  getQueue(token: string, venue: Venue) {
    return this.run(token, (tx, userId) => this.queue(tx, userId, venue));
  }
  selectVenue(token: string, venue: Venue) {
    return this.run(token, async (tx, userId) => {
      await tx.execute(
        sql`insert into justgo.challenge_preferences(user_id,venue_id) values (${userId},${venue}) on conflict(user_id) do update set venue_id=excluded.venue_id`,
      );
      return { ok: true as const };
    });
  }
  getAttempt(token: string, id: string) {
    return this.run(token, async (tx, userId) => {
      const row = await this.readAttempt(tx, userId, id);
      if (!row) throw new IdentityError('NOT_FOUND', 404);
      return { attempt: attempt(row), serverNow: await serverNow(tx) };
    });
  }
  skip(token: string, input: z.infer<typeof skipChallengeSchema>) {
    return this.run(token, async (tx, userId) => {
      const old = await one<{
        card_id: string;
        venue_id: string;
        revision_id: string;
        queue_version: number;
      }>(
        tx,
        sql`select * from justgo.deck_skips where user_id=${userId} and id=${input.actionId}`,
      );
      if (old) {
        if (
          old.card_id !== input.cardId ||
          old.venue_id !== input.venue ||
          old.revision_id !== input.revisionId ||
          old.queue_version !== input.queueVersion
        )
          conflict();
        return this.queue(tx, userId, input.venue);
      }
      await this.selected(tx, userId, input);
      await tx.execute(
        sql`insert into justgo.deck_skips(user_id,id,venue_id,card_id,revision_id,queue_version) values (${userId},${input.actionId},${input.venue},${input.cardId},${input.revisionId},${input.queueVersion})`,
      );
      return this.advance(tx, userId, input.venue, input.cardId);
    });
  }
  start(token: string, input: z.infer<typeof startAttemptSchema>) {
    return this.run(token, async (tx, userId) => {
      const old = await this.readAttempt(tx, userId, input.attemptId);
      if (old) {
        if (
          old.card_id !== input.cardId ||
          old.venue_id !== input.venue ||
          old.revision_id !== input.revisionId ||
          old.queue_version !== input.queueVersion
        )
          conflict();
        return { attempt: attempt(old), serverNow: await serverNow(tx) };
      }
      const card = await this.selected(tx, userId, input);
      await tx.execute(sql`with beginning as (select clock_timestamp() as at) insert into justgo.attempts(user_id,id,card_id,venue_id,challenge_id,revision_id,level_id,queue_version,started_at,deadline_at)
        select ${userId},${input.attemptId},${card.id},${card.venue},${card.challengeId},${card.revisionId},${card.levelId},${input.queueVersion},beginning.at,beginning.at+${card.durationSeconds}*interval '1 second' from beginning`);
      return {
        attempt: attempt(
          (await this.readAttempt(tx, userId, input.attemptId))!,
        ),
        serverNow: await serverNow(tx),
      };
    });
  }
  finish(token: string, input: z.infer<typeof finishAttemptSchema>) {
    return this.run(token, async (tx, userId) => {
      const old = await this.readAttempt(tx, userId, input.attemptId);
      if (!old) throw new IdentityError('NOT_FOUND', 404);
      if (old.status !== 'active') {
        if (old.status !== input.outcome || old.time_zone !== input.timeZone)
          conflict();
        return { attempt: attempt(old), serverNow: await serverNow(tx) };
      }
      // One DB timestamp freezes local day and duration, including time after zero.
      await tx.execute(sql`with ending as (select clock_timestamp() as at)
        update justgo.attempts set status=${input.outcome},ended_at=ending.at,time_zone=${input.timeZone},
        completion_date=case when ${input.outcome}='completed' then to_char(ending.at at time zone ${input.timeZone},'YYYY-MM-DD') else null end,
        elapsed_seconds=greatest(0,floor(extract(epoch from ending.at-started_at)))::integer
        from ending where user_id=${userId} and id=${input.attemptId}`);
      await this.advance(tx, userId, old.venue_id, old.card_id);
      return {
        attempt: attempt(
          (await this.readAttempt(tx, userId, input.attemptId))!,
        ),
        serverNow: await serverNow(tx),
      };
    });
  }
}
