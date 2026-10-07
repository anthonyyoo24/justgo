import type {
  Attempt,
  ChallengeCard,
  CreateAttempt,
  PatchAttemptResponse,
} from '@justgo/contracts';
import { ApiError } from '../src/lib/http';
import type { JournalStorage } from '../src/data/activity/model';
import type { JournalTransport } from '../src/data/activity/transport';
export const owner = '10000000-0000-4000-8000-000000000001';
export const otherOwner = '10000000-0000-4000-8000-000000000002';
export const today = '2026-10-05';
export const zone = 'America/Toronto';
export const card: ChallengeCard = {
  id: 'gym-1',
  challengeId: 'test-challenge',
  levelId: 'level-1',
  venue: 'gym',
  position: 0,
  text: 'Say hello.',
  subtext: null,
  durationSeconds: 300,
};
export const uuid = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const input = (n = 1): CreateAttempt => ({
  id: uuid(n),
  challengeId: card.challengeId,
  venue: card.venue,
  startedAt: `${today}T14:00:00.000Z`,
  startTimeZone: zone,
});
export const attempt = (n = 1): Attempt => ({
  ...input(n),
  levelId: card.levelId,
  instruction: card.text,
  displayTimeZone: zone,
  activityDate: today,
  reflection: null,
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export class MemoryStorage implements JournalStorage {
  readonly values = new Map<string, string>();
  readonly writes: { key: string; value: string }[] = [];
  fail = false;
  failures = 0;
  cause = 'ENOSPC';
  blocked: ReturnType<typeof deferred<void>> | null = null;
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.writes.push({ key, value });
    if (this.blocked) await this.blocked.promise;
    if (this.fail || this.failures-- > 0)
      throw Object.assign(new Error('fixture storage'), { code: this.cause });
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}
export function backend(): JournalTransport & {
  records: Map<string, Attempt>;
  calls: string[];
} {
  const records = new Map<string, Attempt>();
  const receipts = new Map<string, PatchAttemptResponse>();
  const calls: string[] = [];
  return {
    records,
    calls,
    create: async (body) => {
      calls.push(`create:${body.id}`);
      if (!records.has(body.id))
        records.set(body.id, { ...attempt(), ...body });
      return structuredClone(records.get(body.id)!);
    },
    patch: async (id, body) => {
      calls.push(`patch:${body.submissionId}`);
      const old = records.get(id);
      if (!old) throw new ApiError('NOT_FOUND');
      if (receipts.has(body.submissionId))
        return structuredClone(receipts.get(body.submissionId)!);
      if ((old.reflection?.revision ?? 0) !== body.expectedReflectionRevision)
        throw new ApiError(
          'REFLECTION_CONFLICT',
          'fixture',
          structuredClone(old),
        );
      const reflection = {
        feeling: body.reflection.feeling ?? old.reflection?.feeling ?? null,
        text:
          body.reflection.text === undefined
            ? (old.reflection?.text ?? null)
            : body.reflection.text,
        revision: body.expectedReflectionRevision + 1,
      };
      const canonical = { ...old, reflection };
      records.set(id, canonical);
      const result = {
        attempt: canonical,
        acknowledgement: {
          submissionId: body.submissionId,
          appliedRevision: reflection.revision,
        },
      };
      receipts.set(body.submissionId, structuredClone(result));
      return structuredClone(result);
    },
  };
}
