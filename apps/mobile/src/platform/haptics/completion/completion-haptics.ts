import { createContext, useContext } from 'react';

export const completionHaptics = [
  { id: 'current', label: 'Original Expo effect' },
  { id: 'bloom', label: 'Bloom' },
  { id: 'fanfare', label: 'Fanfare' },
  { id: 'fizz', label: 'Fizz' },
  { id: 'flourish', label: 'Flourish' },
  { id: 'trumpet', label: 'Trumpet' },
  { id: 'triumph', label: 'Triumph' },
  { id: 'barrage', label: 'Barrage' },
  { id: 'batter', label: 'Batter' },
  { id: 'afterglow', label: 'Afterglow' },
] as const;
export type CompletionHaptic = (typeof completionHaptics)[number]['id'];
export type PulsarPreset = Exclude<CompletionHaptic, 'current'>;
export const defaultCompletionHaptic: PulsarPreset = 'batter';
export type CompletionHapticAdapter = {
  isAvailable: () => boolean;
  play: (preset: PulsarPreset) => void;
  stop: () => void;
};
export type CompletionHapticsTesting = {
  selected: CompletionHaptic;
  pulsarAvailable: boolean;
  previewing: boolean;
  error: string | null;
  select: (preset: CompletionHaptic) => void;
  preview: () => Promise<void>;
  stop: () => void;
};
export const CompletionHapticsContext = createContext<CompletionHapticsTesting>(
  {
    selected: defaultCompletionHaptic,
    pulsarAvailable: false,
    previewing: false,
    error: null,
    select: () => {},
    preview: async () => {},
    stop: () => {},
  },
);
export const useCompletionHapticsTesting = () =>
  useContext(CompletionHapticsContext);
