import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors, fontFamilies } from '../../../theme/tokens';
import { SuccessView } from './SuccessView';

it('matches the Paper success layout and type scale', () => {
  const onContinue = jest.fn();
  const screen = render(<SuccessView onContinue={onContinue} />);
  const illustration = StyleSheet.flatten(
    screen.getByTestId('success-illustration', { includeHiddenElements: true })
      .props.style,
  );
  const scale = illustration.width / 262;
  const content = StyleSheet.flatten(
    screen.getByTestId('success-content').props.style,
  );
  const copy = StyleSheet.flatten(
    screen.getByTestId('success-copy').props.style,
  );
  const heading = StyleSheet.flatten(
    screen.getByRole('header', { name: 'That’s a win!' }).props.style,
  );
  const message = StyleSheet.flatten(
    screen.getByText(
      'You followed through on your challenge.\nTake a moment to enjoy it.',
    ).props.style,
  );
  const button = StyleSheet.flatten(
    screen.getByTestId('success-continue').props.style,
  );
  const buttonLabel = StyleSheet.flatten(
    screen.getByText('Continue').props.style,
  );

  expect(illustration.height).toBe(246 * scale);
  expect(illustration.backgroundColor).toBe(colors.successCanvas);
  expect(
    StyleSheet.flatten(
      screen.getByTestId('success-artwork-blend', {
        includeHiddenElements: true,
      }).props.style,
    ).mixBlendMode,
  ).toBe('multiply');
  expect(content).toMatchObject({
    paddingHorizontal: 29 * scale,
    paddingTop: 50 * scale,
  });
  expect(copy).toMatchObject({ marginTop: 16 * scale, gap: 14 * scale });
  expect(heading).toMatchObject({
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
    fontSize: 29 * scale,
    letterSpacing: -0.725 * scale,
    textAlign: 'center',
  });
  expect(message).toMatchObject({
    fontFamily: fontFamilies.regular,
    fontSize: 12 * scale,
    textAlign: 'center',
  });
  expect(button).toMatchObject({
    minHeight: 44 * scale,
    backgroundColor: colors.ink,
  });
  expect(buttonLabel).toMatchObject({
    fontFamily: fontFamilies.medium,
    fontWeight: '500',
    fontSize: 13 * scale,
  });
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
});
