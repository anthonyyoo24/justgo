// Deliberately separate from the deployable server. Disposable loopback-only fixtures.
import { Hono } from 'hono';
import type { ApiEnvironment } from '../src/http/request.js';
import { listen } from '../src/http/node-server.js';
import { createHmac, randomUUID } from 'node:crypto';
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
const config = readConfig();
const url = localTestDatabaseUrl(config.DATABASE_URL);
if (
  process.env.VERCEL ||
  process.env.NODE_ENV === 'production' ||
  url.username !== 'justgo_runtime'
)
  throw new Error('Challenge fixtures require local justgo_test');
const database = createDatabase(config);
const providers = new FixtureProviders();
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
  server = await listen(app, {
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
