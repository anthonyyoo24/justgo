import { drizzle } from 'drizzle-orm/node-postgres';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  appleRootFingerprints,
  createAppleSubscriptions,
  createAppleTransactions,
  verifySignedPayload,
} from '../../src/billing/apple.js';
import { ApiError } from '../../src/http/api-error.js';
import { ownerTransactions } from '../../src/db/owner-transaction.js';
import {
  createConnectKey,
  createTestChain,
  createTestStore,
  renewalPayload,
  testBilling,
  transactionPayload,
  type ChainOptions,
  type TestChain,
} from '../../scripts/apple-test-store.js';

// Apple Root CA - G3, public, from apple.com/certificateauthority.
const appleRootG3 = [
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS',
  'QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u',
  'IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN',
  'MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS',
  'b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y',
  'aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49',
  'AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf',
  'TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517',
  'IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr',
  'MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA',
  'MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4',
  'at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM',
  '6BgD56KyKA==',
].join('');
let chain: TestChain;
let connect: Awaited<ReturnType<typeof createConnectKey>>;
beforeAll(async () => {
  [chain, connect] = await Promise.all([createTestChain(), createConnectKey()]);
});
const config = () => ({ ...testBilling, privateKey: connect.pem });
function reader(
  payload: Record<string, unknown> = transactionPayload(),
  options: { forge?: boolean; chain?: TestChain; pinned?: string[] } = {},
) {
  const signer = options.chain ?? chain;
  const store = createTestStore(
    signer,
    connect.publicKey,
    new Map([['2000000000000001', payload]]),
    { forge: options.forge ?? false },
  );
  return {
    ...store,
    read: createAppleTransactions(config(), {
      transport: store.transport,
      rootFingerprints: options.pinned ?? [signer.rootFingerprint],
    }),
  };
}
const failure = (code: string, status: number) =>
  expect.objectContaining({ code, status });

describe('Apple transaction verification', () => {
  it('reads Get Transaction Info with a bundle-scoped ES256 bearer and returns the verified purchase', async () => {
    const now = Date.now();
    const { read, requests } = reader(
      transactionPayload({
        originalTransactionId: '1000000000000009',
        expiresDate: now + 3_600_000,
        appAccountToken: 'A1B2C3D4-0000-4000-8000-000000000001',
      }),
    );
    await expect(read('2000000000000001')).resolves.toEqual({
      transactionId: '2000000000000001',
      originalTransactionId: '1000000000000009',
      productId: 'app.justgo.monthly',
      environment: 'Sandbox',
      expiresAt: new Date(now + 3_600_000),
      revokedAt: null,
      appAccountToken: 'a1b2c3d4-0000-4000-8000-000000000001',
      signedAt: expect.any(Date),
      trial: false,
      // Get Transaction Info carries no renewal info.
      autoRenew: null,
    });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe(
      'https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/2000000000000001',
    );
    expect(request?.redirect).toBe('manual');
    expect(request?.header).toEqual({
      alg: 'ES256',
      kid: testBilling.keyId,
      typ: 'JWT',
    });
    const claims = request?.claims ?? {};
    expect(claims).toMatchObject({
      iss: testBilling.issuerId,
      aud: 'appstoreconnect-v1',
      bid: testBilling.bundleId,
    });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(300);
  });

  it('asks the production origin when production is configured', async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response('{}', { status: 404 }),
    );
    const read = createAppleTransactions(
      { ...config(), environment: 'Production' },
      { transport },
    );
    await expect(read('2000000000000001')).rejects.toEqual(
      failure('NOT_FOUND', 404),
    );
    expect(String(transport.mock.calls[0]?.[0])).toBe(
      'https://api.storekit.itunes.apple.com/inApps/v1/transactions/2000000000000001',
    );
  });

  it.each([
    [
      'an introductory free trial',
      { offerType: 1, offerDiscountType: 'FREE_TRIAL' },
      true,
    ],
    [
      'an offer-code free trial',
      { offerType: 3, offerDiscountType: 'FREE_TRIAL' },
      true,
    ],
    [
      'a paid introductory offer',
      { offerType: 1, offerDiscountType: 'PAY_AS_YOU_GO' },
      false,
    ],
    ['an introductory offer with no discount type', { offerType: 1 }, false],
    ['no offer', {}, false],
  ])('reads %s from the signed offer', async (_, offer, trial) => {
    const { read } = reader(transactionPayload(offer));
    await expect(read('2000000000000001')).resolves.toMatchObject({ trial });
  });

  it('reports a revocation and treats an empty app account token as none', async () => {
    const revokedAt = Date.now() - 1000;
    const { read } = reader(
      transactionPayload({ revocationDate: revokedAt, appAccountToken: '' }),
    );
    await expect(read('2000000000000001')).resolves.toMatchObject({
      revokedAt: new Date(revokedAt),
      appAccountToken: null,
    });
  });

  it.each([
    ['environment', { environment: 'Production' }],
    ['bundle', { bundleId: 'app.other' }],
    ['product type', { type: 'Consumable' }],
    ['transaction', { transactionId: '2000000000000002' }],
    ['app account token', { appAccountToken: 'not-a-uuid' }],
    ['expiry', { expiresDate: undefined }],
  ])(
    'refuses a signed transaction with the wrong %s',
    async (_name, overrides) => {
      const { read } = reader(transactionPayload(overrides));
      await expect(read('2000000000000001')).rejects.toEqual(
        failure('INVALID_REQUEST', 400),
      );
    },
  );

  it('refuses a forged signature and a root that is not pinned', async () => {
    await expect(
      reader(transactionPayload(), { forge: true }).read('2000000000000001'),
    ).rejects.toThrow('Apple signature rejected: SIGNATURE');
    await expect(
      reader(transactionPayload(), { pinned: appleRootFingerprints }).read(
        '2000000000000001',
      ),
    ).rejects.toThrow('Apple signature rejected: ROOT_NOT_PINNED');
  });

  it.each<[string, ChainOptions]>([
    ['LEAF_OID', { leafMarker: false }],
    ['INTERMEDIATE_OID', { intermediateMarker: false }],
    ['NOT_AUTHORITY', { intermediateAuthority: false }],
    [
      'VALIDITY',
      {
        notBefore: new Date('2020-01-01T00:00:00Z'),
        notAfter: new Date('2021-01-01T00:00:00Z'),
      },
    ],
    [
      'VALIDITY',
      {
        notBefore: new Date('2060-01-01T00:00:00Z'),
        notAfter: new Date('2061-01-01T00:00:00Z'),
      },
    ],
  ])('refuses a chain failing %s', async (reason, options) => {
    const other = await createTestChain(options);
    await expect(
      reader(transactionPayload(), { chain: other }).read('2000000000000001'),
    ).rejects.toThrow(`Apple signature rejected: ${reason}`);
  });

  it('refuses a chain whose intermediate another root signed', async () => {
    const [first, second] = await Promise.all([
      createTestChain(),
      createTestChain(),
    ]);
    const signed = await first.sign(transactionPayload());
    const [header, payload, signature] = signed.split('.');
    const swapped = JSON.parse(
      Buffer.from(header ?? '', 'base64url').toString('utf8'),
    ) as { x5c: string[] };
    const foreign = JSON.parse(
      Buffer.from(
        (await second.sign({})).split('.')[0] ?? '',
        'base64url',
      ).toString('utf8'),
    ) as { x5c: string[] };
    swapped.x5c[2] = foreign.x5c[2] ?? '';
    await expect(
      verifySignedPayload(
        `${Buffer.from(JSON.stringify(swapped)).toString('base64url')}.${payload}.${signature}`,
        { rootFingerprints: [second.rootFingerprint], now: Date.now() },
      ),
    ).rejects.toThrow('Apple signature rejected: INTERMEDIATE_SIGNATURE');
  });

  it('pins the real Apple Root CA - G3 and reads its certificate', async () => {
    const root = Buffer.from(appleRootG3, 'base64');
    expect(
      Buffer.from(await crypto.subtle.digest('SHA-256', root)).toString('hex'),
    ).toBe(appleRootFingerprints[0]);
    // Apple's root parses, is a CA and verifies its own P-384 signature, so
    // the check stops only at the test intermediate Apple did not sign.
    const signed = await chain.sign(transactionPayload());
    const [header, payload, signature] = signed.split('.');
    const parsed = JSON.parse(
      Buffer.from(header ?? '', 'base64url').toString('utf8'),
    ) as { x5c: string[] };
    parsed.x5c[2] = appleRootG3;
    await expect(
      verifySignedPayload(
        `${Buffer.from(JSON.stringify(parsed)).toString('base64url')}.${payload}.${signature}`,
        { rootFingerprints: appleRootFingerprints, now: Date.now() },
      ),
    ).rejects.toThrow('Apple signature rejected: INTERMEDIATE_SIGNATURE');
  });

  it.each(['', 'a.b', 'a.b.c.d', '!!.b.c', 'e30.e30.AA'])(
    'refuses a malformed signed payload %j',
    async (jws) => {
      await expect(
        verifySignedPayload(jws, {
          rootFingerprints: [chain.rootFingerprint],
          now: Date.now(),
        }),
      ).rejects.toThrow('Apple signature rejected');
    },
  );

  it.each([
    [400, 'NOT_FOUND', 404],
    [404, 'NOT_FOUND', 404],
    [401, 'UNAVAILABLE', 503],
    [429, 'UNAVAILABLE', 503],
    [500, 'UNAVAILABLE', 503],
    [307, 'UNAVAILABLE', 503],
  ])('maps an Apple %i to %s', async (status, code, mapped) => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          status,
          headers: { location: 'https://elsewhere.invalid/' },
        }),
    );
    const read = createAppleTransactions(config(), { transport });
    await expect(read('2000000000000001')).rejects.toEqual(
      failure(code, mapped),
    );
    expect(transport.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it('turns a network failure or an unreadable answer into UNAVAILABLE', async () => {
    for (const transport of [
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('network down');
      }),
      vi.fn<typeof fetch>(async () => new Response('not json')),
      vi.fn<typeof fetch>(async () => Response.json({ signed: 'x' })),
    ])
      await expect(
        createAppleTransactions(config(), { transport })('2000000000000001'),
      ).rejects.toEqual(failure('UNAVAILABLE', 503));
  });

  it('refuses a transaction ID that is not Apple digits before sending', async () => {
    const transport = vi.fn<typeof fetch>();
    const read = createAppleTransactions(config(), { transport });
    for (const id of ['', 'abc', '1/../2', '1'.repeat(33)])
      await expect(read(id)).rejects.toEqual(failure('INVALID_REQUEST', 400));
    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses to call Apple inside an owner transaction', async () => {
    const database = drizzle.mock();
    vi.spyOn(database, 'transaction').mockImplementation(async (work) =>
      work({} as Parameters<typeof work>[0]),
    );
    const { read, transport } = reader();
    const spy = vi.fn(transport);
    const guarded = createAppleTransactions(config(), {
      transport: spy,
      rootFingerprints: [chain.rootFingerprint],
    });
    await ownerTransactions(database).transaction(async () => {
      await expect(guarded('2000000000000001')).rejects.toEqual(
        failure('UNAVAILABLE', 503),
      );
    });
    expect(spy).not.toHaveBeenCalled();
    await expect(read('2000000000000001')).resolves.toMatchObject({
      transactionId: '2000000000000001',
    });
  });

  it('never puts the key or the signed payload in an error', async () => {
    const { read } = reader(transactionPayload({ bundleId: 'app.other' }));
    const error: unknown = await read('2000000000000001').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(JSON.stringify(error)).not.toContain('PRIVATE');
    expect(String(error)).not.toMatch(/eyJ|app\.other/);
  });
});

describe('Apple subscription status', () => {
  const original = '2000000000000001';
  function statuses(
    latest?: Record<string, unknown>,
    forge = false,
    renewal?: Record<string, unknown>,
  ) {
    const store = createTestStore(chain, connect.publicKey, new Map(), {
      forge,
      subscriptions: new Map(latest ? [[original, latest]] : []),
      renewals: new Map(renewal ? [[original, renewal]] : []),
    });
    return {
      ...store,
      read: createAppleSubscriptions(config(), {
        transport: store.transport,
        rootFingerprints: [chain.rootFingerprint],
      }),
    };
  }

  it("reads Get All Subscription Statuses and returns Apple's latest transaction, renewal or refund", async () => {
    const now = Date.now();
    const renewal = statuses(
      transactionPayload({
        transactionId: '2000000000000007',
        expiresDate: now + 60 * 86_400_000,
      }),
    );
    await expect(renewal.read(original)).resolves.toMatchObject({
      transactionId: '2000000000000007',
      originalTransactionId: original,
      expiresAt: new Date(now + 60 * 86_400_000),
      revokedAt: null,
    });
    expect(renewal.requests.map(({ url }) => url)).toEqual([
      `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/${original}`,
    ]);
    const refund = statuses(transactionPayload({ revocationDate: now - 1000 }));
    await expect(refund.read(original)).resolves.toMatchObject({
      revokedAt: new Date(now - 1000),
    });
  });

  it("reads auto-renew from Apple's signed renewal info, and leaves it unknown without one", async () => {
    for (const [status, autoRenew] of [
      [1, true],
      [0, false],
    ] as const)
      await expect(
        statuses(
          transactionPayload({ offerType: 1, offerDiscountType: 'FREE_TRIAL' }),
          false,
          renewalPayload({ autoRenewStatus: status }),
        ).read(original),
      ).resolves.toMatchObject({ trial: true, autoRenew });
    await expect(
      statuses(transactionPayload()).read(original),
    ).resolves.toMatchObject({ trial: false, autoRenew: null });
  });

  it('refuses renewal info for another subscription or environment, or with an unknown status', async () => {
    for (const overrides of [
      { originalTransactionId: '2000000000000009' },
      { environment: 'Production' },
      { autoRenewStatus: 2 },
      { autoRenewStatus: undefined },
    ])
      await expect(
        statuses(transactionPayload(), false, renewalPayload(overrides)).read(
          original,
        ),
      ).rejects.toEqual(failure('INVALID_REQUEST', 400));
  });

  it('keeps forged renewal info retryable', async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: [
          {
            lastTransactions: [
              {
                originalTransactionId: original,
                signedTransactionInfo: await chain.sign(transactionPayload()),
                signedRenewalInfo: await chain.sign(renewalPayload(), true),
              },
            ],
          },
        ],
      }),
    );
    await expect(
      createAppleSubscriptions(config(), {
        transport,
        rootFingerprints: [chain.rootFingerprint],
      })(original),
    ).rejects.toThrow('Apple signature rejected: SIGNATURE');
  });

  it('answers NOT_FOUND for an ID Apple does not know and refuses one not in Apple digits before sending', async () => {
    await expect(statuses().read(original)).rejects.toEqual(
      failure('NOT_FOUND', 404),
    );
    const transport = vi.fn<typeof fetch>();
    const read = createAppleSubscriptions(config(), { transport });
    for (const id of ['', 'abc', '1/../2', '1'.repeat(33)])
      await expect(read(id)).rejects.toEqual(failure('INVALID_REQUEST', 400));
    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses a signed transaction for another subscription, app or environment', async () => {
    for (const overrides of [
      { originalTransactionId: '2000000000000009' },
      { bundleId: 'app.other' },
      { environment: 'Production' },
    ])
      await expect(
        statuses(transactionPayload(overrides)).read(original),
      ).rejects.toEqual(failure('INVALID_REQUEST', 400));
  });

  it('refuses an answer that lists no transaction for the asked subscription', async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: [
          {
            lastTransactions: [
              {
                originalTransactionId: '2000000000000009',
                signedTransactionInfo: await chain.sign(transactionPayload()),
              },
            ],
          },
        ],
      }),
    );
    await expect(
      createAppleSubscriptions(config(), {
        transport,
        rootFingerprints: [chain.rootFingerprint],
      })(original),
    ).rejects.toEqual(failure('INVALID_REQUEST', 400));
  });

  it('keeps a forged signature and an Apple outage retryable', async () => {
    await expect(
      statuses(transactionPayload(), true).read(original),
    ).rejects.toThrow('Apple signature rejected: SIGNATURE');
    const down = vi.fn<typeof fetch>(
      async () => new Response('{}', { status: 503 }),
    );
    await expect(
      createAppleSubscriptions(config(), { transport: down })(original),
    ).rejects.toEqual(failure('UNAVAILABLE', 503));
  });
});
