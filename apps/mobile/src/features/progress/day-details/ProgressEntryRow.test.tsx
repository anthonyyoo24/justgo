import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Animated, Image, TextInput } from 'react-native';
import type { ProgressEntry } from '../types';
import { ProgressEntryRow } from './ProgressEntryRow';
import { SlidingEntryDetails } from './SlidingEntryDetails';

// Exercise measurement/orchestration with the browser driver; the paired native
// adapter has its own tests and recorded simulator frame verification.
jest.mock('./useEntryMotion', () => jest.requireActual('./useEntryMotion.ts'));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

const savedEntry: ProgressEntry = {
  attemptId: '00000000-0000-4000-8000-000000000001',
  startedAt: '2026-09-18T13:15:00.000Z',
  timeZone: 'America/Toronto',
  instruction: 'Say hello to someone',
  reflectionStatus: 'none',
  feeling: null,
  reflectionText: null,
};

it('opens Add from the title, ordinal, feeling and metadata with padded row coverage', () => {
  const onEdit = jest.fn();
  const onToggle = jest.fn();
  const screen = render(
    <ProgressEntryRow
      entry={savedEntry}
      index={0}
      expanded={false}
      onToggle={onToggle}
      onEdit={onEdit}
      reduceMotion
    />,
  );
  expect(screen.getByRole('button').props.hitSlop).toEqual({
    top: 12,
    bottom: 12,
  });
  for (const text of ['Say hello to someone', '01', 'Feeling', '9:15 AM'])
    fireEvent.press(screen.getByText(text));
  expect(onEdit).toHaveBeenCalledTimes(4);
  expect(onToggle).not.toHaveBeenCalled();
});

it('slides the editor from zero height using the saved-reflection motion and collapses on close', () => {
  const start = jest.fn();
  const stop = jest.fn();
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start,
    stop,
  } as unknown as ReturnType<typeof Animated.timing>);
  try {
    const props = {
      entry: savedEntry,
      index: 0,
      expanded: false,
      onToggle: jest.fn(),
      onEdit: jest.fn(),
      reduceMotion: false,
    };
    const screen = render(<ProgressEntryRow {...props} />);
    timing.mockClear();
    screen.rerender(
      <ProgressEntryRow
        {...props}
        expanded
        editor={<TextInput accessibilityLabel="Your day reflection" />}
      />,
    );
    const details = screen.getByTestId('sliding-entry-details');
    expect(details).toHaveStyle({ opacity: 0, height: 0 });
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 12 } },
    });
    expect(timing).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 144 } },
    });
    expect(timing).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        toValue: 1,
        duration: 240,
        useNativeDriver: false,
      }),
    );
    expect(start).toHaveBeenCalled();
    timing.mockClear();
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 144.2 } },
    });
    expect(timing).not.toHaveBeenCalled();
    screen.rerender(<ProgressEntryRow {...props} />);
    expect(screen.queryByLabelText('Your day reflection')).toBeNull();
    expect(timing).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0, duration: 230 }),
    );
    expect(stop).toHaveBeenCalled();
    expect(
      screen.getByTestId('sliding-entry-details', {
        includeHiddenElements: true,
      }).props.pointerEvents,
    ).toBe('none');
    screen.unmount();
    expect(stop).toHaveBeenCalledTimes(4);
  } finally {
    timing.mockRestore();
  }
});

it('premeasures a closed Add row without mounting an input, then starts its reveal immediately', () => {
  const parallel = jest.spyOn(Animated, 'parallel').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.parallel>);
  try {
    const props = {
      entry: savedEntry,
      index: 0,
      expanded: false,
      onToggle: jest.fn(),
      onEdit: jest.fn(),
      reduceMotion: false,
    };
    const screen = render(<ProgressEntryRow {...props} />);
    expect(screen.queryByLabelText('Your day reflection')).toBeNull();
    expect(screen.queryByTestId('reflection-editor-measurement')).toBeNull();
    expect(
      screen.getByTestId('reflection-editor-measurement', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    fireEvent(
      screen.getByTestId('entry-details-content', {
        includeHiddenElements: true,
      }),
      'layout',
      { nativeEvent: { layout: { height: 144 } } },
    );
    parallel.mockClear();
    screen.rerender(
      <ProgressEntryRow
        {...props}
        editing
        editor={<TextInput accessibilityLabel="Your day reflection" />}
      />,
    );
    expect(parallel).toHaveBeenCalledTimes(1);
    expect(
      within(screen.getByTestId('reflection-action')).getByText('Cancel'),
    ).toBeTruthy();
    // The input's first identical native measurement must not restart the slide.
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 144 } },
    });
    expect(parallel).toHaveBeenCalledTimes(1);
    screen.unmount();
  } finally {
    parallel.mockRestore();
  }
});

it('shows and closes the editor immediately with reduced motion', () => {
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const props = {
      entry: savedEntry,
      index: 0,
      onToggle: jest.fn(),
      onEdit: jest.fn(),
      reduceMotion: true,
    };
    const screen = render(
      <ProgressEntryRow
        {...props}
        expanded
        editor={<TextInput accessibilityLabel="Your day reflection" />}
      />,
    );
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 144 } },
    });
    expect(screen.getByTestId('sliding-entry-details')).toHaveStyle({
      opacity: 1,
      height: 144,
    });
    screen.rerender(<ProgressEntryRow {...props} expanded={false} />);
    expect(screen.queryByLabelText('Your day reflection')).toBeNull();
    expect(
      screen.getByTestId('sliding-entry-details', {
        includeHiddenElements: true,
      }),
    ).toHaveStyle({ opacity: 0, height: 0 });
    expect(timing).not.toHaveBeenCalled();
  } finally {
    timing.mockRestore();
  }
});

it('keeps Edit visible while resizing from the saved reflection height', () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.timing>);
  try {
    const props = {
      entry: {
        ...savedEntry,
        reflectionStatus: 'submitted' as const,
        reflectionText: 'A saved reflection.',
      },
      index: 0,
      expanded: true,
      onToggle: jest.fn(),
      onEdit: jest.fn(),
      reduceMotion: false,
    };
    const screen = render(<ProgressEntryRow {...props} />);
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 84 } },
    });
    const height = timing.mock.calls[0]![0] as Animated.Value;
    const reveal = timing.mock.calls[1]![0] as Animated.Value;
    act(() => {
      height.setValue(84);
      reveal.setValue(1);
    });
    timing.mockClear();
    screen.rerender(
      <ProgressEntryRow
        {...props}
        editor={<TextInput accessibilityLabel="Your day reflection" />}
      />,
    );
    expect(screen.getByTestId('sliding-entry-details')).toHaveStyle({
      height: 84,
      opacity: 1,
    });
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 156 } },
    });
    expect(timing).toHaveBeenCalledWith(
      height,
      expect.objectContaining({ toValue: 156, duration: 240 }),
    );
    expect(timing).toHaveBeenLastCalledWith(
      reveal,
      expect.objectContaining({ toValue: 1, duration: 240 }),
    );
  } finally {
    timing.mockRestore();
  }
});

it('keeps Cancel and its close icon stable if Add content is temporarily unavailable during a refresh', () => {
  const onToggle = jest.fn();
  const props = {
    entry: savedEntry,
    index: 0,
    expanded: false,
    onToggle,
    onEdit: jest.fn(),
    reduceMotion: true,
    editing: true,
  };
  const screen = render(<ProgressEntryRow {...props} editor={<TextInput />} />);
  for (const editor of [undefined, <TextInput key="restored" />]) {
    screen.rerender(<ProgressEntryRow {...props} editor={editor} />);
    expect(screen.getByRole('button', { name: /Rep 1.*Cancel/ })).toHaveProp(
      'accessibilityState',
      { expanded: true },
    );
    expect(
      within(screen.getByTestId('reflection-action')).getByText('Cancel'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('cancel-reflection-icon', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('reflection-chevron', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(screen.queryByText('Hide Reflection')).toBeNull();
    expect(screen.queryByText('Add reflection')).toBeNull();
    expect(
      screen.queryByTestId('add-reflection-icon', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    fireEvent.press(screen.getByRole('button'));
  }
  expect(onToggle).toHaveBeenCalledTimes(2);
  expect(props.onEdit).not.toHaveBeenCalled();
  screen.rerender(<ProgressEntryRow {...props} editing={false} />);
  expect(screen.getByText('Add reflection')).toBeTruthy();
  expect(
    screen.getByTestId('add-reflection-icon', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(
    screen.queryByTestId('cancel-reflection-icon', {
      includeHiddenElements: true,
    }),
  ).toBeNull();
});

it.each(['America/Toronto', 'Europe/London'])(
  'aligns View/Hide without a leading pencil, retaining the Edit pencil (zone: %s)',
  (timeZone) => {
    const props = {
      entry: {
        ...savedEntry,
        timeZone,
        reflectionStatus: 'submitted' as const,
        reflectionText: 'A saved reflection.',
      },
      index: 0,
      onToggle: jest.fn(),
      onEdit: jest.fn(),
      reduceMotion: true,
    };
    const screen = render(<ProgressEntryRow {...props} expanded={false} />);
    expect(screen.getByText('View Reflection')).toBeTruthy();
    expect(
      within(screen.getByTestId('reflection-action')).UNSAFE_queryAllByType(
        Image,
      ),
    ).toHaveLength(0);
    expect(
      screen.getByTestId('reflection-chevron', { includeHiddenElements: true }),
    ).toBeTruthy();
    screen.rerender(<ProgressEntryRow {...props} expanded />);
    expect(
      screen.getByRole('button', { name: /Rep 1.*Hide Reflection/ }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('reflection-action')).UNSAFE_queryAllByType(
        Image,
      ),
    ).toHaveLength(0);
    expect(
      within(
        screen.getByRole('button', { name: 'Edit reflection' }),
      ).UNSAFE_getByType(Image),
    ).toBeTruthy();
    expect(
      screen.getByTestId('reflection-chevron', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('cancel-reflection-icon', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    fireEvent.press(
      screen.getByRole('button', { name: /Rep 1.*Hide Reflection/ }),
    );
    expect(props.onToggle).toHaveBeenCalledTimes(1);
    expect(props.onEdit).not.toHaveBeenCalled();
  },
);

it('notifies focus only after a completed reveal and fences cancelled or unmounted completions', () => {
  const completions: Array<(result: { finished: boolean }) => void> = [];
  const stop = jest.fn();
  const parallel = jest.spyOn(Animated, 'parallel').mockReturnValue({
    start: (callback: (result: { finished: boolean }) => void) =>
      completions.push(callback),
    stop,
  } as unknown as ReturnType<typeof Animated.parallel>);
  const onOpened = jest.fn();
  const props = {
    open: true,
    contentKey: 'editor' as const,
    reduceMotion: false,
    onOpened,
  };
  try {
    const screen = render(
      <SlidingEntryDetails {...props}>
        <TextInput />
      </SlidingEntryDetails>,
    );
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 144 } },
    });
    expect(onOpened).not.toHaveBeenCalled();
    act(() => completions[0]!({ finished: false }));
    expect(onOpened).not.toHaveBeenCalled();
    screen.rerender(
      <SlidingEntryDetails {...props} open={false}>
        <TextInput />
      </SlidingEntryDetails>,
    );
    act(() => completions[0]!({ finished: true }));
    expect(onOpened).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    screen.rerender(
      <SlidingEntryDetails {...props}>
        <TextInput />
      </SlidingEntryDetails>,
    );
    act(() => completions.at(-1)!({ finished: true }));
    expect(onOpened).toHaveBeenCalledTimes(1);
    const late = completions.at(-1)!;
    screen.unmount();
    act(() => late({ finished: true }));
    expect(onOpened).toHaveBeenCalledTimes(1);
  } finally {
    parallel.mockRestore();
  }
});

it('waits for a fresh editor measurement even when it matches the saved text height', () => {
  const parallel = jest.spyOn(Animated, 'parallel').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.parallel>);
  try {
    const screen = render(
      <SlidingEntryDetails open contentKey="saved" reduceMotion={false}>
        <TextInput />
      </SlidingEntryDetails>,
    );
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 144 } },
    });
    parallel.mockClear();
    screen.rerender(
      <SlidingEntryDetails open contentKey="editor" reduceMotion={false}>
        <TextInput />
      </SlidingEntryDetails>,
    );
    expect(parallel).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
      nativeEvent: { layout: { height: 144 } },
    });
    expect(parallel).toHaveBeenCalledTimes(1);
    screen.unmount();
  } finally {
    parallel.mockRestore();
  }
});

it.each([
  ['America/Toronto', '9:15 AM'],
  ['Europe/London', '2:15 PM'],
])(
  'shows the captured start in its display time zone (%s)',
  (timeZone, time) => {
    const screen = render(
      <ProgressEntryRow
        entry={{ ...savedEntry, timeZone: timeZone! }}
        index={0}
        expanded={false}
        onToggle={jest.fn()}
        reduceMotion
      />,
    );

    expect(screen.getByText(time!)).toBeTruthy();
    expect(
      screen.getByLabelText(
        `Rep 1. Say hello to someone. ${time}. Feeling: Not recorded`,
      ),
    ).toBeTruthy();
  },
);

it('uses the captured start time when displaying saved reflection controls', () => {
  const onToggle = jest.fn();
  const screen = render(
    <ProgressEntryRow
      entry={{
        ...savedEntry,
        startedAt: '2026-09-18T12:05:00.000Z',
        reflectionStatus: 'submitted' as const,
        reflectionText: 'A small step.',
      }}
      index={0}
      expanded={false}
      onToggle={onToggle}
      reduceMotion
    />,
  );

  expect(
    screen.getByTestId('entry-clock-icon', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.getByText('8:05 AM')).toBeTruthy();
  expect(screen.queryByText('9:15 AM')).toBeNull();
  const row = screen.getByRole('button', {
    name: 'Rep 1. Say hello to someone. 8:05 AM. Feeling: Not recorded. View Reflection',
  });
  fireEvent.press(row);
  expect(onToggle).toHaveBeenCalledTimes(1);
});
