import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, TextInput } from 'react-native';
import { legacyProgressEntrySchema } from '@justgo/contracts';
import { ProgressEntryRow } from './ProgressEntryRow';

const legacyEntry = {
  attemptId: '00000000-0000-4000-8000-000000000001',
  completedAt: '2026-09-18T13:15:00.000Z',
  timeZone: 'America/Toronto',
  cardId: 'ST-01',
  venue: 'streets',
  challengeId: 'hello',
  revisionId: 'hello-v1',
  levelId: 'level-1',
  instruction: 'Say hello to someone',
  feelingVersion: 1,
  reflectionStatus: 'none',
  feeling: null,
  reflectionText: null,
};

it('opens Add from the title, ordinal, feeling and metadata with padded row coverage', () => {
  const onEdit = jest.fn();
  const onToggle = jest.fn();
  const screen = render(
    <ProgressEntryRow
      entry={legacyProgressEntrySchema.parse(legacyEntry)}
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
      entry: legacyProgressEntrySchema.parse(legacyEntry),
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

it('shows and closes the editor immediately with reduced motion', () => {
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const props = {
      entry: legacyProgressEntrySchema.parse(legacyEntry),
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

it('slides Edit in while resizing from the visible saved reflection height', () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.timing>);
  try {
    const props = {
      entry: legacyProgressEntrySchema.parse({
        ...legacyEntry,
        reflectionStatus: 'submitted',
        reflectionText: 'A saved reflection.',
      }),
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
      opacity: 0,
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

it('preserves the completion time for an existing legacy history row', () => {
  const screen = render(
    <ProgressEntryRow
      entry={legacyProgressEntrySchema.parse(legacyEntry)}
      index={0}
      expanded={false}
      onToggle={jest.fn()}
      reduceMotion
    />,
  );

  expect(screen.getByText('9:15 AM')).toBeTruthy();
  expect(
    screen.getByLabelText(
      'Rep 1. Say hello to someone. 9:15 AM. Feeling: Not recorded',
    ),
  ).toBeTruthy();
});

it.each([null, '2026-09-18T13:15:00.000Z'])(
  'uses the activity timestamp when the completion timestamp is %s',
  (completedAt) => {
    const screen = render(
      <ProgressEntryRow
        entry={legacyProgressEntrySchema.parse({
          ...legacyEntry,
          completedAt,
          activityAt: '2026-09-18T12:05:00.000Z',
          cardId: null,
          revisionId: null,
        })}
        index={0}
        expanded={false}
        onToggle={jest.fn()}
        reduceMotion
      />,
    );

    expect(screen.getByText('8:05 AM')).toBeTruthy();
    expect(screen.queryByText('9:15 AM')).toBeNull();
    expect(
      screen.getByLabelText(
        'Rep 1. Say hello to someone. 8:05 AM. Feeling: Not recorded',
      ),
    ).toBeTruthy();
  },
);

it('omits unknown time without hiding the entry or its reflection action', () => {
  const onToggle = jest.fn();
  const screen = render(
    <ProgressEntryRow
      entry={legacyProgressEntrySchema.parse({
        ...legacyEntry,
        completedAt: null,
        cardId: null,
        revisionId: null,
        reflectionStatus: 'submitted',
        reflectionText: 'A small step.',
      })}
      index={0}
      expanded={false}
      onToggle={onToggle}
      reduceMotion
    />,
  );

  expect(screen.queryByTestId('entry-clock-icon')).toBeNull();
  const row = screen.getByRole('button', {
    name: 'Rep 1. Say hello to someone. Feeling: Not recorded. View Reflection',
  });
  fireEvent.press(row);
  expect(onToggle).toHaveBeenCalledTimes(1);
});
