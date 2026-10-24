import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '../../../theme/tokens';
import { selectedPillOffset, VenueTabs } from './VenueTabs';

jest.mock('react-native-svg', () =>
  jest.requireActual('../../../../test-support/svg'),
);

it('keeps differently sized selected pills fully visible while scrolling the row', () => {
  expect(selectedPillOffset({ x: 0, width: 88 }, 320, 700)).toBe(0);
  expect(selectedPillOffset({ x: 260, width: 86 }, 320, 700)).toBe(143);
  expect(selectedPillOffset({ x: 555, width: 130 }, 320, 700)).toBe(380);
});

it('leaves clearance above and below the pill border inside the scroll viewport', async () => {
  const screen = await render(
    <VenueTabs selected="streets" onSelect={() => {}} />,
  );
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

it('renders a road with a dashed center line for Streets in the pill color', async () => {
  const screen = await render(
    <VenueTabs selected="streets" onSelect={() => {}} />,
  );
  const road = () =>
    screen
      .getByRole('tab', { name: 'Streets' })
      .queryAll((node) => node.type === 'Path')[0]!.props;
  expect(road()).toMatchObject({
    d: 'M8 3 3.5 21M16 3l4.5 18M12 4v3m0 3v3m0 3v4',
    stroke: colors.white,
    strokeWidth: 1.4,
    fill: 'none',
  });
  await screen.rerender(<VenueTabs selected="park" onSelect={() => {}} />);
  expect(road().stroke).toBe(colors.ink);
  expect(
    screen
      .getByRole('tab', { name: 'Park' })
      .queryAll((node) => node.type === 'Path')[0]!.props.d,
  ).toBe(
    'M12 22V7m0 8c-8 1-11-6-7-8 0-6 7-8 9-3 6-2 9 6 4 8 0 3-3 4-6 3ZM5 22h14',
  );
});

it('keeps all six venues selectable and exposes the selected venue to assistive technology', async () => {
  const select = jest.fn();
  const screen = await render(<VenueTabs selected="gym" onSelect={select} />);
  expect(screen.getAllByRole('tab')).toHaveLength(6);
  expect(
    screen.getByRole('tab', { name: 'Gym' }).props.accessibilityState.selected,
  ).toBe(true);
  await fireEvent.press(screen.getByRole('tab', { name: 'Bars & Clubs' }));
  expect(select).toHaveBeenCalledWith('bars');
  await screen.rerender(<VenueTabs selected="bars" onSelect={select} />);
  expect(
    screen.getByRole('tab', { name: 'Gym' }).props.accessibilityState.selected,
  ).toBe(false);
  expect(
    screen.getByRole('tab', { name: 'Bars & Clubs' }).props.accessibilityState
      .selected,
  ).toBe(true);
});
it('prevents switching venues during an in-flight challenge action', async () => {
  const select = jest.fn();
  const screen = await render(
    <VenueTabs selected="cafe" disabled onSelect={select} />,
  );
  for (const tab of screen.getAllByRole('tab')) {
    expect(tab).toBeDisabled();
    await fireEvent.press(tab);
  }
  expect(select).not.toHaveBeenCalled();
});
