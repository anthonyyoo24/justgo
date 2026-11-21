// Deliberately separate from the deployable server. Disposable loopback-only fixtures.
import { Hono } from 'hono';
import type { ApiEnvironment } from '../src/http/request.js';
import { listen } from '../src/http/node-server.js';
import { createHmac, randomUUID } from 'node:crypto';
import { fixturePathPrefix, underPathPrefix } from './fixture-path-prefix.js';
import { installFixtureShutdown } from './fixture-shutdown.js';
import { localTestDatabaseUrl } from './local-test-database.js';
import { buildApp } from '../src/build-app.js';
import { createDatabase, checkDatabase } from '../src/db/client.js';
import { readConfig } from '../src/config.js';
import { IdentityService } from '../src/identity/service.js';
import {
  FixtureProviders,
  fixtureProviderRoutes,
} from './fixture-providers.js';
import {
  journeyApiUrl,
  journeyAppUrl,
} from '../../../e2e/support/environment.js';
import { createAppleTransactions } from '../src/billing/apple.js';
import { parse } from '../src/http/parse.js';
import { parseRequestBody, requestBody } from '../src/http/request.js';
import { z } from 'zod';
import {
  createConnectKey,
  createTestChain,
  createTestStore,
  testBilling,
  transactionPayload,
} from './apple-test-store.js';
const config = readConfig();
const url = localTestDatabaseUrl(config.DATABASE_URL);
if (
  process.env.VERCEL ||
  process.env.NODE_ENV === 'production' ||
  url.username !== 'justgo_runtime'
)
  throw new Error('Challenge fixtures require local justgo_test');
const pathPrefix = fixturePathPrefix(process.env.JUSTGO_JOURNEY_API_PREFIX);
const database = createDatabase(config);
// JUSTGO_FIXTURE_BILLING=on runs the API as BILLING_ENABLED does, against a
// stub Apple store this server signs for, and accepts anonymous guests.
const fixtureBilling = process.env.JUSTGO_FIXTURE_BILLING === 'on';
const providers = new FixtureProviders({ guests: fixtureBilling });
const appleTransactions = new Map<string, Record<string, unknown>>();
const apple = fixtureBilling
  ? await (async () => {
      const [chain, connect] = await Promise.all([
        createTestChain(),
        createConnectKey(),
      ]);
      const store = createTestStore(
        chain,
        connect.publicKey,
        appleTransactions,
      );
      return createAppleTransactions(
        { ...testBilling, privateKey: connect.pem },
        {
          transport: store.transport,
          rootFingerprints: [chain.rootFingerprint],
        },
      );
    })()
  : undefined;
let appleSerial = 4_100_000_000_000_000n + BigInt(Date.now());
// Only this server can allocate cleanup-owned accounts. Requests cannot nominate IDs.
const allocatedAccounts = new Set<string>();
const fixtureRateKey = `local-challenge-fixtures:${randomUUID()}`;
// The loopback server owns only these two buckets; never expose its HMAC secret.
const rateBucketKeys = ['identity', 'recovery', 'managed-auth'].map((lane) =>
  createHmac('sha256', fixtureRateKey)
    .update(`${lane}:127.0.0.1`)
    .digest('hex'),
);
const app = buildApp({
  logger: false,
  developmentLegalDrafts: true,
  identity: new IdentityService(database.db, {
    // Keep existing limits and isolate this run from prior fixture sessions.
    rateKey: fixtureRateKey,
    rateLimit: 300,
    managedAuthVerifier: providers.verify,
    managedLiveSessionReader: providers.live,
    managedAuthDeletion: providers.erase,
    newUserId: () => {
      const id = randomUUID();
      allocatedAccounts.add(id);
      return id;
    },
  }),
  origins: [journeyAppUrl, journeyAppUrl.replace('127.0.0.1', 'localhost')],
  checkDatabase: () => checkDatabase(database.pool),
  // With billing on, buildApp reads only saved subscriptions and ignores these.
  ...(apple ? { billing: apple } : {}),
  uploadEligibilityReader: async () => 'eligible',
  guestAccessReader: async () => ({
    status: 'verified',
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  }),
  entitlementReader: async () => ({
    status: 'verified',
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  }),
});
const fixtureRouter = new Hono<ApiEnvironment>();
fixtureProviderRoutes(fixtureRouter, providers);
if (fixtureBilling)
  // Sign a sandbox purchase at the stub store, as a StoreKit purchase would.
  fixtureRouter.post('/apple-transactions', parseRequestBody(), (context) => {
    const input = parse(
      z
        .object({
          appAccountToken: z.uuid().nullable().default(null),
          originalTransactionId: z
            .string()
            .regex(/^[0-9]{1,32}$/)
            .optional(),
          expired: z.boolean().default(false),
        })
        .strict(),
      requestBody(context),
    );
    const transactionId = String(++appleSerial);
    const originalTransactionId = input.originalTransactionId ?? transactionId;
    appleTransactions.set(
      transactionId,
      transactionPayload({
        transactionId,
        originalTransactionId,
        ...(input.appAccountToken
          ? { appAccountToken: input.appAccountToken }
          : {}),
        ...(input.expired ? { expiresDate: Date.now() - 60_000 } : {}),
      }),
    );
    return context.json({ transactionId, originalTransactionId });
  });
app.route('/__fixtures', fixtureRouter);
app.get('/__fixtures/accounts', (context) =>
  context.json({
    userIds: [...allocatedAccounts],
    rateBucketKeys,
  }),
);
let server: Awaited<ReturnType<typeof listen>> | undefined;
const shutdown = installFixtureShutdown(async () => {
  await server?.close();
  await database.pool.end();
});
try {
  server = await listen(underPathPrefix(app, pathPrefix), {
    host: '127.0.0.1',
    port: Number(new URL(journeyApiUrl).port),
  });
  console.info(
    `Disposable challenge test server listening on ${journeyApiUrl}`,
  );
} catch {
  console.error('Disposable challenge test server startup failed');
  process.exitCode = 1;
  await shutdown();
}
