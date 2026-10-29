import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import type { ApiApp } from './request.js';

/** Node owns its socket lifetime; Workers call the same app's fetch entrypoint. */
export async function listen(
  app: ApiApp,
  options: { port: number; host: string },
) {
  const server = await new Promise<ServerType>((resolve, reject) => {
    const instance = serve(
      { fetch: app.fetch, port: options.port, hostname: options.host },
      () => resolve(instance),
    );
    instance.once('error', reject);
  });
  server.setTimeout(10000);
  if ('requestTimeout' in server) server.requestTimeout = 10000;
  if ('headersTimeout' in server) server.headersTimeout = 10000;
  return {
    address: server.address(),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
