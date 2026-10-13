import { AppState, Platform, TurboModuleRegistry } from 'react-native';
import type { CompletionHapticAdapter } from './completion-haptics';

function loadPulsar() {
  if (Platform.OS !== 'ios' || !TurboModuleRegistry.get('RNPulsar'))
    return null;
  // The SDK enforces its TurboModule at import time. Load it only after checking
  // so the previously installed development binary can still run this bundle.
  return require('react-native-pulsar') as typeof import('react-native-pulsar');
}

export const pulsarAdapter: CompletionHapticAdapter = {
  isAvailable: () => {
    try {
      return (loadPulsar()?.Settings.getHapticsSupportLevel() ?? 0) > 0;
    } catch {
      return false;
    }
  },
  play: (preset) => {
    if (AppState.currentState !== 'active') return;
    const sdk = loadPulsar();
    if (!sdk) throw new Error('Pulsar module unavailable');
    sdk.Settings.enableSound(false);
    sdk.Presets[preset]();
  },
  stop: () => {
    loadPulsar()?.Settings.stopHaptics();
  },
};
