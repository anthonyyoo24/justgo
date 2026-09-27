import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Attempt } from '@justgo/contracts';
import { SuccessScreen } from './ChallengeScreen';
let mockAttemptId: string | undefined = 'first';
const mockRequest = jest.fn();
const mockRuntime = {
  client: { request: mockRequest },
  challenges: { dismissSuccess: jest.fn(), getSnapshot: jest.fn() },
};
const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ attemptId: mockAttemptId }),
  useRouter: () => mockRouter,
  useIsFocused: () => true,
  Link: () => null,
}));
jest.mock('../shell/AppProvider', () => ({ useRuntime: () => mockRuntime }));
jest.mock('./ChallengeDeck', () => ({
  ChallengeDeck: () => null,
  ChallengeCard: () => null,
}));
jest.mock('../../components/Screen', () => {
  const { Text } = require('react-native');
  return {
    Screen: ({
      children,
      title,
    }: {
      children: React.ReactNode;
      title: string;
    }) => (
      <>
        <Text>{title}</Text>
        {children}
      </>
    ),
  };
});
const completed: Attempt = {
  id: 'first',
  card: {
    id: 'ST-01',
    challengeId: 'st-01',
    revisionId: 'st-01-v1',
    levelId: 'level-1',
    venue: 'streets',
    text: 'Say hello.',
    durationSeconds: 300,
  },
  status: 'completed',
  startedAt: '2026-09-24T20:00:00Z',
  deadlineAt: '2026-09-24T20:05:00Z',
  endedAt: '2026-09-24T20:01:00Z',
  elapsedSeconds: 60,
  completionDate: '2026-09-24',
  timeZone: 'UTC',
};
beforeEach(() => {
  mockAttemptId = 'first';
  mockRequest.mockReset();
  mockRuntime.challenges.dismissSuccess.mockReset();
  mockRuntime.challenges.getSnapshot.mockReturnValue({ success: null });
  mockRouter.replace.mockReset();
});
it('keeps the confirmed completion visible while lookup loads or fails', async () => {
  let reject!: (reason: Error) => void;
  mockRuntime.challenges.getSnapshot.mockReturnValue({ success: completed });
  mockRequest.mockImplementationOnce(
    () =>
      new Promise((_resolve, no) => {
        reject = no;
      }),
  );
  const screen = render(<SuccessScreen />);
  expect(screen.getByText('That’s a win!')).toBeTruthy();
  expect(screen.queryByText('Checking your saved result…')).toBeNull();
  expect(mockRequest).toHaveBeenCalledWith(
    '/v1/challenges/attempt/first',
    expect.anything(),
  );
  await act(async () => reject(new Error('offline')));
  expect(screen.getByText('That’s a win!')).toBeTruthy();
  expect(
    screen.queryByText(
      'We couldn’t load this result. Your saved activity is safe.',
    ),
  ).toBeNull();
});
it('does not show the previous success when another result is loading or fails', async () => {
  let reject!: (reason: Error) => void;
  mockRequest
    .mockResolvedValueOnce({ attempt: completed })
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, no) => {
          reject = no;
        }),
    );
  const screen = render(<SuccessScreen />);
  await waitFor(() => expect(screen.getByText('That’s a win!')).toBeTruthy());
  expect(
    screen.getByText(
      'You followed through on your challenge.\nTake a moment to enjoy it.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText(completed.card.text)).toBeNull();
  expect(screen.queryByText('Your completed challenge')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockRuntime.challenges.dismissSuccess).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  mockAttemptId = 'another';
  screen.rerender(<SuccessScreen />);
  expect(screen.queryByText('That’s a win!')).toBeNull();
  expect(screen.getByText('Checking your saved result…')).toBeTruthy();
  await act(async () => reject(new Error('not found')));
  expect(screen.queryByText('That’s a win!')).toBeNull();
  expect(
    screen.getByText(
      'We couldn’t load this result. Your saved activity is safe.',
    ),
  ).toBeTruthy();
});
it.each(['active', 'given_up'] as const)(
  'never celebrates a %s attempt',
  async (status) => {
    mockRequest.mockResolvedValue({
      attempt: { ...completed, status },
    });
    const screen = render(<SuccessScreen />);
    await waitFor(() =>
      expect(
        screen.getByText('This challenge hasn’t been completed.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('That’s a win!')).toBeNull();
  },
);
