import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Path } from 'react-native-svg';
import { colors } from '../../../theme/tokens';
import { selectedPillOffset, VenueTabs } from './VenueTabs';

it('keeps differently sized selected pills fully visible while scrolling the row', () => {
  expect(selectedPillOffset({ x: 0, width: 88 }, 320, 700)).toBe(0);
  expect(selectedPillOffset({ x: 260, width: 86 }, 320, 700)).toBe(143);
  expect(selectedPillOffset({ x: 555, width: 130 }, 320, 700)).toBe(380);
});

it('leaves clearance above and below the pill border inside the scroll viewport', () => {
  const screen = render(<VenueTabs selected="streets" onSelect={() => {}} />);
  const row = screen.getByTestId('venue-tabs-scroll');
  const viewport = StyleSheet.flatten(row.props.style);
  const content = StyleSheet.flatten(row.props.contentContainerStyle);
  const touch = StyleSheet.flatten(
    screen.getByRole('tab', { name: 'Streets' }).props.style,
  );
  expect(content.paddingVertical).toBeGreaterThanOrEqual(4);
  expect(viewport.height - touch.minHeight).toBeGreaterThanOrEqual(
    2 * content.paddingVertical,
  );
});

it('renders a road with a dashed center line for Streets in the pill color', () => {
  const screen = render(<VenueTabs selected="streets" onSelect={() => {}} />);
  const road = () =>
    within(screen.getByRole('tab', { name: 'Streets' })).UNSAFE_getByType(Path)
      .props;
  expect(road()).toMatchObject({
    d: 'M8 3 3.5 21M16 3l4.5 18M12 4v3m0 3v3m0 3v4',
    stroke: colors.white,
    strokeWidth: 1.4,
    fill: 'none',
  });
  screen.rerender(<VenueTabs selected="park" onSelect={() => {}} />);
  expect(road().stroke).toBe(colors.ink);
  expect(
    within(screen.getByRole('tab', { name: 'Park' })).UNSAFE_getByType(Path)
      .props.d,
  ).toBe(
    'M12 22V7m0 8c-8 1-11-6-7-8 0-6 7-8 9-3 6-2 9 6 4 8 0 3-3 4-6 3ZM5 22h14',
  );
});

it('keeps all six venues selectable and exposes the selected venue to assistive technology', () => {
  const select = jest.fn();
  const screen = render(<VenueTabs selected="gym" onSelect={select} />);
  expect(screen.getAllByRole('tab')).toHaveLength(6);
  expect(
    screen.getByRole('tab', { name: 'Gym' }).props.accessibilityState.selected,
  ).toBe(true);
  fireEvent.press(screen.getByRole('tab', { name: 'Bars & Clubs' }));
  expect(select).toHaveBeenCalledWith('bars');
  screen.rerender(<VenueTabs selected="bars" onSelect={select} />);
  expect(
    screen.getByRole('tab', { name: 'Gym' }).props.accessibilityState.selected,
  ).toBe(false);
  expect(
    screen.getByRole('tab', { name: 'Bars & Clubs' }).props.accessibilityState
      .selected,
  ).toBe(true);
});
it('prevents switching venues during an in-flight challenge action', () => {
  const select = jest.fn();
  const screen = render(
    <VenueTabs selected="cafe" disabled onSelect={select} />,
  );
  for (const tab of screen.getAllByRole('tab')) {
    expect(tab).toBeDisabled();
    fireEvent.press(tab);
  }
  expect(select).not.toHaveBeenCalled();
});
