import { fireEvent, render } from '@testing-library/react-native';
import { Animated, Modal, ScrollView, StyleSheet } from 'react-native';
import { DaySheet } from './DaySheet';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('./useEntryMotion', () => jest.requireActual('./useEntryMotion.ts'));

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
