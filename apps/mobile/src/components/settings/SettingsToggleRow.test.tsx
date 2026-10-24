import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, Platform, StyleSheet } from 'react-native';
import { SettingsToggleRow } from './SettingsToggleRow';

jest.mock('expo-router', () => ({ Link: () => null }));
const props = {
  icon: 'motion' as const,
  label: 'Reduce motion',
  hint: 'Reduce animated movement.',
  value: false,
  disabled: false,
  busy: false,
  reduceMotion: false,
  onValueChange: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

function animatedStyles(screen: Awaited<ReturnType<typeof render>>) {
  // Advance the controlled Animated.Value, then inspect rendered host geometry.
  // Native frame delivery remains a device acceptance check.
  const thumb = screen.getByTestId('settings-toggle-thumb');
  const fill = screen.getByTestId('settings-toggle-fill');
  return {
    position: StyleSheet.flatten(thumb.props.style).transform[0].translateX,
    opacity: StyleSheet.flatten(fill.props.style).opacity,
  };
}

it('slides the thumb and fades only the track after a controlled value change', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const screen = await render(<SettingsToggleRow {...props} />);
  expect(animatedStyles(screen)).toEqual({ position: 0, opacity: 0 });
  await screen.rerender(<SettingsToggleRow {...props} value />);
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  const progress = timing.mock.calls[0]![0] as Animated.Value;
  await act(() => progress.setValue(0.5));
  expect(animatedStyles(screen)).toEqual({ position: 10, opacity: 0.5 });
  await act(() => progress.setValue(1));
  expect(animatedStyles(screen)).toEqual({ position: 20, opacity: 1 });
  await screen.rerender(<SettingsToggleRow {...props} />);
  expect(timing.mock.calls[1]![0]).toBe(progress);
  expect(timing.mock.calls[1]![1].toValue).toBe(0);
});

it('cancels movement immediately when Reduce Motion becomes enabled', async () => {
  const stop = jest.fn();
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop,
    reset: jest.fn(),
  });
  const screen = await render(<SettingsToggleRow {...props} />);
  await screen.rerender(<SettingsToggleRow {...props} value />);
  const progress = timing.mock.calls[0]![0] as Animated.Value;
  await act(() => progress.setValue(0.4));
  await screen.rerender(<SettingsToggleRow {...props} value reduceMotion />);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(animatedStyles(screen)).toEqual({ position: 20, opacity: 1 });
  await screen.rerender(<SettingsToggleRow {...props} reduceMotion />);
  expect(animatedStyles(screen)).toEqual({ position: 0, opacity: 0 });
  expect(timing).toHaveBeenCalledTimes(1);
});

it('does not restart movement for saving-only updates and cancels on unmount or reversal', async () => {
  const start = jest.fn();
  const stop = jest.fn();
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start,
    stop,
    reset: jest.fn(),
  });
  const screen = await render(<SettingsToggleRow {...props} />);
  expect(timing).not.toHaveBeenCalled();
  await screen.rerender(<SettingsToggleRow {...props} value />);
  expect(start).toHaveBeenCalledTimes(1);
  await screen.rerender(<SettingsToggleRow {...props} value disabled busy />);
  expect(start).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
  await screen.rerender(<SettingsToggleRow {...props} />);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(2);
  await screen.unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

it.each(['ios', 'web'] as const)(
  'uses a short nonblocking transition on %s',
  async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    const screen = await render(<SettingsToggleRow {...props} value />);
    expect(timing).not.toHaveBeenCalled();
    expect(animatedStyles(screen)).toEqual({ position: 20, opacity: 1 });
    await screen.rerender(<SettingsToggleRow {...props} />);
    expect(timing.mock.calls[0]![1]).toMatchObject({
      toValue: 0,
      duration: 200,
      useNativeDriver: platform !== 'web',
      isInteraction: false,
    });
  },
);

it('exposes one controlled accessible switch without a native switch that can emit its own haptics', async () => {
  const screen = await render(<SettingsToggleRow {...props} />);
  const toggle = screen.getByRole('switch', { name: 'Reduce motion' });
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  expect(
    screen.container.queryAll((node) => node.type.endsWith('Switch')),
  ).toHaveLength(0);
  expect(toggle.props.accessibilityHint).toBe(props.hint);
  expect(toggle.props.accessibilityState.checked).toBe(false);
  await fireEvent.press(toggle);
  expect(props.onValueChange.mock.calls).toEqual([[true]]);
  expect(toggle.props.accessibilityState.checked).toBe(false);
  await screen.rerender(<SettingsToggleRow {...props} value />);
  await fireEvent.press(screen.getByRole('switch'));
  expect(props.onValueChange.mock.calls).toEqual([[true], [false]]);
});

it('reports disabled/busy state and blocks input until its owner finishes', async () => {
  const screen = await render(<SettingsToggleRow {...props} disabled busy />);
  const toggle = screen.getByRole('switch');
  expect(toggle).toBeDisabled();
  expect(toggle.props.accessibilityState.busy).toBe(true);
  await fireEvent.press(toggle);
  expect(props.onValueChange).not.toHaveBeenCalled();
});

it('keeps the icon and label at full opacity through saving and settled states', async () => {
  const screen = await render(<SettingsToggleRow {...props} />);
  const rowOpacity = () =>
    StyleSheet.flatten(screen.getByRole('switch').props.style)?.opacity ?? 1;
  expect(rowOpacity()).toBe(1);
  await screen.rerender(<SettingsToggleRow {...props} disabled busy />);
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(rowOpacity()).toBe(1);
  await screen.rerender(<SettingsToggleRow {...props} value />);
  expect(rowOpacity()).toBe(1);
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
});

it('handles Space once on web without scrolling, and ignores disabled or unrelated input', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const screen = await render(<SettingsToggleRow {...props} />);
  const preventDefault = jest.fn();
  await fireEvent(screen.getByRole('switch'), 'keyDown', {
    nativeEvent: { key: 'Tab' },
    preventDefault,
  });
  expect(props.onValueChange).not.toHaveBeenCalled();
  await fireEvent(screen.getByRole('switch'), 'keyDown', {
    nativeEvent: { key: ' ' },
    preventDefault,
  });
  expect(props.onValueChange.mock.calls).toEqual([[true]]);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  await screen.rerender(<SettingsToggleRow {...props} disabled />);
  // Even a delivered DOM callback must not bypass the disabled input guard.
  screen.getByRole('switch').props.onKeyDown({
    nativeEvent: { key: 'Spacebar' },
    preventDefault,
  });
  expect(props.onValueChange).toHaveBeenCalledTimes(1);
  expect(preventDefault).toHaveBeenCalledTimes(2);
});
