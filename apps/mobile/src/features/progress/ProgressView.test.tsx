import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ProgressEntry, ProgressResponse } from '@justgo/contracts';
import { colors } from '../../theme/tokens';
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

it('keeps the today badge clear of the next row and the day tappable', () => {
  const actions = callbacks();
  const screen = render(
    <ProgressView
      month="2026-09"
      data={{
        ...month,
        totalReps: 10,
        monthlyReps: 10,
        days: [{ date: '2026-09-27', reps: 10 }],
      }}
      selectedDate={null}
      {...actions}
    />,
  );
  const today = screen.getByRole('button', {
    name: 'Sunday, September 27, today, 10 reps',
  });
  expect(today).toHaveStyle({ backgroundColor: colors.ink });
  expect(screen.getByText('27')).toHaveStyle({ color: colors.cream });
  const cell = StyleSheet.flatten(
    screen.getByTestId('calendar-cell-2026-09-27').props.style,
  );
  const circle = StyleSheet.flatten(today.props.style);
  const badge = StyleSheet.flatten(
    screen.getByTestId('rep-badge-2026-09-27').props.style,
  );
  expect(cell.height - circle.height + badge.bottom).toBeGreaterThanOrEqual(3);
  expect(badge.minWidth).toBeGreaterThan(badge.height);
  fireEvent.press(today);
  expect(actions.onOpenDay).toHaveBeenCalledWith('2026-09-27');
});

it('keeps the calendar visible without presenting a failed request as zero activity', () => {
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
  expect(screen.getByRole('header', { name: 'September 2026' })).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(4);
  expect(screen.getByText('reps this month')).toBeTruthy();
  expect(
    screen.getByLabelText('Friday, September 18, activity unavailable').props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(screen.queryByText('0')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry progress' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it('shows real zero totals, a complete calendar, and a first challenge hint for a new account', () => {
  const actions = callbacks();
  const screen = render(
    <ProgressView
      month="2026-09"
      data={{
        ...month,
        totalReps: 0,
        monthlyReps: 0,
        activeDays: 0,
        days: [],
      }}
      selectedDate={null}
      {...actions}
    />,
  );
  expect(screen.getAllByText('0 days')).toHaveLength(2);
  expect(screen.getAllByText('0')).toHaveLength(2);
  expect(screen.getByText('on 0 active days')).toBeTruthy();
  expect(
    screen.getByText('Your first completed challenge will appear here.'),
  ).toBeTruthy();
  expect(
    screen.getByLabelText('Sunday, September 27, today, 0 reps'),
  ).toBeTruthy();
  expect(screen.queryByText('We couldn’t load your progress.')).toBeNull();
  expect(screen.queryByText('—')).toBeNull();
});

it('explains an empty month when the account has earlier activity', () => {
  const actions = callbacks();
  const screen = render(
    <ProgressView
      month="2026-08"
      data={{
        ...month,
        month: '2026-08',
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
