import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

/** Called while the root module loads, before React can finish native startup. */
export function holdNativeSplash() {
  if (Platform.OS === 'web') return;
  // Native launch errors are reported without native paths or private details.
  void SplashScreen.preventAutoHideAsync().catch(() => {
    console.warn('JustGO could not keep the native startup screen visible.');
  });
}

export function hideNativeSplash() {
  if (Platform.OS === 'web') return;
  void SplashScreen.hideAsync().catch(() => {
    console.warn('JustGO could not dismiss the native startup screen.');
  });
}
