import { AuthStorageError, type SecureStorageDriver } from './secure-storage';

/** Browser sessions are tab-owned; native tokens always use the OS-backed adapter. */
export function createAuthStorage(): SecureStorageDriver {
  const work = <T>(action: () => T): T => {
    try {
      return action();
    } catch {
      throw new AuthStorageError();
    }
  };
  return {
    getItem: async (key) => work(() => window.sessionStorage.getItem(key)),
    setItem: async (key, value) =>
      work(() => window.sessionStorage.setItem(key, value)),
    removeItem: async (key) =>
      work(() => window.sessionStorage.removeItem(key)),
  };
}
