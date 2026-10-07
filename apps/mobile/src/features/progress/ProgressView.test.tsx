import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  StyleSheet,
  Text,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type {
  LegacyProgressEntry as ProgressEntry,
  LegacyProgressResponse as ProgressResponse,
} from '@justgo/contracts';
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

it.each(['layout', 'show'])(
  'starts on %s and ignores repeated layout/show events midway through opening',
  (firstEvent) => {
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
          {...callbacks()}
        />,
      );
      expect(timing).not.toHaveBeenCalled();

      const layout = () =>
        fireEvent(screen.getByTestId('day-sheet-panel'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 514, width: 402, height: 360 } },
        });
      if (firstEvent === 'layout') layout();
      else fireEvent(screen.UNSAFE_getByType(Modal), 'show');
      expect(timing).toHaveBeenCalledTimes(1);
      const offset = timing.mock.calls[0]![0] as Animated.Value;
      let observedOffset = 0;
      const listener = offset.addListener(({ value }) => {
        observedOffset = value;
      });

      act(() => offset.setValue(300));
      layout();
      fireEvent(screen.UNSAFE_getByType(Modal), 'show');
      expect(timing).toHaveBeenCalledTimes(1);
      expect(observedOffset).toBe(300);

      act(() => offset.setValue(0));
      layout();
      fireEvent(screen.UNSAFE_getByType(Modal), 'show');
      expect(timing).toHaveBeenCalledTimes(1);
      expect(observedOffset).toBe(0);
      offset.removeListener(listener);
    } finally {
      timing.mockRestore();
    }
  },
);

it('keeps the current slide when day data arrives and a show event arrives during closing', () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.timing>);
  try {
    const actions = callbacks();
    const screen = render(
      <ProgressView
        month="2026-09"
        data={month}
        selectedDate="2026-09-18"
        dayLoading
        {...actions}
      />,
    );
    fireEvent(screen.UNSAFE_getByType(Modal), 'show');
    const offset = timing.mock.calls[0]![0] as Animated.Value;
    const reset = jest.spyOn(offset, 'setValue');
    screen.rerender(
      <ProgressView
        month="2026-09"
        data={month}
        selectedDate="2026-09-18"
        day={{
          date: '2026-09-18',
          totalReps: 1,
          entries: [entry('one', 'skipped')],
        }}
        {...actions}
      />,
    );
    expect(timing).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('day-sheet-panel'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 192, width: 402, height: 682 } },
    });
    expect(timing).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('×'));
    expect(timing).toHaveBeenCalledTimes(2);
    expect(timing.mock.calls[1]![1]).toMatchObject({ duration: 220 });
    fireEvent(screen.UNSAFE_getByType(Modal), 'show');
    expect(timing).toHaveBeenCalledTimes(2);
    expect(reset).not.toHaveBeenCalled();
    reset.mockRestore();
  } finally {
    timing.mockRestore();
  }
});

it('starts a fresh slide for each active day and when reopening the same day', () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.timing>);
  try {
    const actions = callbacks();
    const view = (selectedDate: string | null) => (
      <ProgressView
        month="2026-09"
        data={month}
        selectedDate={selectedDate}
        {...actions}
      />
    );
    const screen = render(view(null));
    fireEvent(screen.UNSAFE_getByType(Modal), 'show');
    expect(timing).not.toHaveBeenCalled();
    for (const [index, date] of [
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-27',
    ].entries()) {
      screen.rerender(view(date));
      expect(timing).toHaveBeenCalledTimes(index);
      fireEvent(screen.UNSAFE_getByType(Modal), 'show');
      fireEvent(screen.UNSAFE_getByType(Modal), 'show');
      expect(timing).toHaveBeenCalledTimes(index + 1);
      screen.rerender(view(null));
    }
    const values = timing.mock.calls.map(([value]) => value);
    expect(new Set(values).size).toBe(4);
  } finally {
    timing.mockRestore();
  }
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
  expect(screen.getByText('2 reps')).toBeTruthy();
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
  screen.rerender(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...actions}
    />,
  );
  screen.rerender(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-27"
      {...actions}
    />,
  );
  expect(
    screen.getByTestId('day-sheet-backdrop', { includeHiddenElements: true }),
  ).toHaveStyle({ backgroundColor: '#102C49AA' });
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

it('shows completion times and the Paper day total without duration', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 2,
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
  expect(screen.getByText('2 reps')).toBeTruthy();
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

it('shows the pencil inside the Edit action and opens the selected saved reflection', () => {
  const edit = jest.fn();
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 1,
        entries: [
          {
            ...entry('editable', 'submitted'),
            reflectionText: 'A saved reflection.',
          },
        ],
      }}
      onEditReflection={edit}
      {...callbacks()}
    />,
  );
  fireEvent.press(screen.getByRole('button', { name: /View Reflection/ }));
  const action = screen.getByRole('button', { name: 'Edit reflection' });
  expect(action.findByType(Image).props.source).toEqual(
    require('../../../assets/icons/reflection-pencil.png'),
  );
  expect(action.findByType(Image).props['aria-hidden']).toBe(true);
  fireEvent.press(action);
  expect(edit).toHaveBeenCalledWith('editable');
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

it('shows a retry in the sheet when its first page fails', () => {
  const retry = jest.fn();
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      dayError
      onRetryDay={retry}
      {...callbacks()}
    />,
  );

  expect(screen.getByText('Couldn’t load attempts')).toBeTruthy();
  expect(
    screen.getByText(
      'We couldn’t get your challenge attempts. Please try again.',
    ),
  ).toBeTruthy();
  const illustration = screen.getByTestId('day-initial-error-illustration', {
    includeHiddenElements: true,
  });
  expect(illustration.props.source).toEqual(
    require('../../../assets/illustrations/disconnected-plugs.png'),
  );
  expect(illustration.props.resizeMode).toBe('contain');
  expect(illustration.props['aria-hidden']).toBe(true);
  expect(screen.queryByTestId('day-sheet-entry-list')).toBeNull();
  fireEvent.press(
    screen.getByRole('button', { name: 'Try loading attempts again' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});

it('keeps loaded entries and shows a bottom retry when a later page fails', () => {
  const retry = jest.fn();
  const loadMore = jest.fn();
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 21,
        entries: [entry('first', 'skipped')],
      }}
      hasMore
      loadMoreError
      onRetryDay={retry}
      onLoadMore={loadMore}
      {...callbacks()}
    />,
  );

  expect(screen.getByLabelText(/Rep 1\. Say hello to someone/)).toBeTruthy();
  const footer = screen.getByTestId('day-load-more-error');
  expect(
    footer.findAllByType(Text).map(({ props }) => props.children),
  ).toContain('Couldn’t load more attempts');
  fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), {
    nativeEvent: {
      contentOffset: { y: 900 },
      contentSize: { height: 1600 },
      layoutMeasurement: { height: 700 },
    },
  });
  expect(loadMore).not.toHaveBeenCalled();
  fireEvent.press(
    screen.getByRole('button', { name: 'Try loading more attempts again' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});

it('keeps loaded attempts visible while the next page loads', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 21,
        entries: [entry('first', 'skipped')],
      }}
      hasMore
      loadingMore
      fetchingDay
      {...callbacks()}
    />,
  );

  expect(screen.getByLabelText(/Rep 1\. Say hello to someone/)).toBeTruthy();
  expect(screen.getByTestId('day-loading-more')).toBeTruthy();
  expect(screen.getByLabelText('Loading more attempts')).toBeTruthy();
  expect(screen.queryByText('Loading more attempts…')).toBeNull();
  expect(screen.queryByTestId('day-load-more-error')).toBeNull();
});

it('fetches once near the end of each page as the sheet scrolls', () => {
  const loadMore = jest.fn();
  const first = Array.from({ length: 20 }, (_, index) =>
    entry(`attempt-${index}`, 'skipped'),
  );
  const renderDay = (entries: ProgressEntry[], fetchingDay = false) => (
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 21,
        entries,
      }}
      hasMore
      fetchingDay={fetchingDay}
      onLoadMore={loadMore}
      {...callbacks()}
    />
  );
  const screen = render(renderDay(first));
  const scroll = (y: number) =>
    fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), {
      nativeEvent: {
        contentOffset: { y },
        contentSize: { height: 1600 },
        layoutMeasurement: { height: 700 },
      },
    });

  scroll(0);
  scroll(500);
  expect(loadMore).not.toHaveBeenCalled();
  scroll(900);
  scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(1);
  screen.rerender(renderDay(first, true));
  scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(1);
  screen.rerender(renderDay([...first, entry('attempt-20', 'skipped')]));
  scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(2);
  screen.rerender(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...callbacks()}
    />,
  );
  screen.rerender(renderDay(first));
  scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(3);
  expect(
    screen.queryByRole('button', { name: 'Load more challenges' }),
  ).toBeNull();
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
