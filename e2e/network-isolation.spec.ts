import { networkInterfaces } from 'node:os';
import { createConnection } from 'node:net';
import { test, expect } from '@playwright/test';
import { journeyApiUrl, journeyAppUrl } from './support/environment';
import { test as journey } from './support/fixtures';

const api = new URL(journeyApiUrl);
const prefix = api.pathname.replace(/\/$/, '');

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

// The fence throws from its route handler, which fails the journey that made
// the request. Each case below is therefore expected to fail, and does nothing
// else that could. `.invalid` never resolves, so a missing fence reaches no host.
for (const [target, url] of [
  ['a hosted API', `https://hosted.invalid${prefix}/v1/sessions`],
  ['another loopback port', `${journeyAppUrl}${prefix}/v1/sessions`],
] as const)
  journey(
    `the request fence fails a journey that calls ${target}`,
    async ({ page }) => {
      journey.fail();
      await page.evaluate((url) => fetch(url).catch(() => null), url);
    },
  );

journey(
  'the request fence fails a journey that calls the fixture origin outside its path prefix',
  async ({ page }) => {
    journey.skip(!prefix, 'Needs JUSTGO_JOURNEY_API_PREFIX');
    journey.fail();
    await page.evaluate(
      (url) => fetch(url).catch(() => null),
      `${api.origin}/v1/sessions`,
    );
  },
);
