import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { createICloudSync, type ICloudNativeModule } from './adapter';

export const iCloudSync = createICloudSync(
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<ICloudNativeModule>('JustGoICloud')
    : null,
  AsyncStorage,
);
export * from './model';
