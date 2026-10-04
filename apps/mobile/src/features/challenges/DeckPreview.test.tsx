import { fireEvent, render } from '@testing-library/react-native';
import { DeckPreview } from './DeckPreview';

jest.mock('./ChallengeLayout', () => ({
  ChallengeLayout: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./ChallengeDeck', () => ({
  ChallengeDeck: ({ onAction }: { onAction: (direction: number) => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" onPress={() => onAction(1)}>
        <Text>Start preview challenge</Text>
      </Pressable>
    );
  },
}));
jest.mock('./ActiveChallenge', () => ({
  ActiveChallenge: ({
    finish,
  }: {
    finish: (outcome: 'completed' | 'given_up') => void;
  }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <>
        <Pressable
          accessibilityRole="button"
          onPress={() => finish('completed')}
        >
          <Text>Completed</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => finish('given_up')}
        >
          <Text>Give up</Text>
        </Pressable>
      </>
    );
  },
}));
jest.mock('./VenueTabs', () => ({ VenueTabs: () => null }));

it('opens success only for a completed preview challenge', () => {
  const onCompleted = jest.fn();
  const screen = render(<DeckPreview onCompleted={onCompleted} />);
  fireEvent.press(
    screen.getByRole('button', { name: 'Start preview challenge' }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Give up' }));
  expect(onCompleted).not.toHaveBeenCalled();
  fireEvent.press(
    screen.getByRole('button', { name: 'Start preview challenge' }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Completed' }));
  expect(onCompleted).toHaveBeenCalledTimes(1);
});
