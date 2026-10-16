import { Image as NativeImage } from 'react-native';
import { Image } from 'expo-image';
import { preloadWelcomeArtwork } from './welcome-artwork';

beforeEach(() => {
  jest.spyOn(NativeImage, 'resolveAssetSource').mockReturnValue({
    uri: 'http://localhost/welcome.png',
    width: 908,
    height: 1733,
    scale: 1,
  });
});
afterEach(() => jest.restoreAllMocks());

it.each([true, false])(
  'returns the image cache result (%s)',
  async (result) => {
    const prefetch = jest.spyOn(Image, 'prefetch').mockResolvedValue(result);
    await expect(preloadWelcomeArtwork()).resolves.toBe(result);
    expect(prefetch).toHaveBeenCalledWith(
      'http://localhost/welcome.png',
      'memory-disk',
    );
  },
);

it('handles cache failures without rejecting deletion preparation', async () => {
  jest.spyOn(Image, 'prefetch').mockRejectedValue(new Error('Offline'));
  await expect(preloadWelcomeArtwork()).resolves.toBe(false);
});

it('does not prefetch when no asset URI is available', async () => {
  jest.spyOn(NativeImage, 'resolveAssetSource').mockReturnValue({
    uri: '',
    width: 0,
    height: 0,
    scale: 1,
  });
  const prefetch = jest.spyOn(Image, 'prefetch');
  await expect(preloadWelcomeArtwork()).resolves.toBe(false);
  expect(prefetch).not.toHaveBeenCalled();
});
