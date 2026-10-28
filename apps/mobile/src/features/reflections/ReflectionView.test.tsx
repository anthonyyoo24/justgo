import { fireEvent, render, within } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
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
});

afterEach(() => jest.restoreAllMocks());

it('starts unselected and offers Skip until a feeling or written text is present', async () => {
  const base = props();
  const screen = await render(<ReflectionView {...base} />);
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(5);
  expect(
    screen
      .getAllByRole('radio')
      .every((radio) => !radio.props.accessibilityState.checked),
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole('radio', { name: 'A little bit better' }),
  );
  expect(base.onFeelingChange).toHaveBeenCalledWith('a_little_better');
  await screen.rerender(<ReflectionView {...base} feeling="a_little_better" />);
  expect(screen.getByRole('button', { name: 'Save Reflection' })).toBeTruthy();
  expect(
    screen.getByRole('radio', { name: 'A little bit better' }).props
      .accessibilityState.checked,
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole('radio', { name: 'A little bit better' }),
  );
  expect(base.onFeelingChange).toHaveBeenLastCalledWith(null);
  await screen.rerender(<ReflectionView {...base} feeling={null} />);
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  expect(screen.getByText('Choose one.')).toBeTruthy();
  await screen.rerender(<ReflectionView {...base} text="A small win" />);
  expect(screen.getByRole('button', { name: 'Save Reflection' })).toBeTruthy();
  await screen.rerender(<ReflectionView {...base} text="   " />);
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
});

it('has native multiline entry and only the bottom exit, including with unsaved input', async () => {
  const base = props();
  const screen = await render(<ReflectionView {...base} />);
  const input = screen.getByLabelText('Your reflection');
  expect(input.props.multiline).toBe(true);
  const { width } = Dimensions.get('window');
  expect(StyleSheet.flatten(input.props.style).minHeight).toBe(
    (228 * Math.min(width, 390)) / 390,
  );
  await fireEvent.changeText(input, 'I tried even though I was nervous.');
  expect(base.onTextChange).toHaveBeenCalledWith(
    'I tried even though I was nervous.',
  );
  expect(screen.queryByText('Dictate')).toBeNull();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  await screen.rerender(<ReflectionView {...base} text="A note" />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Save Reflection' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Close reflection' })).toBeNull();
  expect(screen.queryByText('Leave your reflection?')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Discard and skip' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Keep editing' })).toBeNull();
});

it.each([1, 2])(
  'keeps the bottom exit outside the focused scroll area on a small phone at text scale %s',
  async (fontScale) => {
    jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
      width: 375,
      height: 667,
      scale: 2,
      fontScale,
    });
    const base = props();
    const screen = await render(<ReflectionView {...base} />);
    const viewport = screen.getByTestId('reflection-scroll');
    const input = screen.getByLabelText('Your reflection');
    const measure = async (node: typeof input, y: number, height: number) =>
      await fireEvent(node, 'layout', {
        nativeEvent: { layout: { x: 0, y, width: 375, height } },
      });
    const inputTop = fontScale === 1 ? 92 : 130;
    await measure(viewport, 0, 550);
    await measure(
      screen.getByTestId('reflection-section'),
      350,
      inputTop + 228,
    );
    await measure(input, inputTop, 228);
    await fireEvent(input, 'focus');
    await measure(viewport, 0, 260);
    expect(StyleSheet.flatten(input.props.style).height).toBe(
      260 - inputTop - 12 - 16,
    );
    expect(input.props.scrollEnabled).toBe(true);
    expect(within(viewport).queryByRole('button', { name: 'Skip' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(base.onSubmit).toHaveBeenCalledTimes(1);
    await screen.rerender(
      <ReflectionView {...base} text="Disposable reflection" />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save Reflection' }),
    );
    expect(base.onSubmit).toHaveBeenCalledTimes(2);
  },
);

it('matches the challenge screens’ top header typography', async () => {
  const reflection = await render(<ReflectionView {...props()} />);
  const challenge = await render(<ChallengeLayout title="Find a challenge" />);
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

it('disables duplicate saves immediately, shows delayed saving feedback and keeps text editable', async () => {
  const base = props();
  const screen = await render(<ReflectionView {...base} text="First" busy />);
  expect(
    screen.getByRole('button', { name: 'Save Reflection' }),
  ).toBeDisabled();
  expect(screen.queryByText('Saving…')).toBeNull();
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
  expect(screen.getByLabelText('Your reflection').props.editable).toBe(true);
  await screen.rerender(
    <ReflectionView {...base} text="First" busy savingVisible />,
  );
  expect(
    screen.getByRole('button', { name: 'Saving reflection' }).props
      .accessibilityState,
  ).toMatchObject({ disabled: true, busy: true });
  expect(screen.getByTestId('reflection-submit-spinner')).toBeTruthy();
  expect(screen.queryByText('Save Reflection')).toBeNull();
  expect(screen.queryByText('Saving…')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Saving reflection' }),
  );
  expect(base.onSubmit).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Your reflection'), 'Newer');
  expect(base.onTextChange).toHaveBeenCalledWith('Newer');
  await screen.rerender(<ReflectionView {...base} text="Newer" />);
  expect(screen.getByRole('button', { name: 'Save Reflection' })).toBeEnabled();
  expect(screen.getByText('Save Reflection')).toBeTruthy();
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
});
it('preserves feeling while editing and keeps validation inline', async () => {
  const screen = await render(
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
