import { fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { ChallengeLayout } from '../challenges/ChallengeLayout';
import { ReflectionView } from './ReflectionView';

jest.mock('expo-router', () => ({ Link: () => null }));

const props = () => ({
  feeling: null,
  text: '',
  onFeelingChange: jest.fn(),
  onTextChange: jest.fn(),
  onSubmit: jest.fn(),
  onClose: jest.fn(),
});

it('starts unselected and offers Skip until a feeling or written text is present', () => {
  const base = props();
  const screen = render(<ReflectionView {...base} />);
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(5);
  expect(
    screen
      .getAllByRole('radio')
      .every((radio) => !radio.props.accessibilityState.checked),
  ).toBe(true);
  fireEvent.press(screen.getByRole('radio', { name: 'A little bit better' }));
  expect(base.onFeelingChange).toHaveBeenCalledWith('a_little_better');
  screen.rerender(<ReflectionView {...base} feeling="a_little_better" />);
  expect(screen.getByRole('button', { name: 'Save Reflection' })).toBeTruthy();
  expect(
    screen.getByRole('radio', { name: 'A little bit better' }).props
      .accessibilityState.checked,
  ).toBe(true);
  fireEvent.press(screen.getByRole('radio', { name: 'A little bit better' }));
  expect(base.onFeelingChange).toHaveBeenLastCalledWith(null);
  screen.rerender(<ReflectionView {...base} feeling={null} />);
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  expect(screen.getByText('Choose one.')).toBeTruthy();
  screen.rerender(<ReflectionView {...base} text="A small win" />);
  expect(screen.getByRole('button', { name: 'Save Reflection' })).toBeTruthy();
  screen.rerender(<ReflectionView {...base} text="   " />);
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
});

it('has native multiline entry and an accessible dismissal choice without a Dictate control', () => {
  const base = props();
  const screen = render(<ReflectionView {...base} />);
  const input = screen.getByLabelText('Your reflection');
  expect(input.props.multiline).toBe(true);
  const { width } = Dimensions.get('window');
  expect(StyleSheet.flatten(input.props.style).minHeight).toBe(
    (228 * Math.min(width, 390)) / 390,
  );
  fireEvent.changeText(input, 'I tried even though I was nervous.');
  expect(base.onTextChange).toHaveBeenCalledWith(
    'I tried even though I was nervous.',
  );
  expect(screen.queryByText('Dictate')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Close reflection' }));
  expect(base.onClose).toHaveBeenCalledTimes(1);
  screen.rerender(
    <ReflectionView
      {...base}
      text="A note"
      dismissOpen
      onKeepEditing={jest.fn()}
      onDiscard={jest.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Discard and skip' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
});

it('shows a retry only for a failed background draft', () => {
  const base = props();
  const onRetryDraft = jest.fn();
  const screen = render(
    <ReflectionView
      {...base}
      text="I showed up."
      onRetryDraft={onRetryDraft}
    />,
  );
  expect(screen.queryByText(/draft/i)).toBeNull();
  expect(screen.getByRole('button', { name: 'Save Reflection' })).toBeTruthy();
  screen.rerender(
    <ReflectionView
      {...base}
      text="I showed up."
      draftError
      onRetryDraft={onRetryDraft}
    />,
  );
  expect(screen.getByRole('alert').props.children).toBe(
    'Draft not saved. Your edits are still here.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Retry draft' }));
  expect(onRetryDraft).toHaveBeenCalledTimes(1);
});

it('matches the challenge screens’ top header typography', () => {
  const reflection = render(<ReflectionView {...props()} />);
  const challenge = render(<ChallengeLayout title="Find a challenge" />);
  const reflectionHeader = StyleSheet.flatten(
    reflection.getByText('Reflection').props.style,
  );
  const challengeHeader = StyleSheet.flatten(
    challenge.getByText('Find a challenge').props.style,
  );
  expect(reflectionHeader.fontSize).toBe(challengeHeader.fontSize);
  expect(reflectionHeader.lineHeight).toBe(challengeHeader.lineHeight);
  expect(reflectionHeader.fontFamily).toBe(challengeHeader.fontFamily);
  expect(reflectionHeader.fontWeight).toBe(challengeHeader.fontWeight);
  expect(reflectionHeader.letterSpacing).toBe(challengeHeader.letterSpacing);
});
