import { fireEvent, render } from '@testing-library/react-native';
import type { Attempt } from '@justgo/contracts';
import { StyleSheet, View } from 'react-native';
import { ChallengeCard } from './ChallengeDeck';
import { ActiveChallenge } from './ActiveChallenge';
jest.mock('expo-router', () => ({ Link: () => null }));
jest.mock('../shell/AppProvider', () => ({}));
jest.mock('./ChallengeDeck', () => ({ ChallengeCard: jest.fn(() => null) }));
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
  completionDate: null,
  timeZone: null,
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-24T20:06:00Z'));
});
afterEach(() => jest.useRealTimers());
it('shows time remaining before the deadline', () => {
  jest.setSystemTime(new Date('2026-09-24T20:03:00Z'));
  const screen = render(
    <ActiveChallenge
      attempt={attempt}
      offset={0}
      disabled={false}
      finish={async () => {}}
    />,
  );
  expect(screen.getByText('02:00')).toBeTruthy();
  expect(screen.getByText('Time remaining')).toBeTruthy();
  expect(screen.getByLabelText('2 minutes 0 seconds remaining')).toBeTruthy();
});
it.each(['Give up', 'Completed'] as const)(
  'keeps outcomes explicit at zero and submits %s with one press',
  (name) => {
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
    expect(screen.getByText("Time's up. Give it a go.")).toBeTruthy();
    expect(screen.getByLabelText("Time's up. Give it a go.")).toBeTruthy();
    expect(finish).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name }));
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(
      name === 'Give up' ? 'given_up' : 'completed',
    );
    expect(screen.queryByText('Give up this challenge?')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep trying' })).toBeNull();
  },
);

it('blocks both outcomes during a save without dimming either button', () => {
  const finish = jest.fn(async () => {});
  const screen = render(
    <ActiveChallenge attempt={attempt} offset={0} disabled finish={finish} />,
  );
  for (const name of ['Give up', 'Completed']) {
    const button = screen.getByRole('button', { name });
    expect(button).toBeDisabled();
    for (const view of button.findAllByType(View)) {
      expect(StyleSheet.flatten(view.props.style)?.opacity ?? 1).toBe(1);
    }
    fireEvent.press(button);
  }
  expect(finish).not.toHaveBeenCalled();
  expect(screen.queryByText('Give up this challenge?')).toBeNull();
});
it('leaves extra space between the active card and outcome buttons', () => {
  const screen = render(
    <ActiveChallenge
      attempt={attempt}
      offset={0}
      disabled={false}
      finish={async () => {}}
    />,
  );
  expect(
    StyleSheet.flatten(screen.getByTestId('active-outcomes').props.style)
      ?.marginTop,
  ).toBeGreaterThanOrEqual(12);
});
it('passes the accepted queue turn to the active card', () => {
  const screen = render(
    <ActiveChallenge
      attempt={attempt}
      turn={5}
      offset={0}
      disabled={false}
      finish={async () => {}}
    />,
  );
  expect(jest.mocked(ChallengeCard).mock.lastCall?.[0]).toMatchObject({
    card: attempt.card,
    turn: 5,
  });
  screen.rerender(
    <ActiveChallenge
      attempt={attempt}
      turn={6}
      offset={0}
      disabled
      finish={async () => {}}
    />,
  );
  expect(jest.mocked(ChallengeCard).mock.lastCall?.[0]).toMatchObject({
    card: attempt.card,
    turn: 5,
  });
});
