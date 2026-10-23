import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DataPreferences } from '../../../data/backup/data-backup';
import { motionPreferenceKey } from '../../../platform/motion/motion';
import { hapticsPreferenceKey } from '../../../platform/haptics/haptics';
import { ApiError } from '../../../lib/network/http';

/** Preference controllers own UI updates; readback prevents a swallowed disk error from claiming success. */
export async function applyImportedPreferences(
  preferences: DataPreferences,
  controls: {
    setReduced: (value: boolean) => Promise<void>;
    setHaptics: (value: boolean) => Promise<void>;
  },
  check: () => void,
  storage: Pick<typeof AsyncStorage, 'getItem'> = AsyncStorage,
): Promise<void> {
  check();
  await controls.setReduced(preferences.reduceMotion);
  check();
  await controls.setHaptics(preferences.haptics);
  check();
  const motion = await storage.getItem(motionPreferenceKey);
  const haptics = await storage.getItem(hapticsPreferenceKey);
  check();
  if (
    (motion !== null && motion !== 'true' && motion !== 'false') ||
    (haptics !== null && haptics !== 'true' && haptics !== 'false')
  )
    throw new ApiError('STORAGE');
  if (
    (motion === null ? false : motion === 'true') !==
      preferences.reduceMotion ||
    (haptics === null ? true : haptics === 'true') !== preferences.haptics
  )
    throw new ApiError('STORAGE');
}
