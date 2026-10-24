import type { AccessResponse } from '@justgo/contracts';
import {
  approvalExpiresAt,
  createBetaApproval,
  hasBetaApproval,
  readBetaApproval,
  serverClockOffset,
  type AccessOwner,
} from './policy';

const now = Date.parse('2026-10-24T12:00:00.000Z');
const origin = 'https://api.beta.example';
const owner: AccessOwner = { id: 'synthetic-account', kind: 'account' };
const time = (offset: number) => new Date(now + offset).toISOString();
const beta = (
  checkedAt = 0,
  expiresAt = 3_600_000,
): Extract<AccessResponse, { status: 'verified' }> => ({
  status: 'verified',
  source: 'free_beta',
  checkedAt: time(checkedAt),
  expiresAt: time(expiresAt),
});
const approval = () => {
  const value = createBetaApproval(beta(), origin, owner, now);
  if (!value) throw new Error('Expected a fresh beta fixture');
  return value;
};

it('retains a fresh server beta approval beyond response freshness until its exact expiry', () => {
  const value = approval();
  expect(value).toEqual({
    version: 1,
    origin,
    owner,
    receivedAt: now,
    access: beta(),
  });
  expect(value.owner).not.toBe(owner);
  expect(hasBetaApproval(value, now + 60_000)).toBe(true);
  expect(hasBetaApproval(value, now + 3_599_999)).toBe(true);
  expect(approvalExpiresAt(value)).toBe(now + 3_600_000);
  expect(hasBetaApproval(value, now + 3_600_000)).toBe(false);
  expect(hasBetaApproval(value, now - 1)).toBe(false);
  expect(hasBetaApproval(null, now)).toBe(false);
});

it.each([1, 5_000])(
  'aligns an approved response %s ms ahead without extending its server expiry',
  (ahead) => {
    const access = beta(ahead, 60_000);
    const value = createBetaApproval(access, origin, owner, now);
    expect(value).not.toBeNull();
    expect(serverClockOffset(access, now)).toBe(ahead);
    expect(approvalExpiresAt(value!)).toBe(now + 60_000 - ahead);
    expect(hasBetaApproval(value, now)).toBe(true);
    expect(hasBetaApproval(value, now + 60_000 - ahead - 1)).toBe(true);
    expect(hasBetaApproval(value, now + 60_000 - ahead)).toBe(false);
  },
);

it('leaves absent, behind and unreasonably future server clocks unadjusted', () => {
  expect(serverClockOffset(undefined, now)).toBe(0);
  for (const offset of [-1, 0, 5_001])
    expect(serverClockOffset(beta(offset), now)).toBe(0);
});

it('accepts the last fresh millisecond but rejects stale, future and already expired responses', () => {
  expect(createBetaApproval(beta(-59_999), origin, owner, now)).not.toBeNull();
  for (const access of [beta(-60_000), beta(5_001), beta(0, 0), beta(0, -1)])
    expect(createBetaApproval(access, origin, owner, now)).toBeNull();
});

it.each(['unpaid', 'unavailable'] as const)(
  'cannot turn a %s response into an offline approval',
  (status) => {
    expect(
      createBetaApproval(
        { status, source: 'free_beta', checkedAt: time(0) },
        origin,
        owner,
        now,
      ),
    ).toBeNull();
  },
);

it('does not carry verified non-beta access into the offline beta window', () => {
  expect(
    createBetaApproval(
      { status: 'verified', checkedAt: time(0), expiresAt: time(60_000) },
      origin,
      owner,
      now,
    ),
  ).toBeNull();
});

it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects an invalid receipt clock %s',
  (receivedAt) => {
    expect(createBetaApproval(beta(), origin, owner, receivedAt)).toBeNull();
  },
);

it('hydrates only the same owner, access mode and API while the approved window remains open', () => {
  const value = approval();
  const raw = JSON.stringify(value);
  expect(readBetaApproval(raw, origin, owner, now + 60_000)).toEqual(value);
  expect(
    readBetaApproval(raw, origin, { ...owner, kind: 'guest' }, now),
  ).toBeNull();
  expect(
    readBetaApproval(raw, origin, { ...owner, id: 'another-owner' }, now),
  ).toBeNull();
  expect(
    readBetaApproval(raw, 'https://api.other.example', owner, now),
  ).toBeNull();
  expect(readBetaApproval(raw, origin, owner, now - 1)).toBeNull();
  expect(readBetaApproval(raw, origin, owner, now + 3_600_000)).toBeNull();
});

it.each([null, '', '{', 'null', '[]', 'true', '42', '"approval"'])(
  'fails closed for absent or malformed cache bytes %s',
  (raw) => {
    expect(readBetaApproval(raw, origin, owner, now)).toBeNull();
  },
);

it.each([
  ['unknown version', { version: 2 }],
  ['wrong API', { origin: 'https://api.other.example' }],
  ['missing owner', { owner: null }],
  ['array owner', { owner: [] }],
  ['primitive owner', { owner: 'synthetic-account' }],
  ['wrong owner', { owner: { ...owner, id: 'another-owner' } }],
  ['wrong mode', { owner: { ...owner, kind: 'guest' } }],
  ['non-numeric receipt', { receivedAt: String(now) }],
  ['invalid receipt', { receivedAt: -1 }],
  ['missing response', { access: undefined }],
  ['invalid response shape', { access: { ...beta(), premium: true } }],
  ['unrecognized source', { access: { ...beta(), source: 'client_override' } }],
  ['non-beta response', { access: { ...beta(), source: undefined } }],
  ['stale original response', { access: beta(-60_000) }],
  ['future original response', { access: beta(5_001) }],
] as const)('rejects a cache with %s', (_label, patch) => {
  expect(
    readBetaApproval(
      JSON.stringify({ ...approval(), ...patch }),
      origin,
      owner,
      now,
    ),
  ).toBeNull();
});
