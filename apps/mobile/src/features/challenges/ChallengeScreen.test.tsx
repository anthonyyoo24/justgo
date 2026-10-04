import { act, render } from '@testing-library/react-native';
import type { LegacyAttempt as Attempt } from '@justgo/contracts';
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
const finishedAttempt: Attempt = {
  id: 'finished-attempt',
  status: 'completed',
  card: {
    id: 'CA-01',
    challengeId: 'cafe-01',
    revisionId: 'cafe-01-v1',
    levelId: 'level-1',
    venue: 'cafe',
    text: 'Ask someone for a recommendation.',
    durationSeconds: 300,
  },
  startedAt: '2026-09-24T20:00:00Z',
  deadlineAt: '2026-09-24T20:05:00Z',
  endedAt: '2026-09-24T20:04:00Z',
  completionDate: '2026-09-24',
  timeZone: 'America/Toronto',
};
let mockSnapshot = {
  selected: 'cafe',
  state: {
    active: null as Attempt | null,
    latestOutcome: null as Attempt | null,
  },
  error: '',
  busy: false,
  pending: null,
  success: null as Attempt | null,
  clockOffset: 0,
  queues: { cafe: { version: 0, cards: [{ id: 'a', text: 'Say hello.' }] } },
};
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  useRouter: () => mockRouter,
  Link: ({ children }: { children: React.ReactNode }) => {
    const { Text } = require('react-native');
    return <Text>{children}</Text>;
  },
}));
jest.mock('../shell/AppProvider', () => ({
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
    state: { active: null, latestOutcome: null },
    success: null,
  };
});

it('keeps the deck mounted through queue updates from a confirmed skip', () => {
  const screen = render(<ChallengeScreen />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  mockSnapshot = {
    ...mockSnapshot,
    queues: {
      cafe: { version: 1, cards: [{ id: 'b', text: 'Ask a question.' }] },
    },
  };
  screen.rerender(<ChallengeScreen />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
});

it('does not show a completed-challenge link on the deck after continuing', () => {
  mockSnapshot = {
    ...mockSnapshot,
    state: { active: null, latestOutcome: finishedAttempt },
  };
  const screen = render(<ChallengeScreen />);
  expect(screen.getByTestId('mock-deck')).toBeTruthy();
  expect(screen.queryByText('View your last completed challenge')).toBeNull();
});

it('keeps the active card visible until the success route takes over', () => {
  mockSnapshot = {
    ...mockSnapshot,
    state: {
      active: { ...finishedAttempt, status: 'active' },
      latestOutcome: null,
    },
  };
  const screen = render(<ChallengeScreen />);
  expect(screen.getByTestId('active-outcomes')).toBeTruthy();
  expect(mockRouter.push).not.toHaveBeenCalled();
  act(() => {
    mockSnapshot = {
      ...mockSnapshot,
      state: { active: null, latestOutcome: null },
      success: finishedAttempt,
    };
    screen.rerender(<ChallengeScreen />);
  });
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/success',
    params: { attemptId: 'finished-attempt' },
  });
  expect(screen.queryByTestId('mock-deck')).toBeNull();
  expect(screen.getByTestId('active-outcomes')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  expect(screen.queryByText('That’s a win!')).toBeNull();
});

it('dismisses an already-opened result when native back returns to the challenge', () => {
  const screen = render(<ChallengeScreen />);
  mockSnapshot = { ...mockSnapshot, success: finishedAttempt };
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
