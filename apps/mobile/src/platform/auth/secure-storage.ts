export interface SecureStorageDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class AuthStorageError extends Error {
  constructor() {
    super(
      'Secure account storage is unavailable. Unlock your phone and retry.',
    );
    this.name = 'AuthStorageError';
  }
}

// Older iOS releases reject individual Keychain values around 2 KB. Keep each
// chunk below that in UTF-8, including non-ASCII provider metadata. Two fixed
// slots let the manifest commit atomically while retaining the previous value.
const chunkLength = 512;
const maximumChunks = 64;
type Manifest = { version: 1; slot: 0 | 1; count: number };

function manifest(value: string | null): Manifest | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Object.keys(parsed).sort().join(',') !== 'count,slot,version' ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('slot' in parsed) ||
    (parsed.slot !== 0 && parsed.slot !== 1) ||
    !('count' in parsed) ||
    typeof parsed.count !== 'number' ||
    !Number.isInteger(parsed.count) ||
    parsed.count < 1 ||
    parsed.count > maximumChunks
  )
    throw new AuthStorageError();
  return parsed as Manifest;
}

export function createChunkedAuthStorage(
  driver: SecureStorageDriver,
): SecureStorageDriver {
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const result = tail.then(async () => {
      if (!/^[A-Za-z0-9_.-]{1,150}$/.test(key)) throw new AuthStorageError();
      try {
        return await work();
      } catch {
        throw new AuthStorageError();
      }
    });
    tail = result.catch(() => undefined);
    return result;
  };
  const chunkKey = (key: string, slot: number, index: number) =>
    `${key}.${slot}.${index}`;
  return {
    getItem: (key) =>
      run(key, async () => {
        const current = manifest(await driver.getItem(key));
        if (!current) return null;
        const chunks: string[] = [];
        for (let index = 0; index < current.count; index++) {
          const value = await driver.getItem(
            chunkKey(key, current.slot, index),
          );
          if (value === null || value.length > chunkLength)
            throw new AuthStorageError();
          chunks.push(value);
        }
        return chunks.join('');
      }),
    setItem: (key, value) =>
      run(key, async () => {
        if (!value || value.length > maximumChunks * chunkLength)
          throw new AuthStorageError();
        const current = manifest(await driver.getItem(key));
        const slot = current?.slot === 0 ? 1 : 0;
        const chunks: string[] = [];
        for (let offset = 0; offset < value.length;) {
          let end = Math.min(offset + chunkLength, value.length);
          const last = value.charCodeAt(end - 1);
          if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--;
          chunks.push(value.slice(offset, end));
          offset = end;
        }
        const count = chunks.length;
        if (count > maximumChunks) throw new AuthStorageError();
        for (let index = 0; index < count; index++) {
          const chunk = chunks[index];
          if (chunk === undefined) throw new AuthStorageError();
          const target = chunkKey(key, slot, index);
          await driver.setItem(target, chunk);
          if ((await driver.getItem(target)) !== chunk)
            throw new AuthStorageError();
        }
        const next = JSON.stringify({ version: 1, slot, count });
        await driver.setItem(key, next);
        if ((await driver.getItem(key)) !== next) throw new AuthStorageError();
      }),
    removeItem: (key) =>
      run(key, async () => {
        // Hide the session first, then clear every fixed slot, including chunks
        // left by an interrupted write. A failed cleanup remains retryable.
        await driver.removeItem(key);
        for (const slot of [0, 1])
          for (let index = 0; index < maximumChunks; index++)
            await driver.removeItem(chunkKey(key, slot, index));
      }),
  };
}
