import { Image as NativeImage } from 'react-native';
import { Image } from 'expo-image';

export const welcomeArtwork =
  require('../../../../assets/illustrations/welcome-night-paper.png') as number;
export const welcomeBackgroundColor = '#122E45';

export async function preloadWelcomeArtwork(): Promise<boolean> {
  try {
    const uri = NativeImage.resolveAssetSource(welcomeArtwork)?.uri;
    return uri ? await Image.prefetch(uri, 'memory-disk') : false;
  } catch {
    // Warming the image is optional; a cache failure must not block deletion.
    // WelcomeView still loads the source over its navy fallback normally.
    return false;
  }
}
