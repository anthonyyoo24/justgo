import { fireEvent, render } from '@testing-library/react-native';
import { Animated, Image, StyleSheet } from 'react-native';
import { Circle, Path } from 'react-native-svg';
import type { ProgressEntry } from './types';
import { ProgressView } from './ProgressView';

jest.mock('expo-router', () => ({ Link: () => null }));
jest.mock('../../platform/motion/motion', () => ({
  useReduceMotion: () => false,
}));
jest.mock('./day-details/entries/useEntryMotion', () =>
  jest.requireActual('./day-details/entries/useEntryMotion.ts'),
);

import { month, entry, callbacks } from '../../../test-support/progress/view';

it('shows captured start times and the Paper day total without duration', () => {
  const screen = render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 2,
        entries: [
          entry('00000000-0000-4000-8000-000000000001', 'none'),
          entry('00000000-0000-4000-8000-000000000002', 'none'),
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
    entry('second', 'none'),
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

it('uses the Paper plus for Add reflection and omits the saved row pencil', () => {
  const edit = jest.fn();
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
            ...entry('addable', 'submitted'),
            feeling: 'a_little_better',
          },
          {
            ...entry('saved', 'submitted'),
            reflectionText: 'A saved reflection.',
          },
        ],
      }}
      onEditReflection={edit}
      {...callbacks()}
    />,
  );
  const add = screen.getByRole('button', { name: /Rep 1.*Add reflection/ });
  const plus = screen.getByTestId('add-reflection-icon', {
    includeHiddenElements: true,
  });
  expect(plus.props.width).toBe(13);
  expect(plus.props.height).toBe(13);
  expect(plus.props['aria-hidden']).toBe(true);
  expect(plus.findByType(Path).props.d).toBe('M8 2v12M2 8h12');
  expect(add.findAllByType(Image)).toHaveLength(0);
  expect(
    screen
      .getByRole('button', { name: /Rep 2.*View Reflection/ })
      .findAllByType(Image),
  ).toHaveLength(0);
  fireEvent.press(add);
  expect(edit).toHaveBeenCalledWith('addable');
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
    expect(
      screen.queryByTestId('entry-details-content', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /View Reflection/ }));
    const content = screen.getByTestId('entry-details-content', {
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
    timing.mockClear();
    fireEvent(content, 'layout', {
      nativeEvent: { layout: { height: 72 } },
    });
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

it('omits reflection controls for empty text or absent submitted reflections', () => {
  const entries: ProgressEntry[] = [
    entry('no-text', 'submitted'),
    { ...entry('empty', 'submitted'), reflectionText: '' },
    { ...entry('whitespace', 'submitted'), reflectionText: ' \n ' },
    { ...entry('absent-1', 'none'), reflectionText: 'Not submitted yet' },
    { ...entry('absent-2', 'none'), reflectionText: 'Not submitted' },
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
          entry('00000000-0000-4000-8000-000000000002', 'none'),
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
