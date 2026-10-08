import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { ScreenPreview } from './ScreenPreview';
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('../../features/progress/day-details/useEntryMotion', () =>
  jest.requireActual('../../features/progress/day-details/useEntryMotion.ts'),
);
jest.mock('../../features/challenges/DeckPreview', () => ({
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

it('previews loading and loaded Progress without saving any activity', () => {
  const screen = render(<ScreenPreview progressState="loading" />);
  fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
  expect(screen.getByLabelText('Loading progress')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Show loaded progress' }));
  expect(screen.queryByLabelText('Loading progress')).toBeNull();
  expect(screen.getByText('63')).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Replay progress loading' }),
  );
  expect(screen.getByLabelText('Loading progress')).toBeTruthy();
});

it('shows progress activity, read-only saved reflection, and an empty adjacent month without writing', () => {
  const screen = render(<ScreenPreview />);
  fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
  expect(screen.getByText('September 2026')).toBeTruthy();
  expect(screen.getByText('63')).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Friday, September 18, today, 3 reps' }),
  );
  expect(screen.getByText('Friday, September 18')).toBeTruthy();
  expect(screen.getByText('3 reps')).toBeTruthy();
  expect(screen.queryByText(/min.*total/)).toBeNull();
  expect(screen.getAllByText('View Reflection')).toHaveLength(2);
  expect(
    screen.getByLabelText(
      'Rep 2. Ask for a recommendation. 12:40 PM. Feeling: Not recorded',
    ),
  ).toBeTruthy();
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

it.each([
  ['initial-error', 'Couldn’t load attempts'],
  ['load-more-error', 'Couldn’t load more attempts'],
  ['loading-more', null],
] as const)('previews the %s day sheet state', (progressDayState, message) => {
  const screen = render(<ScreenPreview progressDayState={progressDayState} />);
  fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
  fireEvent.press(
    screen.getByRole('button', {
      name: 'Friday, September 18, today, 3 reps',
    }),
  );
  if (message) expect(screen.getByText(message)).toBeTruthy();
  else {
    expect(screen.getByLabelText('Loading more attempts')).toBeTruthy();
    expect(screen.queryByText('Loading more attempts…')).toBeNull();
  }
  if (progressDayState === 'initial-error') {
    fireEvent.press(
      screen.getByRole('button', { name: 'Try loading attempts again' }),
    );
    expect(screen.getByLabelText(/Rep 1\. Say hello to someone/)).toBeTruthy();
  } else {
    expect(screen.getByLabelText(/Rep 6\. Send a thank you note/)).toBeTruthy();
    if (progressDayState === 'load-more-error') {
      fireEvent.press(
        screen.getByRole('button', { name: 'Try loading more attempts again' }),
      );
      expect(screen.queryByText('Couldn’t load more attempts')).toBeNull();
      expect(
        screen.getByLabelText(/Rep 6\. Send a thank you note/),
      ).toBeTruthy();
    }
  }
});

it('previews the offline day without entries or network retry controls', () => {
  let finishClose: ((result: { finished: boolean }) => void) | undefined;
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: (callback: (result: { finished: boolean }) => void) => {
      finishClose = callback;
    },
    stop: jest.fn(),
  } as unknown as ReturnType<typeof Animated.timing>);
  try {
    const screen = render(<ScreenPreview progressDayState="offline" />);
    fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
    fireEvent.press(
      screen.getByRole('button', { name: 'Thursday, September 17, 2 reps' }),
    );
    expect(screen.getByText("You're currently offline")).toBeTruthy();
    expect(
      screen.getByText('Connect to the internet to view this day’s activity.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('day-sheet-entry-list')).toBeNull();
    expect(screen.queryByText('Couldn’t load attempts')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Try loading attempts again' }),
    ).toBeNull();
    fireEvent.press(
      screen.getAllByRole('button', { name: 'Close day details' })[0]!,
    );
    expect(finishClose).toBeDefined();
    act(() => finishClose!({ finished: true }));
    expect(screen.queryByText("You're currently offline")).toBeNull();
    expect(
      screen.getByText('SCREEN PREVIEW · No activity is saved'),
    ).toBeTruthy();
    screen.unmount();
  } finally {
    timing.mockRestore();
  }
});

it('previews Success then empty Skip immediately without saving activity', () => {
  const screen = render(<ScreenPreview />);
  fireEvent.press(screen.getByRole('button', { name: 'Complete preview' }));
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByText('Find a challenge')).toBeTruthy();
});
it('previews a slow local submission and local discard', () => {
  jest.useFakeTimers();
  const screen = render(<ScreenPreview />);
  fireEvent.press(screen.getByRole('button', { name: 'Complete preview' }));
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.changeText(screen.getByLabelText('Your reflection'), 'Writing');
  fireEvent.press(screen.getByRole('button', { name: 'Close reflection' }));
  fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
  expect(
    screen.getByRole('button', { name: 'Saving reflection' }),
  ).toBeDisabled();
  act(() => jest.advanceTimersByTime(1200));
  expect(screen.getByText('Find a challenge')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Complete preview' }));
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.changeText(screen.getByLabelText('Your reflection'), 'Unsent');
  fireEvent.press(screen.getByRole('button', { name: 'Close reflection' }));
  fireEvent.press(screen.getByRole('button', { name: 'Discard and skip' }));
  expect(screen.getByText('Find a challenge')).toBeTruthy();
  jest.useRealTimers();
});
