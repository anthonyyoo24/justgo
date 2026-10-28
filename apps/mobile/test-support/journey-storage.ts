import { asyncStorageJournalStorage } from '../src/data/activity/persistence/storage';
import type { JournalStorage } from '../src/data/activity/model';

// Browser-only control exposed by the separately guarded journey Metro build.
// No account data or credentials are exposed through this fixture control.
declare global {
  var justgoJournalFaults: {
    mode: 'normal' | 'blocked' | 'full';
    privateMode: 'normal' | 'blocked' | 'full';
    release: () => void;
  };
}
const waiters = new Set<() => void>();
globalThis.justgoJournalFaults = {
  mode: 'normal',
  privateMode: 'normal',
  release: () => {
    globalThis.justgoJournalFaults.mode = 'normal';
    globalThis.justgoJournalFaults.privateMode = 'normal';
    for (const resolve of waiters) resolve();
    waiters.clear();
  },
};
export const asyncStorageJournalStorageFixture: JournalStorage = {
  ...asyncStorageJournalStorage,
  async setItem(key, value) {
    if (key.endsWith(':journal')) {
      if (globalThis.justgoJournalFaults.mode === 'blocked')
        await new Promise<void>((resolve) => waiters.add(resolve));
      if (globalThis.justgoJournalFaults.mode === 'full')
        throw Object.assign(new Error('Fixture phone storage full'), {
          code: 'ENOSPC',
        });
    }
    return asyncStorageJournalStorage.setItem(key, value);
  },
};
// Match the production adapter's export name at the build seam.
export { asyncStorageJournalStorageFixture as asyncStorageJournalStorage };

export async function waitForPrivateJournalFixture() {
  if (globalThis.justgoJournalFaults.privateMode === 'blocked')
    await new Promise<void>((resolve) => waiters.add(resolve));
  if (globalThis.justgoJournalFaults.privateMode === 'full')
    throw Object.assign(new Error('Fixture private journal full'), {
      code: 'ENOSPC',
    });
}
