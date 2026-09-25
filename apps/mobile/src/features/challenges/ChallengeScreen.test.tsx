import { render } from '@testing-library/react-native';
import { ChallengeScreen } from './ChallengeScreen';

const mockMounted = jest.fn();
const mockRouter = { push: jest.fn() };
const mockAccount = { userId: 'deck-owner' };
const mockController = {
  subscribe: () => () => {},
  getSnapshot: () => mockSnapshot,
  refresh: jest.fn(),
  act: jest.fn(),
};
let mockSnapshot = {
  selected: 'cafe',
  state: { active: null, latestOutcome: null },
  error: '',
  busy: false,
  pending: null,
  success: null,
  queues: { cafe: { version: 0, cards: [{ id: 'a', text: 'Say hello.' }] } },
};
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => mockRouter,
  Link: () => null,
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
  ChallengeDeck: () => {
    const { useEffect } = require('react');
    useEffect(() => {
      mockMounted();
    }, []);
    return null;
  },
}));

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
