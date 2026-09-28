import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated, Modal, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ProgressEntry, ProgressResponse } from '@justgo/contracts';
import { colors } from '../../theme/tokens';
import { ProgressView } from './ProgressView';

jest.mock('expo-router', () => ({ Link: () => null }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

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

it('opens only active days and shows empty circles for draft and skipped feedback', async () => {
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
  expect(
    screen.getAllByTestId('empty-feeling-circle', {
      includeHiddenElements: true,
    }),
  ).toHaveLength(2);
  expect(screen.queryByText('Not\nrecorded')).toBeNull();
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

it('keeps the marker behind the date and resizes it when the heading reflows', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-30"
      day={{
        date: '2026-09-30',
        totalReps: 2,
        totalElapsedSeconds: 244,
        entries: [],
      }}
      {...callbacks()}
    />,
  );

  const title = screen.getByRole('header', {
    name: 'Wednesday, September 30',
  });
  // Keep the month and number together instead of orphaning "30" on its own line.
  expect(title.props.children).toBe('Wednesday, September\u00a030');
  expect(title.props.numberOfLines).toBeUndefined();
  expect(title).toHaveStyle({ fontSize: 36 });
  const markerLayer = screen.getByTestId('day-title-underline-layer', {
    includeHiddenElements: true,
  });
  const textLayer = screen.getByTestId('day-title-text-layer');
  expect(textLayer.props.collapsable).toBe(false);
  expect(markerLayer.props.collapsable).toBe(false);
  expect(StyleSheet.flatten(textLayer.props.style).zIndex).toBeGreaterThan(
    StyleSheet.flatten(markerLayer.props.style).zIndex,
  );
  expect(markerLayer).toHaveStyle({ position: 'absolute', bottom: 0 });

  const underline = () =>
    screen.getByTestId('day-title-underline', {
      includeHiddenElements: true,
    });

  fireEvent(title, 'textLayout', {
    nativeEvent: { lines: [{ width: 320 }] },
  });
  expect(underline().props.width).toBeCloseTo(278.4);
  expect(underline().findByType(Path).props.fill).toBe('#FEC9A2');

  // A narrower screen or larger system text can cause the date to wrap.
  fireEvent(title, 'textLayout', {
    nativeEvent: { lines: [{ width: 180 }, { width: 240 }] },
  });
  expect(underline().props.width).toBeCloseTo(208.8);
  expect(underline().props.height).toBe(18);
  expect(underline()).toHaveStyle({ transform: [{ translateY: -6 }] });
  expect(screen.queryByText('2 reps')).toBeNull();
  const entryList = screen.getByTestId('day-sheet-entry-list');
  expect(entryList).toHaveStyle({ marginTop: 12 });
  expect(
    StyleSheet.flatten(entryList.props.contentContainerStyle),
  ).toMatchObject({
    paddingRight: 12,
    paddingBottom: 24,
  });
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

it('shows completion times without a day total or duration in the day sheet', () => {
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
  expect(screen.queryByText('2 reps')).toBeNull();
  expect(screen.queryByText(/4 min 4 sec total/)).toBeNull();
  expect(screen.queryByText('2 min 2 sec')).toBeNull();
  expect(
    screen.getByLabelText(
      'Rep 1. Say hello to someone. 9:15 AM. Feeling: Not recorded',
    ),
  ).toBeTruthy();
  expect(
    screen.queryByTestId('entry-stopwatch-icon', {
      includeHiddenElements: true,
    }),
  ).toBeNull();
  expect(rows).toHaveLength(2);
  expect(clocks).toHaveLength(2);
  for (const row of rows) {
    expect(row).toHaveStyle({ flexDirection: 'row', alignItems: 'center' });
  }
  for (const clock of clocks) {
    expect(clock.props.width).toBe(16);
    expect(clock.findAllByType(Circle)).toHaveLength(1);
    expect(clock.findAllByType(Path).length).toBeGreaterThan(0);
  }
  expect(screen.queryByText(/◷|◴/)).toBeNull();
});

it('opens and hides saved reflections by tapping a row, keeping one open at a time', () => {
  const entries: ProgressEntry[] = [
    {
      ...entry('first', 'submitted'),
      reflectionText: 'I felt more at ease with each try.',
    },
    entry('second', 'skipped'),
    {
      ...entry('third', 'submitted'),
      reflectionText: 'Saying hello felt easier the second time.',
    },
  ];
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: entries.length,
        totalElapsedSeconds: 366,
        entries,
      }}
      {...callbacks()}
    />,
  );
  expect(screen.getAllByText('View Reflection')).toHaveLength(2);
  expect(screen.queryByText('Saved reflection')).toBeNull();

  const first = screen.getByRole('button', { name: /Rep 1.*View Reflection/ });
  expect(first.props.accessibilityState).toEqual({ expanded: false });
  fireEvent.press(first);
  expect(
    screen.getByRole('button', { name: /Rep 1.*Hide Reflection/ }).props
      .accessibilityState,
  ).toEqual({ expanded: true });
  expect(screen.getByText(entries[0]!.reflectionText!)).toBeTruthy();
  expect(screen.getAllByText('Saved reflection')).toHaveLength(1);
  expect(screen.getAllByText('View Reflection')).toHaveLength(1);

  fireEvent.press(
    screen.getByRole('button', { name: /Rep 3.*View Reflection/ }),
  );
  expect(screen.queryByText(entries[0]!.reflectionText!)).toBeNull();
  expect(screen.getByText(entries[2]!.reflectionText!)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /Rep 1.*View Reflection/ }).props
      .accessibilityState,
  ).toEqual({ expanded: false });

  fireEvent.press(
    screen.getByRole('button', { name: /Rep 3.*Hide Reflection/ }),
  );
  expect(screen.queryByText('Saved reflection')).toBeNull();
  expect(screen.queryByText(entries[2]!.reflectionText!)).toBeNull();
  expect(screen.getAllByText('View Reflection')).toHaveLength(2);
});

it('animates the saved reflection both into and out of the row', () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.timing>);
  try {
    const screen = render(
      <ProgressView
        month="2026-09"
        data={month}
        selectedDate="2026-09-18"
        day={{
          date: '2026-09-18',
          totalReps: 1,
          totalElapsedSeconds: 122,
          entries: [
            {
              ...entry('first', 'submitted'),
              reflectionText: 'I felt more at ease with each try.',
            },
          ],
        }}
        {...callbacks()}
      />,
    );
    const content = screen.getByTestId('reflection-content', {
      includeHiddenElements: true,
    });
    expect(
      StyleSheet.flatten(content.parent?.parent?.props.style),
    ).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    });
    fireEvent(content, 'layout', {
      nativeEvent: { layout: { height: 72 } },
    });
    timing.mockClear();

    fireEvent.press(screen.getByRole('button', { name: /View Reflection/ }));
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, useNativeDriver: false }),
    );
    timing.mockClear();

    fireEvent.press(screen.getByRole('button', { name: /Hide Reflection/ }));
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0, useNativeDriver: false }),
    );
  } finally {
    timing.mockRestore();
  }
});

it('omits reflection controls for empty, unsaved, or skipped reflections', () => {
  const entries: ProgressEntry[] = [
    entry('no-text', 'submitted'),
    { ...entry('empty', 'submitted'), reflectionText: '' },
    { ...entry('whitespace', 'submitted'), reflectionText: ' \n ' },
    { ...entry('draft', 'draft'), reflectionText: 'Not submitted yet' },
    { ...entry('skipped', 'skipped'), reflectionText: 'Not submitted' },
  ];
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: entries.length,
        totalElapsedSeconds: 610,
        entries,
      }}
      {...callbacks()}
    />,
  );

  expect(screen.queryByTestId('reflection-action')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Rep / })).toBeNull();
  fireEvent.press(screen.getByLabelText(/^Rep 1\./));
  expect(screen.queryByText('Saved reflection')).toBeNull();
  expect(screen.queryByText('Hide Reflection')).toBeNull();
});

it('centers each Feeling rating with four points between its label and result', () => {
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
  expect(screen.getAllByText('Feeling')).toHaveLength(2);
  const emptyCircle = screen.getByTestId('empty-feeling-circle', {
    includeHiddenElements: true,
  });
  expect(emptyCircle.props.width).toBe(36);
  expect(emptyCircle.props.height).toBe(36);
  expect(emptyCircle.findByType(Circle).props.strokeDasharray).toBe('0.1 4.2');
  expect(screen.queryByText('Not\nrecorded')).toBeNull();
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
