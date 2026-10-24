import { waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';
import { hideNativeSplash, holdNativeSplash } from './native-splash';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => {}),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
});
afterEach(() => jest.restoreAllMocks());

it('holds and dismisses the native splash through the supported Expo APIs', () => {
  holdNativeSplash();
  hideNativeSplash();
  expect(preventAutoHideAsync).toHaveBeenCalledTimes(1);
  expect(hideAsync).toHaveBeenCalledTimes(1);
});

it('does not invoke native splash control from web', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  holdNativeSplash();
  hideNativeSplash();
  expect(preventAutoHideAsync).not.toHaveBeenCalled();
  expect(hideAsync).not.toHaveBeenCalled();
});

it.each(['hold', 'hide'] as const)(
  'handles a native %s rejection with a safe diagnostic rather than an unhandled promise',
  async (operation) => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('Synthetic private native path');
    if (operation === 'hold') {
      jest.mocked(preventAutoHideAsync).mockRejectedValueOnce(error);
      holdNativeSplash();
    } else {
      jest.mocked(hideAsync).mockRejectedValueOnce(error);
      hideNativeSplash();
    }
    await waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
    expect(warning).toHaveBeenCalledWith(
      operation === 'hold'
        ? 'JustGO could not keep the native startup screen visible.'
        : 'JustGO could not dismiss the native startup screen.',
    );
  },
);
