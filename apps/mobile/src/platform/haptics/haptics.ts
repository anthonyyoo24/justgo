import { createContext, useContext } from 'react';
import type { PulsarPreset } from './completion/completion-haptics';

export type HapticFeedback = 'accept' | 'completed' | 'selection';
export type HapticAdapter = {
  isAvailable: () => boolean;
  play: (
    feedback: HapticFeedback,
    stillAllowed: () => boolean,
  ) => Promise<void>;
  playPreset: (preset: PulsarPreset) => void;
  stop: () => void;
};
export type HapticPreferences = {
  enabled: boolean;
  available: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setEnabled: (enabled: boolean) => Promise<void>;
  feedback: (feedback: HapticFeedback) => void;
};

// Guarded presentation fixtures can render outside the real root provider.
// They never produce device feedback or persist a preference.
const silent: HapticPreferences = {
  enabled: false,
  available: false,
  loading: false,
  saving: false,
  error: null,
  setEnabled: async () => {},
  feedback: () => {},
};
export const HapticsContext = createContext<HapticPreferences>(silent);
export const useHapticPreferences = () => useContext(HapticsContext);
export const useHapticFeedback = () => useHapticPreferences().feedback;
