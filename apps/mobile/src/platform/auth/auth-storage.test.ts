import * as SecureStore from 'expo-secure-store';
import { createAuthStorage } from './auth-storage';

jest.mock('expo-secure-store', () => {
  const keychain = new Map<string, string>();
  return {
    ...jest.requireActual('expo-secure-store'),
    getItemAsync: jest.fn(async (key: string) => keychain.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      keychain.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      keychain.delete(key);
    }),
  };
});

it('keeps managed sessions in their own keychain service, readable only on this unlocked device', async () => {
  const storage = createAuthStorage();
  const session = JSON.stringify({
    access_token: 'a'.repeat(2000),
    refresh_token: 'r'.repeat(80),
  });
  await storage.setItem('justgo.auth.v1', session);
  expect(await storage.getItem('justgo.auth.v1')).toBe(session);
  await storage.removeItem('justgo.auth.v1');
  expect(await storage.getItem('justgo.auth.v1')).toBeNull();

  const reads = jest.mocked(SecureStore.getItemAsync).mock.calls;
  const writes = jest.mocked(SecureStore.setItemAsync).mock.calls;
  const deletes = jest.mocked(SecureStore.deleteItemAsync).mock.calls;
  expect([reads.length, writes.length, deletes.length]).not.toContain(0);
  for (const options of [
    ...reads.map(([, options]) => options),
    ...writes.map(([, , options]) => options),
    ...deletes.map(([, options]) => options),
  ])
    expect(options).toEqual({
      keychainService: 'justgo.managed-auth.v1',
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: false,
    });
});
