import type {
  ProgressEntry,
  ProgressDisplay as ProgressResponse,
} from '../../src/features/progress/types';
const month: ProgressResponse = {
  month: '2026-09',
  today: '2026-09-27',
  currentStreak: 0,
  bestStreak: 0,
  totalReps: 2,
  monthlyReps: 2,
  activeDays: 1,
  days: [{ date: '2026-09-18', reps: 2 }],
};
const entry = (
  attemptId: string,
  status: ProgressEntry['reflectionStatus'],
): ProgressEntry => ({
  attemptId,
  startedAt: '2026-09-18T13:15:00.000Z',
  timeZone: 'America/Toronto',
  instruction: 'Say hello to someone',
  reflectionStatus: status,
  feeling: null,
  reflectionText: null,
});
const callbacks = () => ({
  onMonth: jest.fn(),
  onOpenDay: jest.fn(),
  onCloseDay: jest.fn(),
});
export { month, entry, callbacks };
