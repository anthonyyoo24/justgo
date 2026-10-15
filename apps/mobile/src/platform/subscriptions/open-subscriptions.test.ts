import { requireOptionalNativeModule } from 'expo';
import { Linking, Platform } from 'react-native';
import { openSubscriptionManagement } from './open-subscriptions';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));
const openUrl = jest.spyOn(Linking, 'openURL');
const nativeOpen = jest.fn<Promise<void>, []>();
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  nativeOpen.mockResolvedValue(undefined);
  openUrl.mockResolvedValue(undefined);
  jest.mocked(requireOptionalNativeModule).mockReturnValue({
    openSubscriptionManagement: nativeOpen,
  });
});
afterAll(() => jest.restoreAllMocks());

it('opens the native Apple controls without also opening an external list', async () => {
  await openSubscriptionManagement();
  expect(requireOptionalNativeModule).toHaveBeenCalledWith(
    'JustGoSubscriptions',
  );
  expect(nativeOpen).toHaveBeenCalledTimes(1);
  expect(openUrl).not.toHaveBeenCalled();
});
it('leaves native presentation failures visible to the caller for retry', async () => {
  nativeOpen.mockRejectedValueOnce(new Error('presentation failed'));
  await expect(openSubscriptionManagement()).rejects.toThrow(
    'presentation failed',
  );
  expect(openUrl).not.toHaveBeenCalled();
  await openSubscriptionManagement();
  expect(nativeOpen).toHaveBeenCalledTimes(2);
});
it('uses the approved destination on older installed binaries', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  await openSubscriptionManagement();
  expect(openUrl).toHaveBeenCalledWith(
    'https://apps.apple.com/account/subscriptions',
  );
});
it('keeps the web preview usable without loading a native module', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await openSubscriptionManagement();
  expect(requireOptionalNativeModule).not.toHaveBeenCalled();
  expect(openUrl).toHaveBeenCalledWith(
    'https://apps.apple.com/account/subscriptions',
  );
});
it('propagates a failed fallback destination instead of claiming cancellation', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  openUrl.mockRejectedValueOnce(new Error('unavailable'));
  await expect(openSubscriptionManagement()).rejects.toThrow('unavailable');
});
