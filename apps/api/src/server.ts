import Fastify from 'fastify';
import { buildApp } from './build-app.js';
import { readConfig } from './config.js';
import { checkDatabase, createDatabase } from './db/client.js';
import { loggerOptions } from './diagnostics.js';
import { IdentityService } from './identity/service.js';

const config = readConfig();
// Once per warm process/function instance; never construct a pool per request.
const database = config.DATABASE_URL ? createDatabase(config) : undefined;
const app = buildApp(
  {
    logger: loggerOptions(config.LOG_LEVEL),
    onVercel: process.env.VERCEL === '1',
    ...(database
      ? {
          identity: new IdentityService(database.db, {
            rateKey: config.IDENTITY_RATE_LIMIT_KEY,
            sessionHours: config.IDENTITY_SESSION_HOURS,
            transferMinutes: config.IDENTITY_TRANSFER_MINUTES,
            rateLimit: config.IDENTITY_RECOVERY_RATE_LIMIT,
          }),
        }
      : {}),
    origins: config.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    checkDatabase: async () => {
      if (!database) throw new Error('Database is not configured');
      await checkDatabase(database.pool);
    },
  },
  Fastify,
);
app.addHook('onClose', async () => {
  await database?.pool.end();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
// Vercel captures listen during module loading; do not await it at module scope.
void app.listen({ port: config.PORT, host: '0.0.0.0' }).catch(() => {
  app.log.fatal('API startup failed');
  process.exitCode = 1;
  void app.close();
});
