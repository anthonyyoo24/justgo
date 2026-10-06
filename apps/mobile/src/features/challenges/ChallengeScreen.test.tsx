import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';
import type { ChallengeSnapshot } from './controller';
import { attempt, card } from '../../../test-support/journal';
import { ChallengeScreen } from './ChallengeScreen';

const mockMounted = jest.fn();
const mockRouter = { push: jest.fn() };
let mockFocused = true;
let mockAccount = { userId: 'deck-owner' };
const mockCard = { ...card, venue: 'cafe' as const };
const finishedAttempt = { ...attempt(), venue: 'cafe' as const };
let mockSnapshot: ChallengeSnapshot;
const mockController = {
  subscribe: () => () => {},
  getSnapshot: () => mockSnapshot,
  refresh: jest.fn(),
  skip: jest.fn(),
  select: jest.fn(),
  complete: jest.fn(),
  dismissSuccess: jest.fn(),
};
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  useRouter: () => mockRouter,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../app-support/providers/AppProvider', () => ({
  useRuntime: () => ({ challenges: mockController }),
  useIdentity: () => ({ account: mockAccount }),
}));
jest.mock('../../app-support/saving/SavingFeedback', () => ({
  SavingSheetSurface: () => null,
}));
jest.mock('./VenueTabs', () => ({ VenueTabs: () => null }));
jest.mock('./ChallengeDeck', () => ({
  ChallengeCard: () => null,
  ChallengeDeck: ({
    onAction,
    disabled,
  }: {
    onAction: (direction: -1 | 1) => Promise<void>;
    disabled: boolean;
  }) => {
    const { useEffect } = require('react');
    const { View, Pressable, Text } = require('react-native');
    useEffect(() => {
      mockMounted();
    }, []);
    return (
      <View testID="mock-deck">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Accept challenge"
          disabled={disabled}
          onPress={() => void onAction(1)}
        >
          <Text>Accept</Text>
        </Pressable>
      </View>
    );
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockAccount = { userId: 'deck-owner' };
  mockSnapshot = {
    selected: 'cafe',
    error: '',
    loading: false,
    saving: false,
    completionStarted: false,
    success: null,
    queues: { cafe: { turn: 0, cards: [mockCard] } },
  };
  mockController.complete.mockResolvedValue(undefined);
});
function accept(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByRole('button', { name: 'Accept challenge' }));
}

it('keeps the deck mounted through queue updates, with Settings available while browsing', () => {
  const screen = render(<ChallengeScreen />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Open Settings' })).toBeTruthy();
  mockSnapshot = {
    ...mockSnapshot,
    queues: {
      cafe: {
        turn: 1,
        cards: [{ ...mockCard, id: 'b', text: 'Ask a question.' }],
      },
    },
  };
  screen.rerender(<ChallengeScreen />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('View your last completed challenge')).toBeNull();
});
it('keeps navigation mounted behind an opaque full-screen active view and refuses implicit dismissal', () => {
  const screen = render(<ChallengeScreen />);
  accept(screen);
  const modal = screen.UNSAFE_getByType(Modal);
  expect(modal.props.presentationStyle).toBe('overFullScreen');
  expect(modal.props.transparent).toBe(false);
  expect(modal.props.allowSwipeDismissal).toBe(false);
  const activeSurface = within(modal).UNSAFE_getAllByType(SafeAreaView)[0]!;
  expect(activeSurface.props.edges).toEqual(['bottom']);
  expect(activeSurface.props.accessibilityViewIsModal).toBe(true);
  expect(StyleSheet.flatten(activeSurface.props.style)).toMatchObject({
    flex: 1,
    backgroundColor: colors.cream,
  });
  expect(
    within(modal).queryByRole('link', { name: 'Open Settings' }),
  ).toBeNull();
  expect(within(modal).queryByRole('tab')).toBeNull();
  fireEvent(modal, 'requestClose');
  expect(screen.getByRole('button', { name: 'Completed' })).toBeEnabled();
  expect(mockController.complete).not.toHaveBeenCalled();
  expect(mockController.skip).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Give up' }));
  expect(screen.queryByTestId('active-challenge-modal')).toBeNull();
  expect(mockController.skip).toHaveBeenCalledWith('cafe');
  expect(screen.getByRole('link', { name: 'Open Settings' })).toBeTruthy();
});
it('keeps the active modal through local completion until Success takes focus, then returns to browsing', () => {
  const screen = render(<ChallengeScreen />);
  accept(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Completed' }));
  act(() => {
    mockSnapshot = {
      ...mockSnapshot,
      success: finishedAttempt,
      completionStarted: true,
    };
    screen.rerender(<ChallengeScreen />);
  });
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/success',
    params: { attemptId: finishedAttempt.id },
  });
  expect(screen.getByTestId('active-challenge-modal')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  expect(mockController.complete).toHaveBeenCalledWith(
    expect.objectContaining({
      card: mockCard,
      startedAt: expect.any(String),
      startTimeZone: expect.any(String),
    }),
  );
  mockFocused = false;
  screen.rerender(<ChallengeScreen />);
  expect(screen.queryByTestId('active-challenge-modal')).toBeNull();
  mockFocused = true;
  screen.rerender(<ChallengeScreen />);
  expect(mockController.dismissSuccess).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});
it('uses local completion retry and keeps navigation inaccessible during an interrupted save', () => {
  const screen = render(<ChallengeScreen />);
  accept(screen);
  mockSnapshot = {
    ...mockSnapshot,
    completionStarted: true,
    error: 'Try Completed again',
  };
  screen.rerender(<ChallengeScreen />);
  const modal = screen.UNSAFE_getByType(Modal);
  expect(
    within(modal).queryByRole('button', { name: 'Refresh challenges' }),
  ).toBeNull();
  expect(
    within(modal).getByRole('button', { name: 'Completed' }),
  ).toBeEnabled();
  expect(within(modal).getByRole('button', { name: 'Give up' })).toBeDisabled();
});
it('clears unfinished React state when the account changes', () => {
  const screen = render(<ChallengeScreen />);
  accept(screen);
  mockAccount = { userId: 'another-owner' };
  screen.rerender(<ChallengeScreen />);
  expect(screen.queryByTestId('active-challenge-modal')).toBeNull();
  expect(mockController.complete).not.toHaveBeenCalled();
});
it('exposes catalog recovery only when no active challenge exists', () => {
  mockSnapshot = { ...mockSnapshot, queues: {}, error: 'Download failed' };
  const screen = render(<ChallengeScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Refresh challenges' }));
  expect(mockController.refresh).toHaveBeenCalled();
});
