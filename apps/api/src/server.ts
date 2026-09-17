import Fastify from 'fastify';
import { buildApp } from './build-app.js';
import { readConfig } from './config.js';
import { checkDatabase, createDatabase } from './db/client.js';
import { loggerOptions } from './diagnostics.js';

const config = readConfig();
// Once per warm process/function instance; never construct a pool per request.
const database = config.DATABASE_URL ? createDatabase(config) : undefined;
const app = buildApp(
  {
    logger: loggerOptions(config.LOG_LEVEL),
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
