import { fireEvent, render } from '@testing-library/react-native';
import { ScreenPreview } from './ScreenPreview';
jest.mock('../challenges/DeckPreview', () => ({
  DeckPreview: ({ onCompleted }: { onCompleted: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <>
        <Text>Find a challenge</Text>
        <Pressable accessibilityRole="button" onPress={onCompleted}>
          <Text>Complete preview</Text>
        </Pressable>
      </>
    );
  },
}));
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
  expect(screen.queryByText('Find a challenge')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  expect(screen.getByText('Find a challenge')).toBeTruthy();
});

it('previews Success then optional Reflection without saving activity', () => {
  const screen = render(<ScreenPreview />);
  fireEvent.press(screen.getByRole('button', { name: 'Complete preview' }));
  expect(screen.getByText('That’s a win!')).toBeTruthy();
  expect(
    screen.queryByText('SCREEN PREVIEW · No activity is saved'),
  ).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('How do you feel?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByText('Find a challenge')).toBeTruthy();
  expect(
    screen.getByText('SCREEN PREVIEW · No activity is saved'),
  ).toBeTruthy();
});
