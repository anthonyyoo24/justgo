import { AccountClient } from '../../../lib/network/account-client';
import { createHttpClient } from '../../../lib/network/http';
import { createJournalTransport } from './transport';
import {
  attempt,
  input,
  owner,
  otherOwner,
  uuid,
} from '../../../../test-support/journal';

const completion = () => ({ ...attempt(), reflection: undefined });
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

it('sends strict completion metadata, coordinates renewal and retires private writes without HTTP', async () => {
  let session = { userId: owner, token: 'old' };
  const renew = jest.fn(
    async () => (session = { ...session, token: 'renewed' }),
  );
  const fetcher = jest.fn(async (_url, init) => {
    if (init.headers.authorization === 'Bearer old')
      return json({ code: 'SESSION_EXPIRED', requestId: 'fixture' }, 401);
    return json({ attempt: completion() });
  });
  const client = new AccountClient(
    createHttpClient('https://api.example.test', fetcher),
    {
      current: () => session,
      renew,
      reject: jest.fn(),
    },
  );
  client.changeAccount(owner);
  try {
    const transport = createJournalTransport(client, owner);
    const signal = new AbortController().signal;
    expect(
      await Promise.all([
        transport.create(input(), signal),
        transport.create(input(), signal),
      ]),
    ).toEqual([attempt(), attempt()]);
    expect(renew).toHaveBeenCalledTimes(1);
    for (const [, init] of fetcher.mock.calls) {
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual(input());
      expect(init.body).not.toContain('reflection');
    }
    const count = fetcher.mock.calls.length;
    await expect(
      transport.patch(
        uuid(1),
        {
          submissionId: uuid(101),
          expectedReflectionRevision: 0,
          reflection: { text: 'Private fixture' },
        },
        signal,
      ),
    ).rejects.toMatchObject({ code: 'PRIVATE_JOURNAL_LOCAL' });
    await expect(
      transport.create(
        { ...input(), reflection: { text: 'Private fixture' } } as ReturnType<
          typeof input
        >,
        signal,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetcher).toHaveBeenCalledTimes(count);
    session = { userId: otherOwner, token: 'other' };
    client.changeAccount(otherOwner);
    await expect(transport.create(input(), signal)).rejects.toMatchObject({
      code: 'ACCOUNT_CHANGED',
    });
    await expect(
      transport.patch(
        uuid(1),
        {
          submissionId: uuid(101),
          expectedReflectionRevision: 0,
          reflection: { text: 'Private fixture' },
        },
        signal,
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(fetcher).toHaveBeenCalledTimes(count);
  } finally {
    client.changeAccount(null);
  }
});

it('rejects private completion responses and exposes no cloud journal download', async () => {
  const response: unknown = { attempt: attempt() };
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => json(response),
  );
  const client = new AccountClient(
    createHttpClient('https://api.example.test', fetcher),
    {
      current: () => ({ userId: owner, token: 'session' }),
      renew: jest.fn(),
      reject: jest.fn(),
    },
  );
  client.changeAccount(owner);
  try {
    const transport = createJournalTransport(client, owner),
      signal = new AbortController().signal;
    await expect(transport.create(input(), signal)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(transport).not.toHaveProperty('legacy');
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    client.changeAccount(null);
  }
});
