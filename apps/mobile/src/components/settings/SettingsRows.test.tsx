jest.mock('react-native-svg', () =>
  jest.requireActual('../../../test-support/svg'),
);
import { act, render } from '@testing-library/react-native';
import { Text, StyleSheet, Dimensions } from 'react-native';
import { SettingsRowContent } from './SettingsRows';
import { colors } from '../../theme/tokens';

const originalWindow = Dimensions.get('window');
async function changeWindow(width: number, fontScale: number) {
  await act(() =>
    Dimensions.set({ window: { ...originalWindow, width, fontScale } }),
  );
}
beforeEach(async () => await changeWindow(390, 1));
afterEach(
  async () => await act(() => Dimensions.set({ window: originalWindow })),
);

it('keeps an absent numeric accessory from becoming raw text in a native row', async () => {
  const screen = await render(
    <SettingsRowContent icon="account" label="Preference" accessory={0} />,
  );
  expect(screen.getByText('Preference')).toBeTruthy();
  expect(screen.toJSON()).toEqual(
    expect.objectContaining({
      children: expect.not.arrayContaining(['0']),
    }),
  );
});

it('renders a supplied accessory without changing the row label', async () => {
  const screen = await render(
    <SettingsRowContent
      icon="account"
      label="Preference"
      accessory={<Text>Accessory ready</Text>}
    />,
  );
  expect(screen.getByText('Preference')).toBeTruthy();
  expect(screen.getByText('Accessory ready')).toBeTruthy();
});

it.each([
  { destructive: true, color: '#B3261E' },
  { destructive: false, color: colors.ink },
])(
  'uses matching icon and label colors for destructive=$destructive',
  async ({ destructive, color }) => {
    const screen = await render(
      <SettingsRowContent
        icon="delete"
        label="Delete data"
        destructive={destructive}
      />,
    );
    expect(screen.getByText('Delete data')).toHaveStyle({ color });
    expect(
      screen.container.queryAll((node) => node.type === 'Path')[0]!.props
        .stroke,
    ).toBe(color);
  },
);

it.each([
  { width: 320, fontScale: 1 },
  { width: 390, fontScale: 1 },
  { width: 320, fontScale: 1.3 },
  { width: 390, fontScale: 1.3 },
])(
  'keeps compact active copy inside the original label height at width $width and font scale $fontScale',
  async ({ width, fontScale }) => {
    await changeWindow(width, fontScale);
    const screen = await render(
      <SettingsRowContent icon="apple" label="Apple" />,
    );
    const beforeLabel = screen.getByText('Apple');
    const beforeCopy = StyleSheet.flatten(beforeLabel.parent!.props.style);
    const beforeRow = StyleSheet.flatten(
      beforeLabel.parent!.parent!.props.style,
    );
    const beforeText = StyleSheet.flatten(beforeLabel.props.style);
    await screen.rerender(
      <SettingsRowContent
        icon="apple"
        label="Apple"
        subtitle="You’re signed in with Apple."
      />,
    );
    const label = screen.getByText('Apple');
    const subtitle = screen.getByText('You’re signed in with Apple.');
    expect(StyleSheet.flatten(label.props.style)).toEqual(beforeText);
    expect(StyleSheet.flatten(label.parent!.parent!.props.style)).toEqual(
      beforeRow,
    );
    expect(StyleSheet.flatten(label.parent!.props.style)).toEqual({
      ...beforeCopy,
      height: 24 * fontScale,
      transform: [{ translateY: -6 }],
    });
    expect(subtitle).toHaveProp('numberOfLines', 1);
    expect(subtitle).toHaveStyle({
      position: 'absolute',
      top: 24 * fontScale,
      left: 0,
      right: 0,
      fontSize: 10 * fontScale,
      lineHeight: 14 * fontScale,
    });
  },
);

it('lets enlarged signed-in subtext wrap naturally while preserving the existing label and logo sizing', async () => {
  await changeWindow(320, 1.6);
  const screen = await render(
    <SettingsRowContent
      icon="google"
      label="Google"
      subtitle="You’re signed in with Google."
    />,
  );
  const label = screen.getByText('Google');
  const subtitle = screen.getByText('You’re signed in with Google.');
  expect(label).toHaveStyle({ fontSize: 16 * 1.6, lineHeight: 24 * 1.6 });
  expect(subtitle).toHaveStyle({ fontSize: 12 * 1.6, lineHeight: 18 * 1.6 });
  expect(subtitle.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(subtitle.props.style).position).toBeUndefined();
  expect(StyleSheet.flatten(label.parent!.props.style).height).toBeUndefined();
  expect(
    StyleSheet.flatten(label.parent!.props.style).transform,
  ).toBeUndefined();
  const logo = screen.container.queryAll((node) => node.type === 'Svg')[0]!;
  expect(logo.props.width).toBe(20);
  expect(logo.props.height).toBe(20);
});
