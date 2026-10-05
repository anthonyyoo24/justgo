import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  catalogSchema,
  sessionResponseSchema,
  patchAttemptResponseSchema,
} from '@justgo/contracts';
import { test, expect } from './fixtures';
import { journeyApiUrl } from './environment';
import type { JournalClock } from '../apps/mobile/src/features/journal/model';

// Node repository tests use the same loopback-only development transport guard.
Object.defineProperty(globalThis, '__DEV__', {
  value: true,
  configurable: true,
});

const {
  AccountRepository,
  createJournalTransport,
  AccountClient,
  createHttpClient,
  MemoryStorage,
} = (await import(
  new URL('../.local/journey-repository.mjs', import.meta.url).href
)) as typeof import('./journal-entry');
type MemoryStorage = InstanceType<typeof MemoryStorage>;

// Failure controls stay in the runner, never in the deployable app/API. The
// repository consumes its real account transport against loopback fixtures.
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
function repository(
  accountId: string,
  token: string,
  storage: MemoryStorage,
  fetcher: typeof fetch = fetch,
  clock?: JournalClock,
) {
  const client = new AccountClient(createHttpClient(journeyApiUrl, fetcher), {
    current: () => ({ userId: accountId, token }),
    renew: async () => {
      throw new Error('Unexpected fixture renewal');
    },
    reject: () => {},
  });
  client.changeAccount(accountId);
  const repo = new AccountRepository({
    accountId,
    storage,
    transport: createJournalTransport(client, accountId),
    today: new Date().toISOString().slice(0, 10),
    timeZone: 'UTC',
    random: () => 0.5,
    ...(clock ? { clock } : {}),
  });
  return {
    repo,
    close: () => {
      repo.dispose();
      client.changeAccount(null);
    },
  };
}

test('offline journal replays a lost acknowledgement through the real transport once', async ({
  fixtureDatabase,
}) => {
  const { token, account, card } = await fixtureAccount();
  const storage = new MemoryStorage();
  let drop = true;
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (options?.method === 'POST' && String(url).endsWith('/v1/attempts')) {
      calls++;
      if (drop) {
        drop = false;
        throw new Error('Synthetic lost response after commit');
      }
    }
    return response;
  };
  const { repo, close } = repository(account.userId, token, storage, fetcher);
  try {
    repo.setEnvironment({ active: true, online: false });
    await repo.hydrate();
    await repo.cacheCatalog({ cards: [card] });
    const completion = {
      id: randomUUID(),
      challengeId: card.challengeId,
      venue: card.venue,
      startedAt: new Date().toISOString(),
      startTimeZone: 'UTC',
    };
    const submissionId = randomUUID();
    await repo.complete(completion, card);
    await repo.submitReflection(completion.id, submissionId, {
      feeling: 'a_little_better',
      text: 'Disposable synchronization fixture.',
    });
    expect(repo.store.getState().journal.operations).toHaveLength(2);
    expect(calls).toBe(0);
    repo.setEnvironment({ active: true, online: true });
    await repo.synchronize();
    expect(repo.store.getState().journal.operations[0]?.code).toBe('NETWORK');
    const existing = await fixtureDatabase.query<{ count: string }>(
      'select count(*)::text as count from justgo.attempts where user_id=$1',
      [account.userId],
    );
    expect(existing.rows[0]?.count).toBe('1');
    // Restart before the retry; the immutable intent and cooldown survive.
    close();
    const resumed = repository(account.userId, token, storage, fetcher);
    try {
      resumed.repo.setEnvironment({ active: true, online: false });
      await resumed.repo.hydrate();
      expect(resumed.repo.getAttempt(completion.id)?.reflection?.text).toBe(
        'Disposable synchronization fixture.',
      );
      resumed.repo.setEnvironment({ active: true, online: true });
      await expect
        .poll(async () => {
          await resumed.repo.synchronize();
          return resumed.repo.store.getState().journal.operations.length;
        })
        .toBe(0);
      const rows = await fixtureDatabase.query<{
        id: string;
        reflection_revision: number;
        reflection_text: string;
      }>(
        'select id,reflection_revision,reflection_text from justgo.attempts where user_id=$1',
        [account.userId],
      );
      expect(rows.rows).toEqual([
        {
          id: completion.id,
          reflection_revision: 1,
          reflection_text: 'Disposable synchronization fixture.',
        },
      ]);
      expect(calls).toBe(2);
    } finally {
      resumed.close();
    }
  } finally {
    close();
  }
});

test('failed device writes use ordered cloud fallback and typed backend-wins reflection recovery', async ({
  fixtureDatabase,
}) => {
  const { token, account, card } = await fixtureAccount();
  const storage = new MemoryStorage();
  storage.fail = true;
  const { repo, close } = repository(account.userId, token, storage);
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
    await repo.submitReflection(completion.id, randomUUID(), {
      text: 'Initial fixture.',
    });
    expect(repo.store.getState().warning).toBeNull();
    expect(
      repo.store.getState().journal.records[completion.id]?.phoneVersion,
    ).toBe(0);
    const changed = await fetch(
      `${journeyApiUrl}/v1/attempts/${completion.id}`,
      {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          submissionId: randomUUID(),
          expectedReflectionRevision: 1,
          reflection: { text: 'Authoritative backend fixture.' },
        }),
      },
    );
    if (!changed.ok) throw new Error('Fixture canonical patch failed');
    const canonical = patchAttemptResponseSchema.parse(await changed.json());
    await repo.submitReflection(completion.id, randomUUID(), {
      text: 'Stale local fixture.',
    });
    expect(repo.getAttempt(completion.id)?.reflection).toEqual(
      canonical.attempt.reflection,
    );
    expect(repo.store.getState().warning).toBeNull();
    storage.fail = false;
    // An explicit new save also recovers all retained journal versions/receipts.
    await repo.submitReflection(completion.id, randomUUID(), {
      text: 'New explicit fixture.',
    });
    await repo.synchronize();
    expect(repo.store.getState().journal.operations).toHaveLength(0);
    const rows = await fixtureDatabase.query<{
      reflection_revision: number;
      reflection_text: string;
    }>(
      'select reflection_revision,reflection_text from justgo.attempts where user_id=$1 and id=$2',
      [account.userId, completion.id],
    );
    expect(rows.rows).toEqual([
      { reflection_revision: 3, reflection_text: 'New explicit fixture.' },
    ]);
  } finally {
    close();
  }
});

test('ten long offline submissions persist and recover with measured serialization bounds', async ({
  fixtureDatabase,
}, testInfo) => {
  const { token, account, card } = await fixtureAccount();
  const storage = new MemoryStorage();
  const { repo, close } = repository(account.userId, token, storage);
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
    expect(repo.store.getState().journal.operations).toHaveLength(20);
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
    expect(count.rows[0]?.count).toBe('10');
    expect(repo.store.getState().journal.operations).toHaveLength(0);
  } finally {
    close();
  }
});
