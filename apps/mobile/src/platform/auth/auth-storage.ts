import * as SecureStore from 'expo-secure-store';
import { createChunkedAuthStorage } from './secure-storage';

export function createAuthStorage() {
  const options = {
    keychainService: 'justgo.managed-auth.v1',
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: false,
  };
  return createChunkedAuthStorage({
    getItem: (key) => SecureStore.getItemAsync(key, options),
    setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
    removeItem: (key) => SecureStore.deleteItemAsync(key, options),
  });
}
