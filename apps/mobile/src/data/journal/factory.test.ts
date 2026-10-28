import { MemoryJournalBackend } from '../../../test-support/local-journal';
import { serializeJournalBackend } from './backend';
import { createLocalJournal } from './factory';

jest.unmock('./factory');
jest.mock('./storage', () => {
  const { MemoryJournalBackend } = jest.requireActual<
    typeof import('../../../test-support/local-journal')
  >('../../../test-support/local-journal');
  return { localJournalBackend: new MemoryJournalBackend() };
});

it('shares one owner repository until disposal and recreates a usable handle afterward', async () => {
  const owner = '10000000-0000-4000-8000-000000000081';
  const first = createLocalJournal(owner);
  expect(createLocalJournal(owner)).toBe(first);
  first.stop();
  const next = createLocalJournal(owner);
  expect(next).not.toBe(first);
  expect(next.isStopped).toBe(false);
  expect(await next.list()).toEqual([]);
  const other = createLocalJournal('10000000-0000-4000-8000-000000000082');
  expect(other).not.toBe(next);
});

it('serializes deletion behind an accepted transaction across owner handle lifetimes', async () => {
  const events: string[] = [];
  const source = new MemoryJournalBackend();
  const backend = serializeJournalBackend(source);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = backend.transaction('owner', async () => {
    events.push('started');
    await gate;
    events.push('finished');
  });
  const removal = backend
    .deleteOwned('owner')
    .then(() => events.push('deleted'));
  await Promise.resolve();
  await Promise.resolve();
  expect(events).toEqual(['started']);
  release();
  await Promise.all([write, removal]);
  expect(events).toEqual(['started', 'finished', 'deleted']);
  await expect(
    backend.transaction('owner', () =>
      Promise.reject(new Error('Synthetic failure')),
    ),
  ).rejects.toThrow('Synthetic failure');
  expect(
    await backend.transaction('owner', () => Promise.resolve('retried')),
  ).toBe('retried');
});
