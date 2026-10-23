import { act, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { ScaledText } from './ScaledText';
import { PrimaryButton } from '../PrimaryButton';
import { SettingsPage } from '../settings/SettingsPage';
import { SettingsRowContent } from '../settings/SettingsRows';

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false }),
}));
const original = Dimensions.get('window');
async function changeScale(fontScale: number, width = 402) {
  await act(() =>
    Dimensions.set({ window: { ...original, width, fontScale } }),
  );
}
beforeEach(async () => await changeScale(1));
afterEach(async () => await act(() => Dimensions.set({ window: original })));

it('updates both rendered and measured metrics when the system size changes live', async () => {
  const screen = await render(
    <ScaledText
      accessibilityRole="header"
      style={{ fontSize: 16, lineHeight: 24 }}
    >
      Account details
    </ScaledText>,
  );
  const text = screen.getByRole('header');
  await changeScale(3.2);
  expect(screen.getByRole('header') === text).toBe(true);
  expect(text.props.allowFontScaling).toBe(false);
  expect(text.props.style.fontSize).toBeCloseTo(51.2);
  expect(text.props.style.lineHeight).toBeCloseTo(76.8);
  await changeScale(1.94);
  expect(text.props.style.fontSize).toBeCloseTo(31.04);
  expect(text.props.style.lineHeight).toBeCloseTo(46.56);
});

it('bounds navigation headings while body text retains the full requested size', async () => {
  await changeScale(3.2);
  const screen = await render(
    <>
      <ScaledText style={{ fontSize: 23 }} maxFontSizeMultiplier={2}>
        Recovery
      </ScaledText>
      <ScaledText style={[{ fontSize: 12 }, { fontSize: 16 }]}>
        Your information
      </ScaledText>
      <ScaledText>Unstyled text</ScaledText>
    </>,
  );
  expect(screen.getByText('Recovery').props.style.fontSize).toBe(46);
  expect(screen.getByText('Your information').props.style.fontSize).toBe(51.2);
  expect(screen.getByText('Unstyled text').props.style.fontSize).toBeCloseTo(
    44.8,
  );
});

it('reuses metrics for unrelated window changes and invalidates when typography changes', async () => {
  const body = { fontSize: 16, lineHeight: 24 };
  const screen = await render(
    <ScaledText style={body}>Your information</ScaledText>,
  );
  const initial = screen.getByText('Your information').props.style;
  await changeScale(1, 320);
  expect(screen.getByText('Your information').props.style === initial).toBe(
    true,
  );
  await screen.rerender(
    <ScaledText style={{ fontSize: 18 }}>Your information</ScaledText>,
  );
  expect(screen.getByText('Your information').props.style.fontSize).toBe(18);
});

function ownerView(
  node: ReturnType<Awaited<ReturnType<typeof render>>['getByText']>,
) {
  let parent = node.parent;
  while (parent && String(parent.type) !== 'View') parent = parent.parent;
  return parent;
}
it('moves availability beneath the label and gives enlarged titles the full width', async () => {
  const screen = await render(
    <SettingsPage title="Troubleshooting">
      <SettingsRowContent icon="haptics" label="Haptics" status="Coming soon" />
    </SettingsPage>,
  );
  const normalStatusParent = ownerView(screen.getByText('Coming soon'));
  await changeScale(3.2, 320);
  const headingStyle = StyleSheet.flatten(
    screen.getByRole('header').props.style,
  );
  expect(headingStyle).toMatchObject({
    width: '100%',
    textAlign: 'left',
    fontSize: 40,
  });
  expect(
    ownerView(screen.getByText('Coming soon')) === normalStatusParent,
  ).toBe(false);
  expect(
    ownerView(screen.getByText('Coming soon')) ===
      ownerView(screen.getByText('Haptics')),
  ).toBe(true);
  expect(screen.getByText('Coming soon').props.style.maxWidth).toBeUndefined();
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  await changeScale(1);
  expect(screen.getByRole('header').props.style.fontSize).toBe(29);
  expect(screen.getByText('Coming soon').props.style.maxWidth).toBe(76);
});

it('preserves a pending action and restores current label metrics after resizing', async () => {
  const screen = await render(
    <PrimaryButton label="Review transfer" onPress={() => undefined} />,
  );
  const button = screen.getByRole('button', { name: 'Review transfer' });
  await changeScale(3.2);
  expect(screen.getByText('Review transfer').props.style).toMatchObject({
    fontSize: 30,
    lineHeight: 40,
  });
  await screen.rerender(
    <PrimaryButton label="Review transfer" busy onPress={() => undefined} />,
  );
  expect(
    screen.getByRole('button', { name: 'Review transfer' }) === button,
  ).toBe(true);
  expect(button).toBeDisabled();
  expect(
    screen.getByRole('progressbar', { name: 'Review transfer in progress' }),
  ).toBeTruthy();
  expect(screen.queryByText('Review transfer')).toBeNull();
  await changeScale(1);
  expect(button).toBeDisabled();
  expect(
    screen.getByRole('progressbar', { name: 'Review transfer in progress' }),
  ).toBeTruthy();
  await screen.rerender(
    <PrimaryButton label="Review transfer" onPress={() => undefined} />,
  );
  expect(screen.getByText('Review transfer').props.style).toMatchObject({
    fontSize: 15,
    lineHeight: 20,
  });
  expect(button).toBeEnabled();
  expect(screen.queryByRole('progressbar')).toBeNull();
});
