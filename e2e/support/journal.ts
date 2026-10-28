import type { Page } from '@playwright/test';
import type { LocalJournalEntry } from '../../apps/mobile/src/data/journal/model';

/** Inspect the actual development browser store, never an app debug endpoint. */
export function localJournalEntries(
  page: Page,
  accountId: string,
): Promise<LocalJournalEntry[]> {
  return page.evaluate(async (owner) => {
    const name = `justgo-journal-v1-${owner}`;
    if (
      !(await indexedDB.databases()).some((database) => database.name === name)
    )
      return [];
    return new Promise<LocalJournalEntry[]>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      // A concurrent delete must not turn this inspection into a new store.
      request.onupgradeneeded = () => request.transaction?.abort();
      request.onerror = () => reject(new Error('Fixture journal unavailable'));
      request.onblocked = () => reject(new Error('Fixture journal blocked'));
      request.onsuccess = () => {
        const database = request.result;
        try {
          const transaction = database.transaction('entries', 'readonly');
          const read = transaction.objectStore('entries').getAll();
          transaction.oncomplete = () => {
            database.close();
            resolve(read.result);
          };
          transaction.onerror = transaction.onabort = () => {
            database.close();
            reject(new Error('Fixture journal read failed'));
          };
        } catch {
          database.close();
          reject(new Error('Fixture journal schema unavailable'));
        }
      };
    });
  }, accountId);
}
