import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
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

it('uses the warm Paper calendar panel and inactive day colors', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...callbacks()}
    />,
  );

  expect(screen.getByTestId('progress-calendar-card')).toHaveStyle({
    backgroundColor: '#FCF4EA',
    borderColor: '#E6D6C8',
  });
  expect(screen.getByLabelText('Wednesday, September 2, 0 reps')).toHaveStyle({
    backgroundColor: '#EBDFD4',
    borderColor: '#DCCDC0',
  });
  expect(screen.getByLabelText('Friday, September 18, 2 reps')).toHaveStyle({
    backgroundColor: colors.white,
    borderColor: '#E6D9CE',
  });
});

it('mutes zero-activity date numbers while keeping active dates dark', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...callbacks()}
    />,
  );

  const numberColor = (label: string) =>
    StyleSheet.flatten(
      screen.getByLabelText(label).findAllByType(Text)[0]!.props.style,
    ).color;

  expect(numberColor('Wednesday, September 2, 0 reps')).toBe('#77797B');
  expect(numberColor('Sunday, September 27, today, 0 reps')).toBe('#77797B');
  expect(numberColor('Friday, September 18, 2 reps')).toBe(colors.ink);
});

it('keeps the three decorative metric icons distinct and readable', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...callbacks()}
    />,
  );
  const fire = screen.getByTestId('progress-metric-icon-streak', {
    includeHiddenElements: true,
  });
  const trophy = screen.getByTestId('progress-metric-icon-best', {
    includeHiddenElements: true,
  });
  const dumbbell = screen.getByTestId('progress-metric-icon-reps', {
    includeHiddenElements: true,
  });
  expect(fire.props.height).toBe(trophy.props.height);
  expect(dumbbell.props.height).toBe(fire.props.height);
  expect(dumbbell.props.width).toBeGreaterThan(fire.props.width);
  expect(screen.getByText('Current streak')).toBeTruthy();
  expect(screen.getByText('Best streak')).toBeTruthy();
  expect(screen.getByText('Total reps')).toBeTruthy();
});

it('keeps the Paper flame as one continuous outline with an open base cutout', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...callbacks()}
    />,
  );
  const icon = screen
    .UNSAFE_getAllByType(Svg)
    .find(({ props }) => props.testID === 'progress-metric-icon-streak')!;
  const paths = icon.findAllByType(Path);

  // Separate inner and outer paths produced the overlapping nested-flame shape.
  expect(paths).toHaveLength(1);
  expect(paths[0]!.props.d.trim()).toMatch(/^M[^MmZz]+Z$/);
  expect(paths[0]!.props.fill).toBe('none');
  expect(paths[0]!.props.strokeWidth).toBeLessThan(1.8);
  expect(paths[0]!.props.strokeLinejoin).toBe('round');
});

it('matches the Paper dumbbell proportions with a long grip and touching plates', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...callbacks()}
    />,
  );
  const icon = screen
    .UNSAFE_getAllByType(Svg)
    .find(({ props }) => props.testID === 'progress-metric-icon-reps')!;
  expect(icon.props.viewBox).toBe(
    `0 0 ${icon.props.width} ${icon.props.height}`,
  );
  const parts = icon.findAllByType(Rect).map(({ props }) => props);
  const plates = parts.filter(({ height }) => height > 20);
  expect(plates).toHaveLength(2);
  const [left, right] = plates;
  const stroke = left!.strokeWidth;
  const width =
    Math.max(...parts.map((part) => part.x + part.width)) -
    Math.min(...parts.map((part) => part.x)) +
    stroke;
  const height = left!.height + stroke;

  // Measured from Paper's 390-point artboard: about 43 × 25 points.
  expect(width).toBeGreaterThan(42);
  expect(width).toBeLessThan(44);
  expect(height).toBeGreaterThan(24);
  expect(height).toBeLessThan(26);
  const grip = right!.x - (left!.x + left!.width);
  expect(grip / height).toBeGreaterThan(0.6);
  expect(grip / height).toBeLessThan(0.7);
  for (let index = 1; index < parts.length; index++) {
    const previous = parts[index - 1]!;
    expect(parts[index]!.x).toBeCloseTo(previous.x + previous.width);
  }
});

it('opens only active days and shows draft and skipped feedback as Not recorded', async () => {
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
  await waitFor(() => expect(actions.onCloseDay).toHaveBeenCalledTimes(1));
});

it('shows a full-screen backdrop while only the day sheet slides', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      {...callbacks()}
    />,
  );

  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  expect(
    screen.getByTestId('day-sheet-backdrop', {
      includeHiddenElements: true,
    }),
  ).toHaveStyle({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const panelStyle = StyleSheet.flatten(
    screen.getByTestId('day-sheet-panel').props.style,
  );
  expect(panelStyle.transform[0]).toHaveProperty('translateY');
});

it('clears the backdrop immediately when the sheet close button is pressed', async () => {
  const actions = callbacks();
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      {...actions}
    />,
  );
  const backdrop = screen.getByTestId('day-sheet-backdrop', {
    includeHiddenElements: true,
  });
  expect(backdrop).toHaveStyle({ backgroundColor: '#102C49AA' });

  fireEvent.press(screen.getByText('×'));
  expect(backdrop).toHaveStyle({ backgroundColor: 'transparent' });
  expect(actions.onCloseDay).not.toHaveBeenCalled();
  await waitFor(() => expect(actions.onCloseDay).toHaveBeenCalledTimes(1));
});

it('keeps a past active day white while its details sheet is open', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={{
        ...month,
        days: [
          { date: '2026-09-18', reps: 2 },
          { date: '2026-09-27', reps: 1 },
        ],
      }}
      selectedDate="2026-09-18"
      {...callbacks()}
    />,
  );

  const pastDay = screen.getByLabelText('Friday, September 18, 2 reps', {
    includeHiddenElements: true,
  });
  const today = screen.getByLabelText('Sunday, September 27, today, 1 rep', {
    includeHiddenElements: true,
  });
  expect(pastDay).toHaveStyle({
    backgroundColor: colors.white,
    borderColor: '#E6D9CE',
  });
  expect(screen.getByText('18', { includeHiddenElements: true })).toHaveStyle({
    color: colors.ink,
  });
  expect(today).toHaveStyle({ backgroundColor: colors.ink });
});

it('uses aligned clock and stopwatch icons for every day-sheet entry', () => {
  const screen = render(
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
      {...callbacks()}
    />,
  );

  const rows = screen.getAllByTestId('entry-metadata-row', {
    includeHiddenElements: true,
  });
  const clocks = screen.getAllByTestId('entry-clock-icon', {
    includeHiddenElements: true,
  });
  const stopwatches = screen.getAllByTestId('entry-stopwatch-icon', {
    includeHiddenElements: true,
  });
  expect(rows).toHaveLength(2);
  expect(clocks).toHaveLength(2);
  expect(stopwatches).toHaveLength(2);
  for (const row of rows) {
    expect(row).toHaveStyle({ flexDirection: 'row', alignItems: 'center' });
  }
  for (const clock of clocks) {
    expect(clock.props.width).toBe(16);
    expect(clock.findAllByType(Circle)).toHaveLength(1);
    expect(clock.findAllByType(Path).length).toBeGreaterThan(0);
  }
  for (const stopwatch of stopwatches) {
    expect(stopwatch.props.width).toBe(16);
    expect(stopwatch.findAllByType(Circle)).toHaveLength(1);
    expect(stopwatch.findAllByType(Path).length).toBeGreaterThan(0);
  }
  expect(screen.queryByText(/◷|◴/)).toBeNull();
});

it('centers each After rating with four points between its label and result', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 2,
        totalElapsedSeconds: 244,
        entries: [
          {
            ...entry('00000000-0000-4000-8000-000000000001', 'submitted'),
            feeling: 'a_little_better',
          },
          entry('00000000-0000-4000-8000-000000000002', 'draft'),
        ],
      }}
      {...callbacks()}
    />,
  );

  const ratings = screen.getAllByTestId('entry-feeling', {
    includeHiddenElements: true,
  });
  expect(ratings).toHaveLength(2);
  for (const rating of ratings) {
    expect(rating).toHaveStyle({
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    });
  }
  expect(screen.getAllByText('After')).toHaveLength(2);
  expect(screen.getByText('Not\nrecorded')).toBeTruthy();
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

it('shows a larger # in the legend than the calendar rep badges', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...callbacks()}
    />,
  );
  const legendSize = StyleSheet.flatten(
    screen.getByText('#').props.style,
  ).fontSize;
  const calendarBadge = screen.getByTestId('rep-badge-2026-09-18');
  const calendarSize = StyleSheet.flatten(
    calendarBadge.findByType(Text).props.style,
  ).fontSize;

  expect(legendSize).toBe(16);
  expect(legendSize).toBeGreaterThan(calendarSize);
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
