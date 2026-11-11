import { drizzle } from 'drizzle-orm/node-postgres';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import { ownerTransactions } from '../../src/db/owner-transaction.js';
import { outboundFetch } from '../../src/http/outbound-fetch.js';

function setup() {
  const database = drizzle.mock();
  vi.spyOn(database, 'transaction').mockImplementation(async (work) => {
    await delay(1);
    return work({} as Parameters<typeof work>[0]);
  });
  const transport = vi.fn(async () => new Response('sent'));
  return {
    db: ownerTransactions(database),
    send: () => outboundFetch(transport)('https://provider.invalid/'),
    transport,
  };
}

it('refuses provider I/O while the transaction is open, across timers', async () => {
  const { db, send, transport } = setup();
  await db.transaction(async () => {
    await expect(send()).rejects.toThrow('inside an owner transaction');
    await delay(1);
    await expect(send()).rejects.toThrow('inside an owner transaction');
  });
  expect(transport).not.toHaveBeenCalled();
});

it('sends once the transaction returns', async () => {
  const { db, send, transport } = setup();
  await db.transaction(async () => {});
  await expect(send()).resolves.toBeInstanceOf(Response);
  expect(transport).toHaveBeenCalledTimes(1);
});

it('sends work deferred from inside the transaction once it commits', async () => {
  const { db, send, transport } = setup();
  let deferred: Promise<Response> | undefined;
  await db.transaction(async () => {
    deferred = delay(5).then(send);
  });
  await expect(deferred).resolves.toBeInstanceOf(Response);
  expect(transport).toHaveBeenCalledTimes(1);
});
