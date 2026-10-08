import { createServer } from 'node:net';
import { journeyApiUrl, journeyAppUrl } from '../../e2e/support/environment.ts';

// Refuse existing writers before applying the final contract migration. This
// probe releases its listeners immediately; Playwright still refuses races.
export async function assertJourneyPortsAvailable(
  urls = [journeyApiUrl, journeyAppUrl],
) {
  for (const value of urls) {
    const { hostname, port } = new URL(value);
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', () =>
        reject(
          new Error(
            `Journey fixture port ${port} is unavailable; stop its existing service before migrations.`,
          ),
        ),
      );
      server.listen({ host: hostname, port: Number(port) }, () => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });
  }
}
