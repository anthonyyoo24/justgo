import { networkInterfaces } from 'node:os';
import { createConnection } from 'node:net';
import { test, expect } from '@playwright/test';
import { journeyApiUrl, journeyAppUrl } from './support/environment';

test('fixture servers reject connections through non-loopback interfaces', async () => {
  const addresses = new Set(
    Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => entry.address),
  );
  for (const host of addresses) {
    for (const port of [journeyApiUrl, journeyAppUrl].map((url) =>
      Number(new URL(url).port),
    )) {
      const connected = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host, port });
        const finish = (value: boolean) => {
          socket.destroy();
          resolve(value);
        };
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        socket.setTimeout(500, () => finish(false));
      });
      expect(connected, `Port ${port} must only listen on loopback`).toBe(
        false,
      );
    }
  }
});
