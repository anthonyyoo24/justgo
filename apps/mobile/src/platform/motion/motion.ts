import { createContext, useContext } from 'react';
export const motionPreferenceKey = 'justgo:reduce-motion:v1';

export type MotionPreferences = {
  reduceMotion: boolean;
  requestedReduceMotion?: boolean;
  systemReduced: boolean | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setReduced: (enabled: boolean) => Promise<void>;
};

export const MotionContext = createContext<MotionPreferences | null>(null);

export function useMotionPreferences() {
  const preferences = useContext(MotionContext);
  if (!preferences) throw new Error('MotionPreferencesProvider is required');
  return preferences;
}

export function useReduceMotion() {
  return useMotionPreferences().reduceMotion;
}
