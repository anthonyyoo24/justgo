import { fireEvent, render } from '@testing-library/react-native';
import type { Attempt } from '@justgo/contracts';
import { ActiveChallenge } from './ChallengeScreen';
jest.mock('expo-router', () => ({ Link: () => null }));
jest.mock('../shell/AppProvider', () => ({}));
jest.mock('./ChallengeDeck', () => ({ ChallengeCard: () => null }));
const attempt: Attempt = {
  id: 'visual-test',
  status: 'active',
  card: {
    id: 'GY-01',
    challengeId: 'gym-01',
    revisionId: 'gym-01-v1',
    levelId: 'level-1',
    venue: 'gym',
    text: 'Say hello to someone between sets.',
    durationSeconds: 300,
  },
  startedAt: '2026-09-24T20:00:00Z',
  deadlineAt: '2026-09-24T20:05:00Z',
  endedAt: null,
  elapsedSeconds: null,
  completionDate: null,
  timeZone: null,
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-24T20:06:00Z'));
});
afterEach(() => jest.useRealTimers());
it('keeps explicit outcomes at zero and requires confirmation before giving up', () => {
  const finish = jest.fn(async () => {});
  const screen = render(
    <ActiveChallenge
      attempt={attempt}
      offset={0}
      disabled={false}
      finish={finish}
    />,
  );
  expect(screen.getByText('00:00')).toBeTruthy();
  expect(screen.getByText('Time’s up. How did it go?')).toBeTruthy();
  expect(finish).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Give up' }));
  expect(finish).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Keep trying' }));
  fireEvent.press(screen.getByRole('button', { name: 'Completed' }));
  expect(finish).toHaveBeenCalledWith('completed');
});
it('disables both redesigned outcome controls while saving', () => {
  const finish = jest.fn(async () => {});
  const screen = render(
    <ActiveChallenge attempt={attempt} offset={0} disabled finish={finish} />,
  );
  for (const name of ['Give up', 'Completed']) {
    const button = screen.getByRole('button', { name });
    expect(button).toBeDisabled();
    fireEvent.press(button);
  }
  expect(finish).not.toHaveBeenCalled();
  expect(screen.queryByText('Give up this challenge?')).toBeNull();
});
