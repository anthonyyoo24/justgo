import { fireEvent, render } from '@testing-library/react-native';
import { VenueTabs } from './VenueTabs';

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
