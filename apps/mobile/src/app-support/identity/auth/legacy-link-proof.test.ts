import { legacyLinkProof } from './legacy-link-proof';
import { createMemoryVault, type DeviceState } from '../storage';
import type { IdentityApi } from '../api';
import { ApiError } from '../../../lib/network/http';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '10000000-0000-4000-8000-000000000009',
  getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
}));
const owner = '10000000-0000-4000-8000-000000000001';
const deviceId = '10000000-0000-4000-8000-000000000002';
const credentialId = '10000000-0000-4000-8000-000000000003';
const info = {
  userId: owner,
  deviceId,
  sessionId: '10000000-0000-4000-8000-000000000004',
  expiresAt: '2030-01-01T00:00:00.000Z',
};
async function setup() {
  const vault = createMemoryVault();
  const initial: DeviceState = {
    deviceId,
    selectedId: credentialId,
    session: { token: 'a'.repeat(64), info },
    pending: null,
    savedKey: null,
    registration: null,
  };
  await vault.write(initial);
  await vault.add({ id: credentialId, secret: 'b'.repeat(64) });
  const requests: {
    method: string;
    path: string;
    body: unknown;
    token: string | undefined;
  }[] = [];
  let getError: ApiError | null = null;
  let postError: ApiError | null = null;
  let current = info;
  const api: IdentityApi = {
    request: async (method, path, schema, body, token) => {
      requests.push({ method, path, body, token });
      if (method === 'GET') {
        if (getError) throw getError;
        return schema.parse(current);
      }
      if (postError) {
        const error = postError;
        postError = null;
        throw error;
      }
      const proposal = body as { deviceId: string; sessionId: string };
      return schema.parse({
        ...info,
        deviceId: proposal.deviceId,
        sessionId: proposal.sessionId,
      });
    },
  };
  return {
    vault,
    api,
    requests,
    setGetError: (error: ApiError) => {
      getError = error;
    },
    setPostError: (error: ApiError) => {
      postError = error;
    },
    setCurrent: (value: typeof info) => {
      current = value;
    },
  };
}
it('uses only the selected owner’s current valid proof without credential administration', async () => {
  const ctx = await setup();
  await expect(
    legacyLinkProof(ctx.vault, ctx.api, owner, new AbortController().signal),
  ).resolves.toBe('a'.repeat(64));
  expect(ctx.requests).toEqual([
    {
      method: 'GET',
      path: '/sessions/current',
      body: undefined,
      token: 'a'.repeat(64),
    },
  ]);
  expect((await ctx.vault.read())?.pending).toBeNull();
});
it('recovers an expired proof with a durable identical proposal after an uncertain response', async () => {
  const ctx = await setup();
  ctx.setGetError(new ApiError('SESSION_EXPIRED'));
  ctx.setPostError(new ApiError('NETWORK'));
  await expect(
    legacyLinkProof(ctx.vault, ctx.api, owner, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'NETWORK' });
  expect((await ctx.vault.read())?.pending?.kind).toBe('recover');
  await expect(
    legacyLinkProof(ctx.vault, ctx.api, owner, new AbortController().signal),
  ).resolves.toBe('07'.repeat(32));
  const posts = ctx.requests.filter((request) => request.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  expect(posts[0]).toMatchObject({
    path: '/sessions',
    body: { kind: 'recovery', credential: 'b'.repeat(64), deviceId },
    token: undefined,
  });
  expect(
    ctx.requests.filter((request) => request.method === 'GET'),
  ).toHaveLength(1);
  expect((await ctx.vault.read())?.pending).toBeNull();
});
it('renews a near-expiry session and rejects a mismatched owner before any write', async () => {
  const ctx = await setup();
  ctx.setCurrent({
    ...info,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await legacyLinkProof(
    ctx.vault,
    ctx.api,
    owner,
    new AbortController().signal,
  );
  expect(ctx.requests[1]).toMatchObject({
    method: 'POST',
    path: '/sessions',
    body: { kind: 'renewal', deviceId },
    token: 'a'.repeat(64),
  });
  const mismatch = await setup();
  mismatch.setCurrent({
    ...info,
    userId: '10000000-0000-4000-8000-000000000099',
  });
  await expect(
    legacyLinkProof(
      mismatch.vault,
      mismatch.api,
      owner,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(mismatch.requests).toHaveLength(1);
  expect((await mismatch.vault.read())?.session?.token).toBe('a'.repeat(64));
});
