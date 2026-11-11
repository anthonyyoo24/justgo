import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import DevicesRoute from '../app/account/devices';
import KeysRoute from '../app/account/keys';
import RecoverRoute from '../app/account/recover';
import TransferRoute from '../app/account/transfer';
import TroubleshootingRoute from '../app/account/troubleshooting';

const oldAccountTools = {
  devices: DevicesRoute,
  keys: KeysRoute,
  recover: RecoverRoute,
  transfer: TransferRoute,
  troubleshooting: TroubleshootingRoute,
};

it('covers every account route except sign-in', () => {
  expect(readdirSync(join(__dirname, '../app/account')).sort()).toEqual(
    [...Object.keys(oldAccountTools), 'sign-in']
      .map((name) => `${name}.tsx`)
      .sort(),
  );
});

it.each(Object.entries(oldAccountTools))(
  'sends the old /account/%s route to recovery without showing its own screen',
  async (name, route) => {
    const navigation = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        recovery: () => <Text>Recovery ready</Text>,
        [`account/${name}`]: route,
      },
      { initialUrl: `/account/${name}` },
    );
    expect(await screen.findByText('Recovery ready')).toBeTruthy();
    expect(navigation.getPathname()).toBe('/recovery');
  },
);
