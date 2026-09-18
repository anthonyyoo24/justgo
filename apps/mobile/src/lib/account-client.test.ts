import { okSchema } from '@justgo/contracts';
import {
  AccountClient,
  accountKey,
  createQueryClient,
  stableAction,
} from './account-client';
import { ApiError, createHttpClient } from './http';

const clients: AccountClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.changeAccount(null);
    client.queries.clear();
  });
});
function setup(fetcher: jest.Mock) {
  let session = { userId: 'owner-a', token: 'old-token' };
  const renew = jest.fn(async () => {
    session = { ...session, token: 'new-token' };
    return session;
  });
  const reject = jest.fn();
  const client = new AccountClient(
    createHttpClient('http://localhost:3000', fetcher),
    { current: () => session, renew, reject },
  );
  client.queries.setDefaultOptions({
    queries: { retry: false, gcTime: Infinity },
  });
  clients.push(client);
  client.changeAccount(session.userId);
  return {
    client,
    renew,
    reject,
    switchAccount: () => {
      session = { userId: 'owner-b', token: 'other-token' };
      client.changeAccount(session.userId);
    },
  };
}
const ok = () => ({ ok: true, json: async () => ({ ok: true }) });
const failure = (code: string) => ({
  ok: false,
  json: async () => ({ code, requestId: 'safe-id' }),
});
it('coordinates concurrent expired-session recovery and replays each read once', async () => {
  const fetcher = jest.fn(async (_url, init) =>
    init.headers.authorization === 'Bearer old-token'
      ? failure('SESSION_EXPIRED')
      : ok(),
  );
  const { client, renew } = setup(fetcher);
  await expect(
    Promise.all([
      client.request('/v1/test', okSchema),
      client.request('/v1/test', okSchema),
    ]),
  ).resolves.toEqual([{ ok: true }, { ok: true }]);
  expect(renew).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('uses an already-rotated token for a delayed old-session rejection without revoking the current session', async () => {
  let finishLate!: (response: ReturnType<typeof failure>) => void;
  let oldRequests = 0;
  const fetcher = jest.fn(async (_url, init) => {
    if (init.headers.authorization !== 'Bearer old-token') return ok();
    if (++oldRequests === 1)
      return new Promise((resolve) => {
        finishLate = resolve;
      });
    return failure('SESSION_EXPIRED');
  });
  const { client, renew, reject } = setup(fetcher);
  const late = client.request('/v1/test', okSchema);
  await client.request('/v1/test', okSchema);
  finishLate(failure('SESSION_REVOKED'));
  await expect(late).resolves.toEqual({ ok: true });
  expect(renew).toHaveBeenCalledTimes(1);
  expect(reject).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('does not recursively recover or retry a failed recovery', async () => {
  const fetcher = jest.fn().mockResolvedValue(failure('SESSION_EXPIRED'));
  const { client, renew } = setup(fetcher);
  await expect(client.request('/v1/test', okSchema)).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  expect(renew).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(['UNAUTHORIZED', 'SESSION_REVOKED'])(
  'clears rejected session %s without silent recovery',
  async (code) => {
    const fetcher = jest.fn().mockResolvedValue(failure(code));
    const { client, renew, reject } = setup(fetcher);
    await expect(client.request('/v1/test', okSchema)).rejects.toMatchObject({
      code,
    });
    expect(renew).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith('old-token', code);
  },
);
it.each(['RATE_LIMITED', 'CONFLICT', 'INVALID_REQUEST'])(
  'never retries %s',
  async (code) => {
    const fetcher = jest.fn().mockResolvedValue(failure(code));
    const { client } = setup(fetcher);
    await expect(client.request('/v1/test', okSchema)).rejects.toMatchObject({
      code,
      requestId: 'safe-id',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it('retries a transient read only once and disables nested query/mutation retries', async () => {
  const fetcher = jest
    .fn()
    .mockRejectedValue(new Error('private transport details'));
  const { client } = setup(fetcher);
  await expect(client.request('/v1/test', okSchema)).rejects.toMatchObject({
    message: 'NETWORK',
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(createQueryClient().getDefaultOptions()).toMatchObject({
    queries: { retry: false },
    mutations: { retry: false },
  });
});
it('retains action IDs and input after an uncertain write; no implicit write retry', async () => {
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValue(ok());
  const { client } = setup(fetcher);
  const input = { answer: 'original' };
  const action = stableAction('stable-id', input);
  input.answer = 'changed';
  await expect(
    client.request('/v1/test', okSchema, { body: action }),
  ).rejects.toBeInstanceOf(ApiError);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await client.request('/v1/test', okSchema, { body: action });
  expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body);
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
    answer: 'original',
    actionId: 'stable-id',
  });
});
it('cancels and clears account data immediately; late responses cannot populate the next account', async () => {
  let resolve!: (value: ReturnType<typeof ok>) => void;
  const fetcher = jest.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { client, switchAccount } = setup(fetcher);
  client.queries.setQueryData(accountKey('owner-a', 'history'), ['private']);
  const pending = client.queries.fetchQuery({
    queryKey: accountKey('owner-a', 'test'),
    queryFn: ({ signal }) => client.request('/v1/test', okSchema, { signal }),
  });
  const assertion = expect(pending).rejects.toBeDefined();
  switchAccount();
  resolve(ok());
  await assertion;
  expect(client.queries.getQueryCache().getAll()).toHaveLength(0);
});
it('returns ACCOUNT_CHANGED even when transport ignores abort', async () => {
  const fetcher = jest.fn(() => new Promise(() => {}));
  const { client, switchAccount } = setup(fetcher);
  const pending = client.request('/v1/test', okSchema);
  const assertion = expect(pending).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
  switchAccount();
  await assertion;
});
it('bounds the full request including body parsing and an unresponsive renewal', async () => {
  jest.useFakeTimers();
  try {
    const fetcher = jest
      .fn()
      .mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
    const { client } = setup(fetcher);
    const pending = client.request('/v1/test', okSchema, { timeoutMs: 100 });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(101);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
it('propagates cancellation without replay', async () => {
  const fetcher = jest.fn(() => new Promise(() => {}));
  const { client } = setup(fetcher);
  const controller = new AbortController();
  const pending = client.request('/v1/test', okSchema, {
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toMatchObject({
    code: 'CANCELLED',
  });
  controller.abort();
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('bounds a renewal that never finishes and never replays after timeout', async () => {
  jest.useFakeTimers();
  try {
    const fetcher = jest.fn().mockResolvedValue(failure('SESSION_EXPIRED'));
    const { client, renew } = setup(fetcher);
    renew.mockImplementation(() => new Promise(() => {}));
    const pending = client.request('/v1/test', okSchema, { timeoutMs: 100 });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(101);
    await assertion;
    expect(renew).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('releases a stalled shared renewal and ignores its late result during a fresh renewal', async () => {
  jest.useFakeTimers();
  try {
    const fetcher = jest.fn(async (_url, init) =>
      init.headers.authorization === 'Bearer old-token'
        ? failure('SESSION_EXPIRED')
        : ok(),
    );
    const { client, renew } = setup(fetcher);
    let finishOld!: (session: { userId: string; token: string }) => void;
    let finishNew!: (session: { userId: string; token: string }) => void;
    renew.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    renew.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNew = resolve;
        }),
    );
    const first = expect(
      client.request('/v1/test', okSchema),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    await jest.advanceTimersByTimeAsync(10_001);
    await first;
    const second = client.request('/v1/test', okSchema);
    await jest.advanceTimersByTimeAsync(0);
    finishOld({ userId: 'owner-a', token: 'obsolete-token' });
    await jest.advanceTimersByTimeAsync(0);
    const third = client.request('/v1/test', okSchema);
    await jest.advanceTimersByTimeAsync(0);
    expect(renew).toHaveBeenCalledTimes(2);
    finishNew({ userId: 'owner-a', token: 'new-token' });
    await expect(Promise.all([second, third])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(
      fetcher.mock.calls.some(
        ([, init]) => init.headers.authorization === 'Bearer obsolete-token',
      ),
    ).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

it('keeps shared renewal alive when one waiter reaches its shorter deadline', async () => {
  jest.useFakeTimers();
  try {
    const fetcher = jest.fn(async (_url, init) =>
      init.headers.authorization === 'Bearer old-token'
        ? failure('SESSION_EXPIRED')
        : ok(),
    );
    const { client, renew } = setup(fetcher);
    let finish!: (session: { userId: string; token: string }) => void;
    renew.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const short = expect(
      client.request('/v1/test', okSchema, { timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    const long = client.request('/v1/test', okSchema);
    await jest.advanceTimersByTimeAsync(101);
    await short;
    finish({ userId: 'owner-a', token: 'new-token' });
    await expect(long).resolves.toEqual({ ok: true });
    expect(renew).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
