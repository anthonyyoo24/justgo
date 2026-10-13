import type { HapticAdapter } from './haptics';

// The first release uses iPhone touch feedback; desktop previews stay quiet.
export const hapticAdapter: HapticAdapter = {
  isAvailable: () => false,
  play: async () => {},
  playPreset: () => {},
  stop: () => {},
};
