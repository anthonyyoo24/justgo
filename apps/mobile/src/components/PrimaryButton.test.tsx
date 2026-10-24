import { fireEvent, render, within } from '@testing-library/react-native';
import { PrimaryButton } from './PrimaryButton';

it('replaces visible text with one spinner while preserving the button name and blocking duplicate presses', async () => {
  const onPress = jest.fn();
  const screen = await render(
    <PrimaryButton label="Review transfer" onPress={onPress} />,
  );
  expect(screen.getByText('Review transfer')).toBeTruthy();
  await screen.rerender(
    <PrimaryButton label="Review transfer" onPress={onPress} busy />,
  );
  const button = screen.getByRole('button', { name: 'Review transfer' });
  expect(button).toBeDisabled();
  expect(button.props.accessibilityState.busy).toBe(true);
  expect(within(button).getAllByRole('progressbar')).toHaveLength(1);
  expect(
    within(button).getByRole('progressbar', {
      name: 'Review transfer in progress',
    }),
  ).toBeTruthy();
  expect(screen.queryByText('Review transfer')).toBeNull();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();

  await screen.rerender(
    <PrimaryButton label="Review transfer" onPress={onPress} />,
  );
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByText('Review transfer')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Review transfer' }),
  );
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('retains the label without a spinner when disabled for a reason other than loading', async () => {
  const onPress = jest.fn();
  const screen = await render(
    <PrimaryButton label="Recover with key" onPress={onPress} disabled />,
  );
  expect(screen.getByText('Recover with key')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Recover with key' }),
  );
  expect(onPress).not.toHaveBeenCalled();
});
