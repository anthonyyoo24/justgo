import AsyncStorage from '@react-native-async-storage/async-storage';
import type { JournalStorage } from '../model';

// Keep the native/web adapter out of the repository so tests control every
// failure and no native storage module is required by the domain state model.
export const asyncStorageJournalStorage: JournalStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
