import { expect, it } from 'vitest';
import { createHttpApp } from '../../src/http/app.js';
import { listen } from '../../src/http/node-server.js';

it('serves the Hono Fetch app on Node, uses the socket address and closes its listener', async () => {
  const app = createHttpApp({ logger: false });
  app.get('/address', (context) =>
    context.json({ address: context.get('clientAddress') }),
  );
  const server = await listen(app, { host: '127.0.0.1', port: 0 });
  if (!server.address || typeof server.address === 'string')
    throw new Error('Expected TCP listener');
  const url = `http://127.0.0.1:${server.address.port}/address`;
  try {
    const response = await fetch(url, {
      headers: {
        'x-forwarded-for': '203.0.113.2',
        'cf-connecting-ip': '203.0.113.3',
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ address: '127.0.0.1' });
    await expect(
      listen(app, { host: '127.0.0.1', port: server.address.port }),
    ).rejects.toThrow();
  } finally {
    await server.close();
  }
  await expect(fetch(url)).rejects.toThrow();
});
