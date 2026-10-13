import type { CompletionHapticAdapter } from './completion-haptics';

// Browsing the test choices never requests desktop vibration or phone pairing.
export const pulsarAdapter: CompletionHapticAdapter = {
  isAvailable: () => false,
  play: () => {},
  stop: () => {},
};
