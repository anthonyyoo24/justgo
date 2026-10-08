import type { Attempt, ProgressCalendar } from '@justgo/contracts';

export type ProgressDisplay = {
  month: string;
  today: string;
  totalReps: number | null;
  currentStreak: number | null;
  bestStreak: number | null;
  monthlyReps: number | null;
  activeDays: number | null;
  days: ProgressCalendar['days'] | undefined;
};
// Presentation preserves legacy unknown timestamps without carrying obsolete
// card/revision resource identifiers into the resource-based Progress caller.
export type ProgressEntry = {
  attemptId: string;
  instruction: string;
  completedAt: string | null;
  activityAt?: string | null | undefined;
  timeZone: string;
  reflectionStatus: string;
  feeling: NonNullable<Attempt['reflection']>['feeling'];
  reflectionText: string | null;
};
export const displayEntry = (attempt: Attempt): ProgressEntry => ({
  attemptId: attempt.id,
  instruction: attempt.instruction,
  activityAt: attempt.startedAt,
  completedAt: null,
  timeZone: attempt.displayTimeZone,
  reflectionStatus: attempt.reflection ? 'submitted' : 'none',
  feeling: attempt.reflection?.feeling ?? null,
  reflectionText: attempt.reflection?.text ?? null,
});
