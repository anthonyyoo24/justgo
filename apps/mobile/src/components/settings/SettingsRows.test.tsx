jest.mock('react-native-svg', () =>
  jest.requireActual('../../../test-support/svg'),
);
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SettingsRowContent } from './SettingsRows';
import { colors } from '../../theme/tokens';

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
