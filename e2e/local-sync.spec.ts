import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { catalogSchema, sessionResponseSchema } from '@justgo/contracts';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';

// Mobile modules read React Native's __DEV__ global.
Object.defineProperty(globalThis, '__DEV__', {
  value: true,
  configurable: true,
});

const {
  AccountRepository,
  MemoryStorage,
  memoryLocalJournal,
  memoryJournalBackend,
} = (await import(
  new URL('../.local/journey-repository.mjs', import.meta.url).href
)) as typeof import('./support/activity-entry');
type MemoryStorage = InstanceType<typeof MemoryStorage>;

// Failure controls stay in the runner, never in the deployable app/API. The
// fixture account and catalog come from the loopback fixture API.
async function fixtureAccount() {
  const token = randomBytes(32).toString('hex');
  const response = await fetch(`${journeyApiUrl}/v1/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'bootstrap',
      credential: randomBytes(32).toString('hex'),
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: token,
    }),
  });
  if (!response.ok) throw new Error('Disposable account bootstrap failed');
  const account = sessionResponseSchema.parse(await response.json());
  const catalogResponse = await fetch(`${journeyApiUrl}/v1/challenges`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!catalogResponse.ok) throw new Error('Disposable catalog read failed');
  const catalog = catalogSchema.parse(await catalogResponse.json());
  return { token, account, card: catalog.cards[0]! };
}
function repository(accountId: string, storage: MemoryStorage) {
  const repo = new AccountRepository({
    accountId,
    storage,
    localJournal: memoryLocalJournal(accountId, storage),
    today: new Date().toISOString().slice(0, 10),
    timeZone: 'UTC',
  });
  return { repo, close: () => repo.dispose() };
}

test('private journal failures preserve input locally and leave the server empty', async ({
  fixtureDatabase,
}) => {
  const { account, card } = await fixtureAccount();
  const storage = new MemoryStorage();
  const { repo, close } = repository(account.userId, storage);
  try {
    await repo.hydrate();
    const completion = {
      id: randomUUID(),
      challengeId: card.challengeId,
      venue: card.venue,
      startedAt: new Date().toISOString(),
      startTimeZone: 'UTC',
    };
    await repo.complete(completion, card);
    await repo.synchronize();
    memoryJournalBackend(storage).failCommit = true;
    await expect(
      repo.submitReflection(completion.id, randomUUID(), {
        text: 'Private failed save fixture.',
      }),
    ).rejects.toMatchObject({ code: 'STORAGE' });
    expect(repo.getAttempt(completion.id)?.reflection).toBeNull();
    memoryJournalBackend(storage).failCommit = false;
    await repo.submitReflection(completion.id, randomUUID(), {
      text: 'Private failed save fixture.',
    });
    await repo.synchronize();
    expect(repo.getAttempt(completion.id)?.reflection?.text).toBe(
      'Private failed save fixture.',
    );
    // No data mode uploads through the attempts API since #293 retired the
    // legacy sender, so the server holds nothing this phone saved.
    expect(
      (
        await fixtureDatabase.query(
          'select id from justgo.attempts where user_id=$1',
          [account.userId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await fixtureDatabase.query(
          'select id from justgo.attempt_patch_receipts where user_id=$1',
          [account.userId],
        )
      ).rows,
    ).toEqual([]);
  } finally {
    close();
  }
});

test('ten long submissions persist on the phone with measured serialization bounds and stay off the server', async ({
  fixtureDatabase,
}, testInfo) => {
  const { account, card } = await fixtureAccount();
  const storage = new MemoryStorage();
  const { repo, close } = repository(account.userId, storage);
  try {
    repo.setEnvironment({ active: true, online: false });
    await repo.hydrate();
    const started = performance.now();
    for (let n = 0; n < 10; n++) {
      const completion = {
        id: randomUUID(),
        challengeId: card.challengeId,
        venue: card.venue,
        startedAt: new Date().toISOString(),
        startTimeZone: 'UTC',
      };
      await repo.complete(completion, card);
      await repo.submitReflection(completion.id, randomUUID(), {
        text: 'x'.repeat(10_000),
      });
    }
    const envelope = storage.values.get(`justgo:v1:${account.userId}:journal`)!;
    const encodedBytes = Buffer.byteLength(envelope);
    const serializedAt = performance.now();
    JSON.stringify(repo.store.getState().journal);
    const serializationMs = performance.now() - serializedAt;
    expect(Object.keys(repo.store.getState().journal.records)).toHaveLength(10);
    expect(await repo.listJournalEntries()).toHaveLength(10);
    expect(envelope).not.toContain('x'.repeat(100));
    // Regression budgets for this representative fixture; not an eviction limit.
    expect(encodedBytes).toBeLessThan(400_000);
    expect(serializationMs).toBeLessThan(100);
    await testInfo.attach('journal-measurement', {
      body: JSON.stringify({
        submissions: 20,
        encodedBytes,
        serializationMs,
        totalSaveMs: performance.now() - started,
      }),
      contentType: 'application/json',
    });
    repo.setEnvironment({ active: true, online: true });
    await repo.synchronize();
    const count = await fixtureDatabase.query<{ count: string }>(
      'select count(*)::text as count from justgo.attempts where user_id=$1',
      [account.userId],
    );
    expect(count.rows[0]?.count).toBe('0');
  } finally {
    close();
  }
});
