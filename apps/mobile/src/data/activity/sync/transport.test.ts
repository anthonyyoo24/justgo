import { AccountClient } from '../../../lib/account-client';
import { createHttpClient } from '../../../lib/http';
import { createJournalTransport } from './transport';
import {
  attempt,
  input,
  owner,
  otherOwner,
  uuid,
} from '../../../../test-support/journal';

it('uses canonical create/PATCH contracts, coordinates session renewal and fences the original owner', async () => {
  let session = { userId: owner, token: 'old' };
  const renew = jest.fn(
    async () => (session = { ...session, token: 'renewed' }),
  );
  const fetcher = jest.fn(async (_url, init) => {
    if (init.headers.authorization === 'Bearer old')
      return new Response(
        JSON.stringify({ code: 'SESSION_EXPIRED', requestId: 'fixture' }),
        { status: 401 },
      );
    const body = JSON.parse(init.body);
    return new Response(
      JSON.stringify(
        init.method === 'PATCH'
          ? {
              attempt: {
                ...attempt(),
                reflection: { feeling: null, text: 'Fixture', revision: 1 },
              },
              acknowledgement: {
                submissionId: body.submissionId,
                appliedRevision: 1,
              },
            }
          : { attempt: attempt() },
      ),
    );
  });
  const client = new AccountClient(
    createHttpClient('https://api.example.test', fetcher),
    { current: () => session, renew, reject: jest.fn() },
  );
  client.changeAccount(owner);
  try {
    const transport = createJournalTransport(client, owner);
    const controller = new AbortController();
    const results = await Promise.all([
      transport.create(input(), controller.signal),
      transport.create(input(), controller.signal),
    ]);
    expect(results).toEqual([attempt(), attempt()]);
    expect(renew).toHaveBeenCalledTimes(1);
    await transport.patch(
      uuid(1),
      {
        submissionId: uuid(101),
        expectedReflectionRevision: 0,
        reflection: { text: 'Fixture' },
      },
      controller.signal,
    );
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
      `https://api.example.test/v1/attempts/${uuid(1)}`,
    );
    expect(fetcher.mock.calls.at(-1)?.[1].method).toBe('PATCH');
    session = { userId: otherOwner, token: 'other' };
    client.changeAccount(otherOwner);
    const count = fetcher.mock.calls.length;
    await expect(
      transport.create(input(), controller.signal),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    await expect(
      transport.patch(
        uuid(1),
        {
          submissionId: uuid(101),
          expectedReflectionRevision: 0,
          reflection: { text: 'Fixture' },
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(fetcher).toHaveBeenCalledTimes(count);
  } finally {
    client.changeAccount(null);
  }
});
