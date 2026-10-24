import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';

import { colors } from '../../theme/tokens';
import { ProgressView } from './ProgressView';

jest.mock('react-native-svg', () =>
  jest.requireActual('../../../test-support/svg'),
);

jest.mock('expo-router', () => ({ Link: () => null }));
jest.mock('../../platform/motion/motion', () => ({
  useReduceMotion: () => false,
}));
jest.mock('./day-details/entries/useEntryMotion', () =>
  jest.requireActual('./day-details/entries/useEntryMotion.ts'),
);

import { month, entry, callbacks } from '../../../test-support/progress/view';

it('opens only active days and shows empty circles for attempts without submitted feedback', async () => {
  const actions = callbacks();
  const screen = await render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...actions}
    />,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Friday, September 18, 2 reps' }),
  );
  expect(actions.onOpenDay).toHaveBeenCalledWith('2026-09-18');
  expect(
    screen.queryByRole('button', { name: /Saturday, September 19/ }),
  ).toBeNull();
  await screen.rerender(
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
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  await waitFor(() => expect(actions.onCloseDay).toHaveBeenCalledTimes(1));
});

it('shows a full-screen backdrop while only the day sheet slides', async () => {
  const screen = await render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      {...callbacks()}
    />,
  );

  expect(
    screen.container.queryAll((node) => node.type === 'Modal')[0]!.props
      .animationType,
  ).toBe('none');
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
  async (firstEvent) => {
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
    } as unknown as ReturnType<typeof Animated.timing>);
    try {
      const screen = await render(
        <ProgressView
          month="2026-09"
          data={month}
          selectedDate="2026-09-18"
          {...callbacks()}
        />,
      );
      expect(timing).not.toHaveBeenCalled();

      const layout = async () =>
        await fireEvent(screen.getByTestId('day-sheet-panel'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 514, width: 402, height: 360 } },
        });
      if (firstEvent === 'layout') await layout();
      else
        await fireEvent(
          screen.container.queryAll((node) => node.type === 'Modal')[0]!,
          'show',
        );
      expect(timing).toHaveBeenCalledTimes(1);
      const offset = timing.mock.calls[0]![0] as Animated.Value;
      let observedOffset = 0;
      const listener = offset.addListener(({ value }) => {
        observedOffset = value;
      });

      await act(() => offset.setValue(300));
      await layout();
      await fireEvent(
        screen.container.queryAll((node) => node.type === 'Modal')[0]!,
        'show',
      );
      expect(timing).toHaveBeenCalledTimes(1);
      expect(observedOffset).toBe(300);

      await act(() => offset.setValue(0));
      await layout();
      await fireEvent(
        screen.container.queryAll((node) => node.type === 'Modal')[0]!,
        'show',
      );
      expect(timing).toHaveBeenCalledTimes(1);
      expect(observedOffset).toBe(0);
      offset.removeListener(listener);
    } finally {
      timing.mockRestore();
    }
  },
);

it('keeps the current slide when day data arrives and a show event arrives during closing', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.timing>);
  try {
    const actions = callbacks();
    const screen = await render(
      <ProgressView
        month="2026-09"
        data={month}
        selectedDate="2026-09-18"
        dayLoading
        {...actions}
      />,
    );
    await fireEvent(
      screen.container.queryAll((node) => node.type === 'Modal')[0]!,
      'show',
    );
    const offset = timing.mock.calls[0]![0] as Animated.Value;
    const reset = jest.spyOn(offset, 'setValue');
    await screen.rerender(
      <ProgressView
        month="2026-09"
        data={month}
        selectedDate="2026-09-18"
        day={{
          date: '2026-09-18',
          totalReps: 1,
          entries: [entry('one', 'none')],
        }}
        {...actions}
      />,
    );
    expect(timing).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('day-sheet-panel'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 192, width: 402, height: 682 } },
    });
    expect(timing).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('×'));
    expect(timing).toHaveBeenCalledTimes(2);
    expect(timing.mock.calls[1]![1]).toMatchObject({ duration: 220 });
    await fireEvent(
      screen.container.queryAll((node) => node.type === 'Modal')[0]!,
      'show',
    );
    expect(timing).toHaveBeenCalledTimes(2);
    expect(reset).not.toHaveBeenCalled();
    reset.mockRestore();
  } finally {
    timing.mockRestore();
  }
});

it('starts a fresh slide for each active day and when reopening the same day', async () => {
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
    const screen = await render(view(null));
    expect(
      screen.container.queryAll((node) => node.type === 'Modal'),
    ).toHaveLength(0);
    expect(timing).not.toHaveBeenCalled();
    for (const [index, date] of [
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-27',
    ].entries()) {
      await screen.rerender(view(date));
      expect(timing).toHaveBeenCalledTimes(index);
      await fireEvent(
        screen.container.queryAll((node) => node.type === 'Modal')[0]!,
        'show',
      );
      await fireEvent(
        screen.container.queryAll((node) => node.type === 'Modal')[0]!,
        'show',
      );
      expect(timing).toHaveBeenCalledTimes(index + 1);
      await screen.rerender(view(null));
    }
    const values = timing.mock.calls.map(([value]) => value);
    expect(new Set(values).size).toBe(4);
  } finally {
    timing.mockRestore();
  }
});

it('keeps the marker behind the date and resizes it when the heading reflows', async () => {
  const screen = await render(
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

  await fireEvent(title, 'textLayout', {
    nativeEvent: { lines: [{ width: 320 }] },
  });
  expect(underline().props.width).toBeCloseTo(278.4);
  expect(
    underline().queryAll((node) => node.type === 'Path')[0]!.props.fill,
  ).toBe('#FEC9A2');

  // A narrower screen or larger system text can cause the date to wrap.
  await fireEvent(title, 'textLayout', {
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
  const screen = await render(
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

  await fireEvent.press(screen.getByText('×'));
  expect(backdrop).toHaveStyle({ backgroundColor: 'transparent' });
  expect(actions.onCloseDay).not.toHaveBeenCalled();
  await waitFor(() => expect(actions.onCloseDay).toHaveBeenCalledTimes(1));
  await screen.rerender(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...actions}
    />,
  );
  await screen.rerender(
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

it('keeps a past active day white while its details sheet is open', async () => {
  const screen = await render(
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
