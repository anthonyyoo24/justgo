import { readConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createLogger, loggerOptions } from './http/diagnostics.js';
import { listen } from './http/node-server.js';
import { buildRuntimeApp } from './runtime-app.js';

const config = readConfig();
// The Node server retains a bounded pool for its process lifetime.
const database = config.DATABASE_URL ? createDatabase(config) : undefined;
const app = buildRuntimeApp(config, database, {
  onVercel: process.env.VERCEL === '1',
});
// Shutdown must also own a listener that is still binding when a signal arrives.
const listening = listen(app, { port: config.PORT, host: '0.0.0.0' });
let shutdown: Promise<void> | undefined;
const close = () =>
  (shutdown ??= (async () => {
    try {
      const server = await listening.catch(() => undefined);
      await server?.close();
    } finally {
      await database?.pool.end();
    }
  })());
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void close().catch(() => {
      process.exitCode = 1;
    });
  });
}
// The retained Vercel adapter captures listen while the candidate awaits cutover.
void listening
  .catch(async () => {
    createLogger(loggerOptions(config.LOG_LEVEL)).error(
      {},
      'API startup failed',
    );
    process.exitCode = 1;
    await close();
  })
  .catch(() => {
    // A cleanup failure after startup failed is handled without exposing its data.
    process.exitCode = 1;
  });
