import { createChunkedAuthStorage, AuthStorageError } from './secure-storage';

function setup() {
  const values = new Map<string, string>();
  const driver = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      if (Buffer.byteLength(value) > 2048) throw new Error('Native limit');
      values.set(key, Buffer.from(value).toString('utf8'));
    }),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  return { values, driver, storage: createChunkedAuthStorage(driver) };
}

it('persists realistic large provider sessions within the native per-item limit', async () => {
  const { storage, driver } = setup();
  const session = JSON.stringify({
    access_token: 'a'.repeat(7000),
    refresh_token: 'r'.repeat(80),
    user: { name: '오늘 🌱'.repeat(1000) },
  });
  await storage.setItem('justgo.auth.v1', session);
  expect(await storage.getItem('justgo.auth.v1')).toBe(session);
  expect(
    driver.setItem.mock.calls.every(
      ([, value]) => Buffer.byteLength(value) <= 2048,
    ),
  ).toBe(true);
});

it('retains the previous complete session when replacement chunks fail', async () => {
  const { storage, driver } = setup();
  await storage.setItem('session', 'old-session');
  driver.setItem.mockRejectedValueOnce(new Error('Keychain locked'));
  await expect(
    storage.setItem('session', 'replacement'.repeat(1000)),
  ).rejects.toBeInstanceOf(AuthStorageError);
  expect(await storage.getItem('session')).toBe('old-session');
});

it('rejects incomplete or malformed secure contents instead of reporting signed out', async () => {
  const { storage, values } = setup();
  expect(await storage.getItem('session')).toBeNull();
  values.set('session', '{');
  await expect(storage.getItem('session')).rejects.toBeInstanceOf(
    AuthStorageError,
  );
  values.set('session', JSON.stringify({ version: 1, slot: 0, count: 1 }));
  await expect(storage.getItem('session')).rejects.toBeInstanceOf(
    AuthStorageError,
  );
});

it('removes both committed and interrupted chunks without touching another key', async () => {
  const { storage, values } = setup();
  await storage.setItem('session', 'first'.repeat(1000));
  await storage.setItem('session', 'second');
  await storage.setItem('pkce', 'verifier');
  await storage.removeItem('session');
  expect(await storage.getItem('session')).toBeNull();
  expect([...values.keys()].some((key) => key.startsWith('session'))).toBe(
    false,
  );
  expect(await storage.getItem('pkce')).toBe('verifier');
});

it('bounds session size and rejects invalid key names before native calls', async () => {
  const { storage, driver } = setup();
  await expect(
    storage.setItem('session', 'a'.repeat(32769)),
  ).rejects.toBeInstanceOf(AuthStorageError);
  await expect(storage.setItem('../session', 'secret')).rejects.toBeInstanceOf(
    AuthStorageError,
  );
  expect(driver.setItem).not.toHaveBeenCalled();
});
