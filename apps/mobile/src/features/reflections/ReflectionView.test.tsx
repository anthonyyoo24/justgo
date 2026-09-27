import { fireEvent, render } from '@testing-library/react-native';
import { ReflectionView } from './ReflectionView';

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
