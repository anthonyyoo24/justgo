import type { Attempt, ChallengeCard, CreateAttempt } from '@justgo/contracts';
import type { JournalStorage } from '../src/data/activity/model';
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
  async getAllKeys() {
    return [...this.values.keys()];
  }
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
