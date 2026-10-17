import { fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../../theme/tokens';
import { ProgressView } from './ProgressView';

jest.mock('expo-router', () => ({ Link: () => null }));
jest.mock('../../platform/motion/motion', () => ({
  useReduceMotion: () => false,
}));
jest.mock('./day-details/entries/useEntryMotion', () =>
  jest.requireActual('./day-details/entries/useEntryMotion.ts'),
);

import { month, callbacks } from '../../../test-support/progress/view';

it.each([0, 1, 2])('uses singular and plural Progress copy for %s', (days) => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={{
        ...month,
        currentStreak: days,
        bestStreak: days,
        monthlyReps: days,
      }}
      selectedDate={null}
      {...callbacks()}
    />,
  );
  const expected = new RegExp(`^${days}\\s${days === 1 ? 'day' : 'days'}$`);
  expect(screen.getByTestId('progress-value-streak')).toHaveTextContent(
    expected,
  );
  expect(screen.getByTestId('progress-value-best')).toHaveTextContent(expected);
  expect(
    screen.getByText(`${days === 1 ? 'rep' : 'reps'} this month`),
  ).toBeTruthy();
});

it('keeps loading inside the calendar and numeric slots, then enables loaded days', () => {
  const actions = callbacks();
  const screen = render(
    <ProgressView month="2026-09" loading selectedDate={null} {...actions} />,
  );
  expect(
    screen.getByLabelText('Loading progress').props.accessibilityState.busy,
  ).toBe(true);
  expect(
    screen.getAllByTestId('progress-calendar-skeleton', {
      includeHiddenElements: true,
    }),
  ).toHaveLength(35);
  const skeletonShape = StyleSheet.flatten(
    screen.getAllByTestId('progress-calendar-skeleton', {
      includeHiddenElements: true,
    })[0]!.props.style,
  );
  for (const id of ['streak', 'best', 'reps'])
    expect(
      screen.getByTestId(`progress-metric-skeleton-${id}`, {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  expect(
    screen.getByTestId('progress-month-reps-skeleton', {
      includeHiddenElements: true,
    }),
  ).toBeTruthy();
  expect(
    screen.getByTestId('progress-active-days-skeleton', {
      includeHiddenElements: true,
    }),
  ).toBeTruthy();
  expect(
    screen.getByText('Tap an active day to see your challenges'),
  ).toBeTruthy();
  expect(screen.queryByText('Loading your progress…')).toBeNull();
  expect(screen.queryByText('We couldn’t load your progress.')).toBeNull();
  expect(screen.queryByText('0')).toBeNull();
  expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  expect(screen.queryByRole('button', { name: /September 18/ })).toBeNull();

  screen.rerender(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...actions}
    />,
  );
  expect(screen.queryByLabelText('Loading progress')).toBeNull();
  expect(
    screen.queryAllByTestId('progress-calendar-skeleton', {
      includeHiddenElements: true,
    }),
  ).toHaveLength(0);
  const dayShape = StyleSheet.flatten(
    screen.getByRole('button', { name: 'Friday, September 18, 2 reps' }).props
      .style,
  );
  expect(skeletonShape.width).toBe(dayShape.width);
  expect(skeletonShape.height).toBe(dayShape.height);
  expect(skeletonShape.borderRadius).toBe(dayShape.borderRadius);
  expect(skeletonShape.borderRadius).toBeGreaterThanOrEqual(
    skeletonShape.width / 2,
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Friday, September 18, 2 reps' }),
  );
  expect(actions.onOpenDay).toHaveBeenCalledWith('2026-09-18');
});

it('preserves available progress during a refresh and stops skeletons on a failure', () => {
  const props = { month: '2026-09', selectedDate: null, ...callbacks() };
  const screen = render(<ProgressView {...props} data={month} loading />);
  expect(screen.queryByLabelText('Loading progress')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Friday, September 18, 2 reps' }),
  ).toBeTruthy();
  screen.rerender(<ProgressView {...props} loading error />);
  expect(screen.getByText('We couldn’t load your progress.')).toBeTruthy();
  expect(
    screen.queryAllByTestId('progress-calendar-skeleton', {
      includeHiddenElements: true,
    }),
  ).toHaveLength(0);
});

it('explains paused aggregate reads without shimmer or a misleading error and retry', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      selectedDate={null}
      data={{ ...month, monthlyReps: null, activeDays: null, days: undefined }}
      loading
      summaryLoading
      error
      summaryError
      waitingForSync
      {...callbacks()}
    />,
  );
  expect(screen.getByText('Syncing your latest activity…')).toBeTruthy();
  expect(
    screen.getByTestId('progress-calendar-card').props.accessibilityState.busy,
  ).toBe(false);
  expect(screen.queryByLabelText('Loading progress')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.queryByText('No completed challenges this month yet.'),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry progress' })).toBeNull();
  expect(
    screen.queryAllByTestId('progress-calendar-skeleton', {
      includeHiddenElements: true,
    }),
  ).toHaveLength(0);
  expect(
    screen.queryAllByTestId('progress-metric-skeleton-reps', {
      includeHiddenElements: true,
    }),
  ).toHaveLength(0);
});

it('keeps a loaded calendar usable while an uncached summary waits for sync', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      selectedDate={null}
      data={{
        ...month,
        totalReps: null,
        currentStreak: null,
        bestStreak: null,
      }}
      waitingForSync
      {...callbacks()}
    />,
  );
  expect(screen.getByText('Syncing your latest activity…')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Friday, September 18, 2 reps' }),
  ).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Retry progress' })).toBeNull();
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

it('mutes zero-activity date numbers while keeping active dates dark and today light', () => {
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
  expect(numberColor('Sunday, September 27, today, 0 reps')).toBe(colors.cream);
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

it('highlights today with navy and orange rays before any reps without a badge or day action', () => {
  const actions = callbacks();
  const screen = render(
    <ProgressView
      month="2026-09"
      data={{ ...month, today: '2026-09-30' }}
      selectedDate={null}
      {...actions}
    />,
  );
  const today = screen.getByLabelText('Wednesday, September 30, today, 0 reps');
  expect(today).toHaveStyle({
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    borderWidth: 1,
  });
  expect(today.props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText('30')).toHaveStyle({ color: colors.cream });
  const rays = screen.getByTestId('calendar-cell-2026-09-30').findByType(Svg);
  expect(rays.findByType(Path).props.stroke).toBe('#F4A46C');
  expect(screen.queryByTestId('rep-badge-2026-09-30')).toBeNull();
  fireEvent.press(today);
  expect(actions.onOpenDay).not.toHaveBeenCalled();
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
