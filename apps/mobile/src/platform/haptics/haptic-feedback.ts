import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';
import { AppState, Platform } from 'react-native';
import type { HapticAdapter } from './haptics';

export const hapticAdapter: HapticAdapter = {
  isAvailable: () =>
    Platform.OS === 'ios' &&
    requireOptionalNativeModule('ExpoHaptics') !== null,
  async play(feedback, stillAllowed) {
    // SDK 57 uses an optional native import, so older development binaries can
    // load the app safely. Only call its methods when the module is available.
    // One firm tap for deliberate input; completion gets a short vibration-like
    // burst. Recheck permission and foreground state before every native pulse.
    const pulses = feedback === 'completed' ? 4 : 1;
    for (let pulse = 0; pulse < pulses; pulse++) {
      if (
        !hapticAdapter.isAvailable() ||
        !stillAllowed() ||
        AppState.currentState !== 'active'
      )
        return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (pulse < pulses - 1)
        await new Promise<void>((resolve) => setTimeout(resolve, 70));
    }
  },
};
