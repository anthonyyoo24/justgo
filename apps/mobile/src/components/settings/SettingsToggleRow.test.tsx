import { fireEvent, render } from '@testing-library/react-native';
import { Platform, StyleSheet, Switch } from 'react-native';
import { SettingsToggleRow } from './SettingsToggleRow';

jest.mock('expo-router', () => ({ Link: () => null }));
const props = {
  icon: 'motion' as const,
  label: 'Reduce motion',
  hint: 'Reduce animated movement.',
  value: false,
  disabled: false,
  busy: false,
  onValueChange: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

it('exposes one controlled accessible switch without a native switch that can emit its own haptics', () => {
  const screen = render(<SettingsToggleRow {...props} />);
  const toggle = screen.getByRole('switch', { name: 'Reduce motion' });
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  expect(screen.UNSAFE_queryByType(Switch)).toBeNull();
  expect(toggle.props.accessibilityHint).toBe(props.hint);
  expect(toggle.props.accessibilityState.checked).toBe(false);
  fireEvent.press(toggle);
  expect(props.onValueChange.mock.calls).toEqual([[true]]);
  expect(toggle.props.accessibilityState.checked).toBe(false);
  screen.rerender(<SettingsToggleRow {...props} value />);
  fireEvent.press(screen.getByRole('switch'));
  expect(props.onValueChange.mock.calls).toEqual([[true], [false]]);
});

it('reports disabled/busy state and blocks input until its owner finishes', () => {
  const screen = render(<SettingsToggleRow {...props} disabled busy />);
  const toggle = screen.getByRole('switch');
  expect(toggle).toBeDisabled();
  expect(toggle.props.accessibilityState.busy).toBe(true);
  fireEvent.press(toggle);
  expect(props.onValueChange).not.toHaveBeenCalled();
});

it('keeps the icon and label at full opacity through saving and settled states', () => {
  const screen = render(<SettingsToggleRow {...props} />);
  const rowOpacity = () =>
    StyleSheet.flatten(screen.getByRole('switch').props.style)?.opacity ?? 1;
  expect(rowOpacity()).toBe(1);
  screen.rerender(<SettingsToggleRow {...props} disabled busy />);
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(rowOpacity()).toBe(1);
  screen.rerender(<SettingsToggleRow {...props} value />);
  expect(rowOpacity()).toBe(1);
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
});

it('handles Space once on web without scrolling, and ignores disabled or unrelated input', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const screen = render(<SettingsToggleRow {...props} />);
  const preventDefault = jest.fn();
  fireEvent(screen.getByRole('switch'), 'keyDown', {
    key: 'Tab',
    preventDefault,
  });
  expect(props.onValueChange).not.toHaveBeenCalled();
  fireEvent(screen.getByRole('switch'), 'keyDown', {
    key: ' ',
    preventDefault,
  });
  expect(props.onValueChange.mock.calls).toEqual([[true]]);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  screen.rerender(<SettingsToggleRow {...props} disabled />);
  // Even a delivered DOM callback must not bypass the disabled input guard.
  screen.getByRole('switch').props.onKeyDown({
    key: 'Spacebar',
    preventDefault,
  });
  expect(props.onValueChange).toHaveBeenCalledTimes(1);
  expect(preventDefault).toHaveBeenCalledTimes(2);
});
