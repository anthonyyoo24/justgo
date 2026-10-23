import AsyncStorage from '@react-native-async-storage/async-storage';
import { createICloudSync } from './adapter';

// Web does not use the signed app's private CloudKit database. A missing native
// capability must remain unavailable rather than behave like a working toggle.
export const iCloudSync = createICloudSync(null, AsyncStorage);
export * from './model';
