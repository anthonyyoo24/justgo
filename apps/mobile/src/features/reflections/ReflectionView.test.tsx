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

it('disables duplicate saves immediately, shows delayed saving feedback and keeps text editable', () => {
  const base = props();
  const screen = render(<ReflectionView {...base} text="First" busy />);
  expect(
    screen.getByRole('button', { name: 'Save Reflection' }),
  ).toBeDisabled();
  expect(screen.queryByText('Saving…')).toBeNull();
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
  expect(screen.getByLabelText('Your reflection').props.editable).toBe(true);
  screen.rerender(<ReflectionView {...base} text="First" busy savingVisible />);
  expect(
    screen.getByRole('button', { name: 'Saving reflection' }).props
      .accessibilityState,
  ).toMatchObject({ disabled: true, busy: true });
  expect(screen.getByTestId('reflection-submit-spinner')).toBeTruthy();
  expect(screen.queryByText('Save Reflection')).toBeNull();
  expect(screen.queryByText('Saving…')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Saving reflection' }));
  expect(base.onSubmit).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Your reflection'), 'Newer');
  expect(base.onTextChange).toHaveBeenCalledWith('Newer');
  screen.rerender(<ReflectionView {...base} text="Newer" />);
  expect(screen.getByRole('button', { name: 'Save Reflection' })).toBeEnabled();
  expect(screen.getByText('Save Reflection')).toBeTruthy();
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
});
it('preserves feeling while editing and keeps validation inline', () => {
  const screen = render(
    <ReflectionView
      {...props()}
      text="Saved"
      feeling="a_lot_better"
      editing
      error="Check this field"
    />,
  );
  expect(
    screen
      .getAllByRole('radio')
      .every((r) => r.props.accessibilityState.disabled),
  ).toBe(true);
  expect(screen.getByText('Check this field')).toBeTruthy();
});
it('prevents duplicate dirty-close saves or discard while a write is pending', () => {
  const base = props();
  const screen = render(
    <ReflectionView
      {...base}
      text="Saved"
      dismissOpen
      busy
      onDiscard={jest.fn()}
    />,
  );
  for (const button of screen.getAllByRole('button', {
    name: 'Save Reflection',
  }))
    expect(button).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Discard and skip' }),
  ).toBeDisabled();
  expect(screen.queryByTestId('reflection-dismiss-save-spinner')).toBeNull();
  screen.rerender(
    <ReflectionView {...base} text="Saved" dismissOpen busy savingVisible />,
  );
  expect(
    screen.getAllByRole('button', { name: 'Saving reflection' }),
  ).toHaveLength(1);
  for (const button of screen.getAllByRole('button', {
    name: 'Saving reflection',
  })) {
    expect(button).toBeDisabled();
    expect(button.props.accessibilityState.busy).toBe(true);
    fireEvent.press(button);
  }
  expect(base.onSubmit).not.toHaveBeenCalled();
  expect(screen.getByTestId('reflection-dismiss-save-spinner')).toBeTruthy();
  expect(screen.queryByText('Save Reflection')).toBeNull();
  expect(screen.queryByText('Saving…')).toBeNull();
  expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
  screen.rerender(<ReflectionView {...base} text="Saved" dismissOpen />);
  expect(screen.getByText('Save Reflection')).toBeTruthy();
  expect(screen.queryByTestId('reflection-dismiss-save-spinner')).toBeNull();
});
