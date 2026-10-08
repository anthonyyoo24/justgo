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
export type ProgressEntry = {
  attemptId: string;
  instruction: string;
  startedAt: string;
  timeZone: string;
  reflectionStatus: 'submitted' | 'none';
  feeling: NonNullable<Attempt['reflection']>['feeling'];
  reflectionText: string | null;
};
export const displayEntry = (attempt: Attempt): ProgressEntry => ({
  attemptId: attempt.id,
  instruction: attempt.instruction,
  startedAt: attempt.startedAt,
  timeZone: attempt.displayTimeZone,
  reflectionStatus: attempt.reflection ? 'submitted' : 'none',
  feeling: attempt.reflection?.feeling ?? null,
  reflectionText: attempt.reflection?.text ?? null,
});
