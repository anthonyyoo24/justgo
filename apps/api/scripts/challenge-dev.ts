// Deliberately separate from the deployable server. Disposable loopback-only fixtures.
import { buildApp } from '../src/build-app.js';
import { createDatabase, checkDatabase } from '../src/db/client.js';
import { readConfig } from '../src/config.js';
import { IdentityService } from '../src/identity/service.js';
const config = readConfig();
const url = new URL(config.DATABASE_URL ?? 'http://invalid');
if (
  process.env.VERCEL ||
  process.env.NODE_ENV === 'production' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  url.pathname !== '/justgo_test'
)
  throw new Error('Challenge fixtures require local justgo_test');
const database = createDatabase(config);
const app = buildApp({
  logger: false,
  identity: new IdentityService(database.db, {
    rateKey: 'local-challenge-fixtures',
    rateLimit: 300,
  }),
  origins: ['http://localhost:8081', 'http://127.0.0.1:8081'],
  checkDatabase: () => checkDatabase(database.pool),
  entitlementReader: async () => ({
    status: 'verified',
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  }),
});
app.addHook('onClose', () => database.pool.end());
await app.listen({ host: '127.0.0.1', port: 3000 });
console.info('Disposable challenge test server listening on 127.0.0.1:3000');
