import { createJourneyManagedAuth } from './journey-managed-auth';
import { uuid, deferred } from './journal';

const apiUrl = 'http://127.0.0.1:4311';
const origin = 'http://127.0.0.1:8091';
const response = (body: unknown, ok = true) =>
  ({ ok, url: apiUrl, json: async () => body }) as Response;
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
function provider() {
  let serial = 1;
  const subjects = new Map<
    string,
    { authUserId: string; providers: Set<'apple' | 'google'> }
  >();
  const sessions = new Map<
    string,
    {
      subjectHandle: string;
      session: {
        authUserId: string;
        accessToken: string;
        expiresAt: string;
        linkedProviders: ('apple' | 'google')[];
      };
    }
  >();
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (url, options) => {
      if (!String(url).startsWith(`${apiUrl}/__fixtures/`))
        throw new Error('Unexpected provider fixture destination');
      const body = JSON.parse(String(options?.body));
      if (String(url).endsWith('provider-sessions')) {
        const handle =
          body.subjectHandle ?? serial.toString(16).padStart(32, '0');
        if (body.subjectHandle && !subjects.has(handle))
          return response({ error: 'Unknown allocated subject' }, false);
        let subject = subjects.get(handle);
        if (!subject) {
          subject = { authUserId: uuid(serial++), providers: new Set() };
          subjects.set(handle, subject);
        }
        subject.providers.add(body.provider);
        const session = {
          authUserId: subject.authUserId,
          accessToken: `fixture.${String(serial++).padStart(30, '0')}.signature`,
          expiresAt: '2030-01-01T00:00:00.000Z',
          linkedProviders: [...subject.providers],
        };
        const result = { subjectHandle: handle, session };
        sessions.set(session.accessToken, result);
        return response(result);
      }
      if (
        String(url).endsWith('provider-links') ||
        String(url).endsWith('provider-unlinks')
      ) {
        const old = sessions.get(body.accessToken);
        if (!old)
          return response({ error: 'Unknown allocated session' }, false);
        const subject = subjects.get(old.subjectHandle)!;
        if (String(url).endsWith('provider-unlinks')) {
          if (subject.providers.size < 2)
            return response({ error: 'Last provider' }, false);
          subject.providers.delete(body.provider);
        } else subject.providers.add(body.provider);
        return response({
          subjectHandle: old.subjectHandle,
          session: { ...old.session, linkedProviders: [...subject.providers] },
        });
      }
      if (String(url).endsWith('provider-sign-outs'))
        return response({ ok: true });
      throw new Error('Unsupported fixture endpoint');
    },
  );
  return { fetcher, subjects };
}
const options = () => ({
  apiUrl,
  origin,
  fixtureEnabled: true,
  production: false,
  storage: storage(),
  now: () => Date.parse('2026-10-20T12:00:00.000Z'),
});

it.each([
  { fixtureEnabled: false },
  { production: true },
  { apiUrl: 'https://hosted.example' },
  { apiUrl: 'http://localhost:4311' },
  { apiUrl: `${apiUrl}/unexpected` },
  { apiUrl: `${apiUrl}?target=hosted` },
  { origin: 'https://hosted.example' },
  { origin: 'file:///tmp/test' },
])('rejects an unguarded or non-loopback provider fixture (%#)', (patch) => {
  const fetcher = jest.fn();
  expect(() =>
    createJourneyManagedAuth({ ...options(), ...patch, fetcher }),
  ).toThrow('CONFIGURATION');
  expect(fetcher).not.toHaveBeenCalled();
});

it('starts guest without a provider request and persists only a run-allocated session after explicit sign-in', async () => {
  const base = options();
  const remote = provider();
  const { auth } = createJourneyManagedAuth({
    ...base,
    fetcher: remote.fetcher,
  });
  await expect(auth.initialize()).resolves.toBeNull();
  expect(remote.fetcher).not.toHaveBeenCalled();
  const signed = await auth.signIn('apple');
  expect(signed).toMatchObject({
    authUserId: uuid(1),
    linkedProviders: ['apple'],
  });
  const [, request] = remote.fetcher.mock.calls[0]!;
  expect(JSON.parse(String(request?.body))).toEqual({ provider: 'apple' });
  expect(request).toMatchObject({
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
  });
  const returning = createJourneyManagedAuth({
    ...base,
    fetcher: remote.fetcher,
  });
  await expect(returning.auth.initialize()).resolves.toEqual(signed);
  expect(remote.fetcher).toHaveBeenCalledTimes(1);
  auth.dispose();
  returning.auth.dispose();
});

it('retains the allocated handle after sign-out and supports the same account from a second context', async () => {
  const base = options();
  const remote = provider();
  const first = createJourneyManagedAuth({ ...base, fetcher: remote.fetcher });
  const original = await first.auth.signIn('google');
  const handle = [...remote.subjects.keys()][0]!;
  await first.auth.signOut();
  const returning = await first.auth.signIn('google');
  expect(returning).toMatchObject({
    authUserId: (original as { authUserId: string }).authUserId,
  });
  expect(returning).not.toEqual(original);
  const second = createJourneyManagedAuth({
    ...options(),
    fetcher: remote.fetcher,
  });
  second.control.selectSubject(handle);
  await expect(second.auth.signIn('google')).resolves.toMatchObject({
    authUserId: (original as { authUserId: string }).authUserId,
  });
  first.auth.dispose();
  second.auth.dispose();
});

it('refuses arbitrary ownership claims and forces a fresh allocated principal on null selection', async () => {
  const remote = provider();
  const fixture = createJourneyManagedAuth({
    ...options(),
    fetcher: remote.fetcher,
  });
  expect(() => fixture.control.selectSubject(uuid(40))).toThrow(
    'CONFIGURATION',
  );
  fixture.control.selectSubject('f'.repeat(32));
  await expect(fixture.auth.signIn('apple')).rejects.toMatchObject({
    code: 'AUTH',
  });
  fixture.control.selectSubject(null);
  const first = await fixture.auth.signIn('apple');
  fixture.control.selectSubject(null);
  const second = await fixture.auth.signIn('apple');
  expect(second).not.toMatchObject({
    authUserId: (first as { authUserId: string }).authUserId,
  });
  fixture.auth.dispose();
});

it('links another provider without fabricating a new registered session', async () => {
  const remote = provider();
  const { auth } = createJourneyManagedAuth({
    ...options(),
    fetcher: remote.fetcher,
  });
  const signed = await auth.signIn('apple');
  await expect(auth.linkIdentity('google')).resolves.toMatchObject({
    ...(signed as object),
    linkedProviders: ['apple', 'google'],
  });
  const [url, request] = remote.fetcher.mock.calls[1]!;
  expect(String(url)).toBe(`${apiUrl}/__fixtures/provider-links`);
  expect(JSON.parse(String(request?.body))).toEqual({
    accessToken: (signed as { accessToken: string }).accessToken,
    provider: 'google',
  });
  auth.dispose();
});

it('unlinks a connected provider while preserving the registered subject and session', async () => {
  const remote = provider();
  const base = options();
  const { auth } = createJourneyManagedAuth({
    ...base,
    fetcher: remote.fetcher,
  });
  const signed = await auth.signIn('apple');
  await expect(auth.unlinkIdentity('apple')).rejects.toMatchObject({
    code: 'LAST_PROVIDER',
  });
  expect(remote.fetcher).toHaveBeenCalledTimes(1);
  await auth.linkIdentity('google');
  await expect(auth.unlinkIdentity('apple')).resolves.toMatchObject({
    ...(signed as object),
    linkedProviders: ['google'],
  });
  expect(String(remote.fetcher.mock.calls[2]?.[0])).toBe(
    `${apiUrl}/__fixtures/provider-unlinks`,
  );
  await expect(auth.unlinkIdentity('apple')).resolves.toMatchObject({
    linkedProviders: ['google'],
  });
  expect(remote.fetcher).toHaveBeenCalledTimes(3);
  const reloaded = createJourneyManagedAuth({
    ...base,
    fetcher: remote.fetcher,
  });
  await expect(reloaded.auth.initialize()).resolves.toMatchObject({
    linkedProviders: ['google'],
  });
  auth.dispose();
  reloaded.auth.dispose();
});

it('rejects an unlink response changing the subject or retaining the requested method', async () => {
  const remote = provider();
  const { auth } = createJourneyManagedAuth({
    ...options(),
    fetcher: remote.fetcher,
  });
  const original = await auth.signIn('apple');
  const linked = await auth.linkIdentity('google');
  const handle = [...remote.subjects.keys()][0]!;
  remote.fetcher.mockResolvedValueOnce(
    response({
      subjectHandle: handle,
      session: {
        ...(original as object),
        authUserId: uuid(99),
        linkedProviders: ['google'],
      },
    }),
  );
  await expect(auth.unlinkIdentity('apple')).rejects.toMatchObject({
    code: 'AUTH',
  });
  remote.fetcher.mockResolvedValueOnce(
    response({ subjectHandle: handle, session: linked }),
  );
  await expect(auth.unlinkIdentity('apple')).rejects.toMatchObject({
    code: 'AUTH',
  });
  await expect(auth.initialize()).resolves.toEqual(linked);
  auth.dispose();
});

it('never restores a signed-out fixture session from a delayed unlink response', async () => {
  const remote = provider();
  const { auth } = createJourneyManagedAuth({
    ...options(),
    fetcher: remote.fetcher,
  });
  await auth.signIn('apple');
  const linked = await auth.linkIdentity('google');
  const pending = deferred<Response>();
  const requested = deferred<void>();
  remote.fetcher.mockImplementationOnce(() => {
    requested.resolve();
    return pending.promise;
  });
  const unlinking = auth.unlinkIdentity('apple');
  await requested.promise;
  await auth.signOut();
  pending.resolve(
    response({
      subjectHandle: [...remote.subjects.keys()][0]!,
      session: { ...(linked as object), linkedProviders: ['google'] },
    }),
  );
  await expect(unlinking).rejects.toMatchObject({ code: 'CANCELLED' });
  await expect(auth.initialize()).resolves.toBeNull();
  auth.dispose();
});

it('sanitizes network/corrupt-provider errors and cancels an in-flight operation on disposal', async () => {
  const bad = createJourneyManagedAuth({
    ...options(),
    fetcher: jest.fn(async () => response({ unexpected: 'synthetic' })),
  });
  await expect(bad.auth.signIn('apple')).rejects.toMatchObject({
    code: 'AUTH',
  });
  bad.auth.dispose();
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    (_url, request) =>
      new Promise((_resolve, reject) =>
        request?.signal?.addEventListener(
          'abort',
          () => reject(new Error('Synthetic cancellation')),
          { once: true },
        ),
      ),
  );
  const pending = createJourneyManagedAuth({ ...options(), fetcher });
  const signing = pending.auth.signIn('google');
  pending.auth.dispose();
  await expect(signing).rejects.toMatchObject({ code: 'CANCELLED' });
});

it('fences a provider response body that finishes after disposal before storing any session', async () => {
  const base = options();
  const body = deferred<unknown>();
  const reading = deferred<void>();
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      ({
        ok: true,
        url: apiUrl,
        json: () => {
          reading.resolve();
          return body.promise;
        },
      }) as Response,
  );
  const fixture = createJourneyManagedAuth({ ...base, fetcher });
  const signing = fixture.auth.signIn('apple');
  await reading.promise;
  fixture.auth.dispose();
  body.resolve({
    subjectHandle: 'a'.repeat(32),
    session: {
      authUserId: uuid(1),
      accessToken: 'synthetic-fixture-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
      linkedProviders: ['apple'],
    },
  });
  await expect(signing).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(base.storage.values.size).toBe(0);
});
