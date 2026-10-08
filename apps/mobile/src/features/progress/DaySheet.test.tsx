import { fireEvent, render } from '@testing-library/react-native';
import { Animated, Modal, StyleSheet } from 'react-native';
import { DaySheet } from './DaySheet';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('./useEntryMotion', () => jest.requireActual('./useEntryMotion.ts'));

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
