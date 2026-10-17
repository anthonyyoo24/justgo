import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SettingsRowContent } from './SettingsRows';

it('keeps an absent numeric accessory from becoming raw text in a native row', () => {
  const screen = render(
    <SettingsRowContent icon="account" label="Preference" accessory={0} />,
  );
  expect(screen.getByText('Preference')).toBeTruthy();
  expect(screen.toJSON()).toEqual(
    expect.objectContaining({
      children: expect.not.arrayContaining(['0']),
    }),
  );
});

it('renders a supplied accessory without changing the row label', () => {
  const screen = render(
    <SettingsRowContent
      icon="account"
      label="Preference"
      accessory={<Text>Accessory ready</Text>}
    />,
  );
  expect(screen.getByText('Preference')).toBeTruthy();
  expect(screen.getByText('Accessory ready')).toBeTruthy();
});
