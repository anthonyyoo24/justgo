import { AppState, Platform, TurboModuleRegistry } from 'react-native';
import type { HapticAdapter } from './haptics';

function loadPulsar() {
  if (Platform.OS !== 'ios' || !TurboModuleRegistry.get('RNPulsar'))
    return null;
  // Pulsar enforces its native module at import time. Older binaries must
  // remain usable without loading that SDK or producing tactile feedback.
  return require('react-native-pulsar') as typeof import('react-native-pulsar');
}

export const hapticAdapter: HapticAdapter = {
  isAvailable: () => {
    try {
      return (loadPulsar()?.Settings.getHapticsSupportLevel() ?? 0) > 0;
    } catch {
      return false;
    }
  },
  async play(feedback, stillAllowed) {
    // One system heavy tap for deliberate input. The four-tap development
    // comparison uses the same Pulsar call; real completion defaults to Batter.
    const pulses = feedback === 'completed' ? 4 : 1;
    for (let pulse = 0; pulse < pulses; pulse++) {
      if (
        !hapticAdapter.isAvailable() ||
        !stillAllowed() ||
        AppState.currentState !== 'active'
      )
        return;
      const sdk = loadPulsar();
      if (!sdk) return;
      sdk.Settings.enableSound(false);
      sdk.Presets.System.impactHeavy();
      if (pulse < pulses - 1)
        await new Promise<void>((resolve) => setTimeout(resolve, 70));
    }
  },
  playPreset: (preset) => {
    if (AppState.currentState !== 'active') return;
    const sdk = loadPulsar();
    if (!sdk || !hapticAdapter.isAvailable())
      throw new Error('Pulsar module unavailable');
    sdk.Settings.enableSound(false);
    sdk.Presets[preset]();
  },
  stop: () => {
    loadPulsar()?.Settings.stopHaptics();
  },
};
