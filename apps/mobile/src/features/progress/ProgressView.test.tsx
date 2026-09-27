import { fireEvent, render } from '@testing-library/react-native';
import type { ProgressEntry, ProgressResponse } from '@justgo/contracts';
import { ProgressView } from './ProgressView';

jest.mock('expo-router', () => ({ Link: () => null }));

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
  completedAt: '2026-09-18T13:15:00.000Z',
  timeZone: 'America/Toronto',
  elapsedSeconds: 122,
  cardId: 'card-1',
  venue: 'streets',
  challengeId: 'challenge-1',
  revisionId: 'revision-1',
  levelId: 'level-1',
  instruction: 'Say hello to someone',
  feelingVersion: 1,
  reflectionStatus: status,
  feeling: null,
  reflectionText: null,
});
const callbacks = () => ({
  onMonth: jest.fn(),
  onOpenDay: jest.fn(),
  onCloseDay: jest.fn(),
});

it('opens only active days and shows draft and skipped feedback as Not recorded', () => {
  const actions = callbacks();
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...actions}
    />,
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Friday, September 18, 2 reps' }),
  );
  expect(actions.onOpenDay).toHaveBeenCalledWith('2026-09-18');
  expect(
    screen.queryByRole('button', { name: /Saturday, September 19/ }),
  ).toBeNull();
  screen.rerender(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 2,
        totalElapsedSeconds: 244,
        entries: [
          entry('00000000-0000-4000-8000-000000000001', 'draft'),
          entry('00000000-0000-4000-8000-000000000002', 'skipped'),
        ],
      }}
      {...actions}
    />,
  );
  expect(screen.getAllByText('Not\nrecorded')).toHaveLength(2);
  expect(screen.queryByText('Saved reflection')).toBeNull();
  fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  expect(actions.onCloseDay).toHaveBeenCalledTimes(1);
});

it('does not turn an API error into zero activity and explains a genuinely empty month', () => {
  const actions = callbacks();
  const retry = jest.fn();
  const screen = render(
    <ProgressView
      month="2026-09"
      selectedDate={null}
      error
      onRetryMonth={retry}
      {...actions}
    />,
  );
  expect(screen.getByText('We couldn’t load your progress.')).toBeTruthy();
  expect(screen.queryByText('0')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry progress' }));
  expect(retry).toHaveBeenCalledTimes(1);
  screen.rerender(
    <ProgressView
      month="2026-08"
      data={{
        ...month,
        month: '2026-08',
        totalReps: 2,
        monthlyReps: 0,
        activeDays: 0,
        days: [],
      }}
      selectedDate={null}
      {...actions}
    />,
  );
  expect(
    screen.getByText('No completed challenges this month yet.'),
  ).toBeTruthy();
  expect(screen.getByText('0')).toBeTruthy();
});
