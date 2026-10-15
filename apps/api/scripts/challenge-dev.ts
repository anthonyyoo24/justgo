// Deliberately separate from the deployable server. Disposable loopback-only fixtures.
import { randomUUID } from 'node:crypto';
import { installFixtureShutdown } from './fixture-shutdown.js';
import { localTestDatabaseUrl } from './local-test-database.js';
import { buildApp } from '../src/build-app.js';
import { createDatabase, checkDatabase } from '../src/db/client.js';
import { readConfig } from '../src/config.js';
import { IdentityService } from '../src/identity/service.js';
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
// Only this server can allocate cleanup-owned accounts. Requests cannot nominate IDs.
const allocatedAccounts = new Set<string>();
const app = buildApp({
  logger: false,
  identity: new IdentityService(database.db, {
    // Keep the real limits, but separate this run from prior fixture sessions.
    rateKey: `local-challenge-fixtures:${randomUUID()}`,
    rateLimit: 300,
    newUserId: () => {
      const id = randomUUID();
      allocatedAccounts.add(id);
      return id;
    },
  }),
  origins: [journeyAppUrl, journeyAppUrl.replace('127.0.0.1', 'localhost')],
  checkDatabase: () => checkDatabase(database.pool),
  uploadEligibilityReader: async () => 'eligible',
  entitlementReader: async () => ({
    status: 'verified',
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  }),
});
app.get('/__fixtures/accounts', async () => ({
  userIds: [...allocatedAccounts],
}));
app.addHook('onClose', () => database.pool.end());
const shutdown = installFixtureShutdown(() => app.close());
try {
  await app.listen({
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
