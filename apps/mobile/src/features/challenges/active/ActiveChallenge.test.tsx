import { act, fireEvent, render } from '@testing-library/react-native';
import type { ChallengeStart } from '../controller';
import { AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { ChallengeCard } from '../deck/ChallengeDeck';
import { ActiveChallenge } from './ActiveChallenge';
jest.mock('expo-router', () => ({ Link: () => null }));
jest.mock('../../../app-support/providers/AppProvider', () => ({}));
jest.mock('../deck/ChallengeDeck', () => ({
  ChallengeCard: jest.fn(() => null),
}));
const attempt: ChallengeStart = {
  card: {
    id: 'GY-01',
    challengeId: 'gym-01',
    position: 0,
    subtext: null,
    levelId: 'level-1',
    venue: 'gym',
    text: 'Say hello to someone between sets.',
    durationSeconds: 300,
  },
  startedAt: '2026-09-24T20:00:00Z',
  startTimeZone: 'America/Toronto',
  turn: 0,
};
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  jest.setSystemTime(new Date('2026-09-24T20:06:00Z'));
});
afterEach(() => jest.useRealTimers());
it('shows time remaining before the deadline', async () => {
  jest.setSystemTime(new Date('2026-09-24T20:03:00Z'));
  const screen = await render(
    <ActiveChallenge
      attempt={attempt}
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
  async (name) => {
    const finish = jest.fn(async () => {});
    const screen = await render(
      <ActiveChallenge attempt={attempt} disabled={false} finish={finish} />,
    );
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.getByText("Time's up. Give it a go.")).toBeTruthy();
    expect(screen.getByLabelText("Time's up. Give it a go.")).toBeTruthy();
    expect(finish).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name }));
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(
      name === 'Give up' ? 'given_up' : 'completed',
    );
    expect(screen.queryByText('Give up this challenge?')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep trying' })).toBeNull();
  },
);

it('blocks both outcomes during a save without dimming either button', async () => {
  const finish = jest.fn(async () => {});
  const screen = await render(
    <ActiveChallenge attempt={attempt} disabled finish={finish} />,
  );
  for (const name of ['Give up', 'Completed']) {
    const button = screen.getByRole('button', { name });
    expect(button).toBeDisabled();
    for (const view of button.queryAll((node) => node.type === 'View')) {
      expect(StyleSheet.flatten(view.props.style)?.opacity ?? 1).toBe(1);
    }
    await fireEvent.press(button);
  }
  expect(finish).not.toHaveBeenCalled();
  expect(screen.queryByText('Give up this challenge?')).toBeNull();
});
it('replaces completion contents with a spinner only when delayed feedback is visible', async () => {
  const finish = jest.fn(async () => {});
  const screen = await render(
    <ActiveChallenge attempt={attempt} disabled finish={finish} />,
  );
  expect(screen.getByText('Completed')).toBeTruthy();
  expect(screen.queryByTestId('completion-submit-spinner')).toBeNull();
  await screen.rerender(
    <ActiveChallenge
      attempt={attempt}
      disabled
      savingVisible
      finish={finish}
    />,
  );
  const button = screen.getByRole('button', { name: 'Saving completion' });
  expect(button.props.accessibilityState).toMatchObject({
    disabled: true,
    busy: true,
  });
  expect(screen.getByTestId('completion-submit-spinner')).toBeTruthy();
  expect(screen.queryByText('Completed')).toBeNull();
  expect(screen.queryByText('Saving…')).toBeNull();
  await fireEvent.press(button);
  expect(finish).not.toHaveBeenCalled();
  await screen.rerender(
    <ActiveChallenge attempt={attempt} disabled={false} finish={finish} />,
  );
  expect(screen.getByRole('button', { name: 'Completed' })).toBeEnabled();
  expect(screen.getByText('Completed')).toBeTruthy();
  expect(screen.queryByTestId('completion-submit-spinner')).toBeNull();
});
it('leaves extra space between the active card and outcome buttons', async () => {
  const screen = await render(
    <ActiveChallenge
      attempt={attempt}
      disabled={false}
      finish={async () => {}}
    />,
  );
  expect(
    StyleSheet.flatten(screen.getByTestId('active-outcomes').props.style)
      ?.marginTop,
  ).toBeGreaterThanOrEqual(12);
});
it('passes the accepted queue turn to the active card', async () => {
  const screen = await render(
    <ActiveChallenge
      attempt={attempt}
      turn={5}
      disabled={false}
      finish={async () => {}}
    />,
  );
  expect(jest.mocked(ChallengeCard).mock.lastCall?.[0]).toMatchObject({
    card: attempt.card,
    turn: 5,
  });
  await screen.rerender(
    <ActiveChallenge
      attempt={attempt}
      turn={6}
      disabled
      finish={async () => {}}
    />,
  );
  expect(jest.mocked(ChallengeCard).mock.lastCall?.[0]).toMatchObject({
    card: attempt.card,
    turn: 5,
  });
});

it('updates once per second, recomputes on foreground and cleans up clock/listener ownership', async () => {
  jest.setSystemTime(new Date(attempt.startedAt));
  const remove = jest.fn();
  let foreground!: (state: AppStateStatus) => void;
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_, callback) => {
      foreground = callback;
      return { remove };
    });
  const screen = await render(
    <ActiveChallenge
      attempt={attempt}
      disabled={false}
      finish={async () => {}}
    />,
  );
  expect(screen.getByText('05:00')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(500));
  expect(screen.getByText('05:00')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(500));
  expect(screen.getByText('04:59')).toBeTruthy();
  await act(() => foreground('background'));
  jest.setSystemTime(new Date('2026-09-24T20:03:12Z'));
  await act(() => foreground('active'));
  expect(screen.getByText('01:48')).toBeTruthy();
  await screen.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  listener.mockRestore();
});
