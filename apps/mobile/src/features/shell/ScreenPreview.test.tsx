import { fireEvent, render } from '@testing-library/react-native';
import { ScreenPreview } from './ScreenPreview';
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Link: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Redirect: () => <Text>Protected</Text>,
  };
});
it('switches between isolated Home and Progress screens with accessible selected tabs', () => {
  const screen = render(<ScreenPreview />);
  expect(
    screen.getByRole('tab', { name: 'Home' }).props.accessibilityState.selected,
  ).toBe(true);
  fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
  expect(screen.getByText('Your progress')).toBeTruthy();
  expect(
    screen.getByRole('tab', { name: 'Progress' }).props.accessibilityState
      .selected,
  ).toBe(true);
  expect(screen.queryByText('Your next challenge')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  expect(screen.getByText('Your next challenge')).toBeTruthy();
});
