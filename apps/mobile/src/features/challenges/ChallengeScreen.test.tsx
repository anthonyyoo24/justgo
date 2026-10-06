import { act, render } from '@testing-library/react-native';
import type { ChallengeSnapshot } from './controller';
import { attempt, card, zone } from '../../../test-support/journal';
import { ChallengeScreen } from './ChallengeScreen';

const mockMounted = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockFocused = true;
const mockAccount = { userId: 'deck-owner' };
const mockController = {
  subscribe: () => () => {},
  getSnapshot: () => mockSnapshot,
  refresh: jest.fn(),
  act: jest.fn(),
  finish: jest.fn(),
  dismissSuccess: jest.fn(),
};
const mockCard = { ...card, venue: 'cafe' as const };
const finishedAttempt = { ...attempt(), venue: 'cafe' as const };
const active = {
  card: mockCard,
  startedAt: finishedAttempt.startedAt,
  startTimeZone: zone,
  deadlineAt: '2026-10-05T14:05:00.000Z',
  turn: 0,
};
let mockSnapshot: ChallengeSnapshot = {
  selected: 'cafe',
  active: null,
  error: '',
  loading: false,
  saving: false,
  completionStarted: false,
  success: null,
  queues: { cafe: { turn: 0, cards: [mockCard] } },
};
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  useRouter: () => mockRouter,
  Link: ({ children }: { children: React.ReactNode }) => {
    const { Text } = require('react-native');
    return <Text>{children}</Text>;
  },
}));
jest.mock('../../app-support/providers/AppProvider', () => ({
  useRuntime: () => ({ challenges: mockController }),
  useIdentity: () => ({ account: mockAccount }),
}));
jest.mock('./ChallengeLayout', () => ({
  ChallengeLayout: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./VenueTabs', () => ({ VenueTabs: () => null }));
jest.mock('./ChallengeDeck', () => ({
  ChallengeCard: () => null,
  ChallengeDeck: () => {
    const { useEffect } = require('react');
    const { View } = require('react-native');
    useEffect(() => {
      mockMounted();
    }, []);
    return <View testID="mock-deck" />;
  },
}));

beforeEach(() => {
  mockRouter.push.mockClear();
  mockMounted.mockClear();
  mockController.dismissSuccess.mockClear();
  mockFocused = true;
  mockSnapshot = {
    ...mockSnapshot,
    active: null,
    success: null,
    error: '',
    completionStarted: false,
  };
});

it('keeps the deck mounted through queue updates from a local skip', () => {
  const screen = render(<ChallengeScreen />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
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
});

it('does not show a completed-challenge link on the deck after continuing', () => {
  mockSnapshot = {
    ...mockSnapshot,
    active: null,
  };
  const screen = render(<ChallengeScreen />);
  expect(screen.getByTestId('mock-deck')).toBeTruthy();
  expect(screen.queryByText('View your last completed challenge')).toBeNull();
});

it('keeps the active card visible until the success route takes over', () => {
  mockSnapshot = {
    ...mockSnapshot,
    active,
  };
  const screen = render(<ChallengeScreen />);
  expect(screen.getByTestId('active-outcomes')).toBeTruthy();
  expect(mockRouter.push).not.toHaveBeenCalled();
  act(() => {
    mockSnapshot = {
      ...mockSnapshot,
      active,
      success: finishedAttempt,
    };
    screen.rerender(<ChallengeScreen />);
  });
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/success',
    params: { attemptId: finishedAttempt.id },
  });
  expect(screen.queryByTestId('mock-deck')).toBeNull();
  expect(screen.getByTestId('active-outcomes')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  expect(screen.queryByText('That’s a win!')).toBeNull();
});

it('dismisses an already-opened result when native back returns to the challenge', () => {
  const screen = render(<ChallengeScreen />);
  mockSnapshot = {
    ...mockSnapshot,
    active,
    success: finishedAttempt,
  };
  screen.rerender(<ChallengeScreen />);
  expect(mockRouter.push).toHaveBeenCalledTimes(1);

  // Renders during the navigation handoff must not clear the result before
  // the Success screen can use it.
  screen.rerender(<ChallengeScreen />);
  expect(mockController.dismissSuccess).not.toHaveBeenCalled();

  mockFocused = false;
  screen.rerender(<ChallengeScreen />);
  mockFocused = true;
  screen.rerender(<ChallengeScreen />);
  expect(mockController.dismissSuccess).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});

it('reserves catalog refresh for download failures and keeps the completion retry on the active card', () => {
  mockSnapshot = { ...mockSnapshot, queues: {}, error: 'Download failed' };
  const screen = render(<ChallengeScreen />);
  expect(
    screen.getByRole('button', { name: 'Refresh challenges' }),
  ).toBeTruthy();
  mockSnapshot = {
    ...mockSnapshot,
    active,
    completionStarted: true,
    error: 'Try Completed again',
  };
  screen.rerender(<ChallengeScreen />);
  expect(
    screen.queryByRole('button', { name: 'Refresh challenges' }),
  ).toBeNull();
  expect(screen.getByRole('button', { name: 'Completed' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Give up' })).toBeDisabled();
});
