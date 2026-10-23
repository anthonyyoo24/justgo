import { fireEvent, render } from '@testing-library/react-native';
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import * as calendar from '../calendar-dates';
import type { ProgressEntry } from '../types';
import { DaySheet } from './DaySheet';
import { DayEntryList } from './entries/DayEntryList';

let mockReduceMotion = true;
jest.mock('../../../platform/motion/motion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));
beforeEach(() => {
  mockReduceMotion = true;
});
jest.mock('./entries/useEntryMotion', () =>
  jest.requireActual('./entries/useEntryMotion.ts'),
);

it('bounds initial mounting for 41 attempts and updates only the selected row with current callbacks', () => {
  const entries: ProgressEntry[] = Array.from({ length: 41 }, (_, index) => ({
    attemptId: `attempt-${index}`,
    instruction: `Synthetic challenge ${index}`,
    startedAt: '2026-10-10T16:00:00Z',
    timeZone: 'America/Toronto',
    reflectionStatus: 'none',
    feeling: null,
    reflectionText: null,
  }));
  const props = {
    date: '2026-10-10',
    day: { date: '2026-10-10', totalReps: 41, entries },
    loading: false,
    error: false,
    loadMoreError: false,
    hasMore: false,
    loadingMore: false,
    fetching: false,
    onClose: jest.fn(),
    onEditReflection: jest.fn(),
  };
  const format = jest.spyOn(calendar, 'activityTime');
  try {
    const screen = render(<DaySheet {...props} />);
    expect(screen.getByText('41 reps')).toBeTruthy();
    expect(screen.UNSAFE_getByType(DayEntryList).props.entries).toHaveLength(
      41,
    );
    expect(screen.getAllByRole('button', { name: /Rep \d+\./ })).toHaveLength(
      8,
    );
    expect(
      screen.queryByTestId('entry-details-content', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    format.mockClear();
    const latestEdit = jest.fn();
    screen.rerender(
      <DaySheet
        {...props}
        day={{ ...props.day, entries: entries.map((entry) => ({ ...entry })) }}
        onEditReflection={latestEdit}
      />,
    );
    expect(format).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: /Rep 1\./ }));
    expect(latestEdit).toHaveBeenCalledWith('attempt-0');
    expect(props.onEditReflection).not.toHaveBeenCalled();
    const latestClose = jest.fn((work: () => void) => work());
    screen.rerender(
      <DaySheet
        {...props}
        editingId="attempt-0"
        editor={<TextInput accessibilityLabel="Synthetic editor" />}
        beforeClose={latestClose}
      />,
    );
    expect(
      format.mock.calls.every(([instant]) => instant === entries[0]!.startedAt),
    ).toBe(true);
    // Both the selection and editor handoff leave the other seven rows untouched.
    expect(format).toHaveBeenCalledTimes(2);
    expect(
      screen.queryAllByTestId('entry-details-content', {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: /Rep 1.*Cancel/ }));
    expect(latestClose).toHaveBeenCalledTimes(1);
    const input = screen.getByLabelText('Synthetic editor');
    const nearEnd = {
      nativeEvent: {
        contentOffset: { y: 100 },
        contentSize: { height: 700 },
        layoutMeasurement: { height: 500 },
      },
    };
    for (let page = 0; page < 5; page++)
      fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), nearEnd);
    expect(screen.getByRole('button', { name: /Rep 41\./ })).toBeTruthy();
    expect(screen.getByLabelText('Synthetic editor')).toBe(input);
    screen.rerender(<DaySheet {...props} date={null} day={undefined} />);
    screen.rerender(<DaySheet {...props} />);
    expect(screen.getAllByRole('button', { name: /Rep \d+\./ })).toHaveLength(
      8,
    );
    screen.unmount();
  } finally {
    format.mockRestore();
  }
});

it.each([400, 900])(
  'centers the offline message below the header within a %s-point screen',
  (height) => {
    const dimensions = jest
      .spyOn(
        require('react-native') as typeof import('react-native'),
        'useWindowDimensions',
      )
      .mockReturnValue({ width: 390, height, scale: 3, fontScale: 1 });
    const onClose = jest.fn();
    try {
      const screen = render(
        <DaySheet
          date="2026-09-17"
          loading={false}
          error={false}
          loadMoreError={false}
          hasMore={false}
          loadingMore={false}
          fetching={false}
          connectionRequired
          onClose={onClose}
        />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        "You're currently offline",
      );
      expect(
        screen.getByText(
          'Connect to the internet to view this day’s activity.',
        ),
      ).toBeTruthy();
      expect(screen.queryByTestId('day-sheet-entry-list')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Try loading attempts again' }),
      ).toBeNull();
      expect(screen.getByTestId('day-sheet-panel')).toHaveStyle({
        minHeight: Math.min(470, height * 0.78),
      });
      expect(
        StyleSheet.flatten(
          screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle,
        ),
      ).toMatchObject({
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
      });
      expect(
        screen.getByTestId('day-initial-error-illustration', {
          includeHiddenElements: true,
        }).props['aria-hidden'],
      ).toBe(true);
      fireEvent.press(
        screen.getAllByRole('button', { name: 'Close day details' })[0]!,
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      screen.unmount();
    } finally {
      dimensions.mockRestore();
    }
  },
);

it('opens and closes immediately with reduced motion, including repeated show/layout events', () => {
  const timing = jest.spyOn(Animated, 'timing');
  const onClose = jest.fn();
  try {
    const screen = render(
      <DaySheet
        date="2026-09-18"
        loading={false}
        error={false}
        loadMoreError={false}
        hasMore={false}
        loadingMore={false}
        fetching={false}
        onClose={onClose}
      />,
    );
    fireEvent(screen.UNSAFE_getByType(Modal), 'show');
    fireEvent(screen.getByTestId('day-sheet-panel'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 360 } },
    });
    expect(timing).not.toHaveBeenCalled();
    expect(
      StyleSheet.flatten(screen.getByTestId('day-sheet-panel').props.style)
        .transform,
    ).toEqual([{ translateY: 0 }]);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('day-title-underline-layer', {
          includeHiddenElements: true,
        }).props.style,
      ).pointerEvents,
    ).toBe('none');
    fireEvent.press(screen.getByText('×'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(timing).not.toHaveBeenCalled();
  } finally {
    timing.mockRestore();
  }
});

it.each(['opening', 'closing'])(
  'settles an in-flight %s when reduced motion becomes enabled',
  (stage) => {
    mockReduceMotion = false;
    const onClose = jest.fn();
    const props = {
      date: '2026-09-18',
      loading: false,
      error: false,
      loadMoreError: false,
      hasMore: false,
      loadingMore: false,
      fetching: false,
      onClose,
    };
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    try {
      const screen = render(<DaySheet {...props} />);
      fireEvent(screen.UNSAFE_getByType(Modal), 'show');
      if (stage === 'closing') fireEvent.press(screen.getByText('×'));
      mockReduceMotion = true;
      screen.rerender(<DaySheet {...props} />);
      expect(onClose).toHaveBeenCalledTimes(stage === 'closing' ? 1 : 0);
      if (stage === 'opening')
        expect(
          StyleSheet.flatten(screen.getByTestId('day-sheet-panel').props.style)
            .transform,
        ).toEqual([{ translateY: 0 }]);
      screen.unmount();
    } finally {
      timing.mockRestore();
    }
  },
);

it('ignores an exit callback delivered after its sheet unmounts', () => {
  mockReduceMotion = false;
  let finish!: (result: { finished: boolean }) => void;
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: (callback) => {
      finish = callback!;
    },
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const onClose = jest.fn();
  try {
    const screen = render(
      <DaySheet
        date="2026-09-18"
        loading={false}
        error={false}
        loadMoreError={false}
        hasMore={false}
        loadingMore={false}
        fetching={false}
        onClose={onClose}
      />,
    );
    fireEvent.press(screen.getByText('×'));
    screen.unmount();
    finish({ finished: true });
    expect(onClose).not.toHaveBeenCalled();
  } finally {
    timing.mockRestore();
  }
});
