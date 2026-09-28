import { act, fireEvent, render } from '@testing-library/react-native';
import { ScreenPreview } from './ScreenPreview';
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
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
  expect(screen.getByText('Progress')).toBeTruthy();
  expect(
    screen.getByRole('tab', { name: 'Progress' }).props.accessibilityState
      .selected,
  ).toBe(true);
  expect(screen.queryByText('Find a challenge')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  expect(screen.getByText('Find a challenge')).toBeTruthy();
});

it('shows progress activity, read-only saved reflection, and an empty adjacent month without writing', () => {
  const screen = render(<ScreenPreview />);
  fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
  expect(screen.getByText('September 2026')).toBeTruthy();
  expect(screen.getByText('63')).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Friday, September 18, today, 3 reps' }),
  );
  expect(screen.getByText('3 reps')).toBeTruthy();
  expect(screen.queryByText(/min.*total/)).toBeNull();
  expect(screen.getAllByText('View Reflection')).toHaveLength(2);
  expect(screen.getByText('Not\nrecorded')).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1\. Say hello to someone/ }),
  );
  expect(screen.getByText('I felt more at ease with each try.')).toBeTruthy();
  expect(screen.getByText('Hide Reflection')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /edit reflection/i })).toBeNull();
  fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText('August 2026')).toBeTruthy();
  expect(
    screen.getByText('No completed challenges this month yet.'),
  ).toBeTruthy();
  expect(
    screen.getByText('SCREEN PREVIEW · No activity is saved'),
  ).toBeTruthy();
});

it('previews Success then optional Reflection without saving activity', () => {
  jest.useFakeTimers();
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
  expect(screen.queryByText('Skip')).toBeNull();
  expect(screen.getByTestId('reflection-submit-spinner')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Skipping reflection' }),
  ).toBeDisabled();
  act(() => jest.advanceTimersByTime(1200));
  expect(screen.getByText('Find a challenge')).toBeTruthy();
  expect(
    screen.getByText('SCREEN PREVIEW · No activity is saved'),
  ).toBeTruthy();
  jest.useRealTimers();
});

it('previews a failed discard and labels its retry as a skip', () => {
  jest.useFakeTimers();
  const screen = render(<ScreenPreview simulateSkipFailure />);
  fireEvent.press(screen.getByRole('button', { name: 'Complete preview' }));
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.changeText(screen.getByLabelText('Your reflection'), 'My draft');
  fireEvent.press(screen.getByRole('button', { name: 'Close reflection' }));
  fireEvent.press(screen.getByRole('button', { name: 'Discard and skip' }));

  expect(screen.getByRole('button', { name: 'Retry Skip' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save Reflection' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry Skip' }));
  expect(
    screen.getByRole('button', { name: 'Skipping reflection' }),
  ).toBeDisabled();
  act(() => jest.advanceTimersByTime(1200));
  expect(screen.getByText('Find a challenge')).toBeTruthy();
  jest.useRealTimers();
});
