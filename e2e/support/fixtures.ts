import { test as base, expect } from '@playwright/test';
import { Pool } from 'pg';
import { z } from 'zod';
import { createAttemptSchema } from '@justgo/contracts';
import {
  journeyApiUrl,
  journeyAppUrl,
  journeyEnvironment,
} from './environment';

const fixtureRegistry = z
  .object({
    userIds: z.array(z.uuid()),
    rateBucketKeys: z.array(z.string().regex(/^[a-f0-9]{64}$/)).length(3),
  })
  .strict();

export const test = base.extend<{ fixtureDatabase: Pool }>({
  fixtureDatabase: async ({ baseURL }, use) => {
    expect(baseURL).toBe(journeyAppUrl);
    const { migrationUrl } = journeyEnvironment(process.env);
    const database = new Pool({
      connectionString: migrationUrl,
      max: 1,
      ssl: false,
    });
    try {
      const role = await database.query<{ current_user: string }>(
        'select current_user',
      );
      expect(role.rows[0]?.current_user).toBe('justgo_migrator');
      // Cases share one loopback address. Give each its existing full allowance
      // without changing limits or deleting any other server's rate buckets.
      const { rateBucketKeys } = await readFixtureRegistry();
      await database.query(
        'delete from justgo.identity_rate_buckets where key=any($1::text[])',
        [rateBucketKeys],
      );
      await use(database);
    } finally {
      try {
        await removeFixtureAccounts(database);
      } finally {
        await database.end();
      }
    }
  },
  page: async ({ page, fixtureDatabase }, use, testInfo) => {
    // Keep the database fixture alive until screenshot/page teardown completes.
    void fixtureDatabase;
    // No journey diagnostic may reach a hosted provider. Individual diagnostics
    // cases fulfill the intercepted request locally to inspect its real SDK payload.
    await page.route('https://*.sentry.io/**', (route) =>
      route.abort('blockedbyclient'),
    );
    await page.route('**/v1/**', async (route) => {
      if (new URL(route.request().url()).origin !== journeyApiUrl) {
        await route.abort('blockedbyclient');
        throw new Error('Journey blocked a request to a non-fixture API');
      }
      await route.continue();
    });
    const invalidActivityWrites: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/v1/attempts') || request.method() === 'GET')
        return;
      let valid = false;
      try {
        valid =
          path === '/v1/attempts' &&
          request.method() === 'POST' &&
          createAttemptSchema.safeParse(request.postDataJSON()).success;
      } catch {
        /* Invalid bodies must fail the privacy boundary assertion. */
      }
      if (!valid) invalidActivityWrites.push(`${request.method()} ${path}`);
    });
    try {
      await use(page);
      expect(invalidActivityWrites).toEqual([]);
    } finally {
      try {
        if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
          const screenshot = await page.screenshot({
            mask: [
              page.getByRole('textbox'),
              page.getByText(/(?:[a-f0-9]{8} ){3,}[a-f0-9]{8}/i),
            ],
          });
          await testInfo.attach('masked-app-failure', {
            body: screenshot,
            contentType: 'image/png',
          });
        }
      } finally {
        await page.close();
      }
    }
  },
});

async function readFixtureRegistry() {
  // The per-run fixture server owns this registry, independently of browser requests
  // or response delivery. Existing-account recovery cannot add cleanup authority.
  const registry = await fetch(`${journeyApiUrl}/__fixtures/accounts`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!registry.ok) throw new Error('Fixture account registry unavailable');
  return fixtureRegistry.parse(await registry.json());
}

async function removeFixtureAccounts(database: Pool) {
  const { userIds } = await readFixtureRegistry();
  for (const owner of userIds) {
    await database.query('begin');
    try {
      for (const table of [
        'journal_versions',
        'managed_auth_deletions',
        'deleted_completion_ids',
        'managed_auth_sessions',
        'managed_auth_accounts',
        'attempt_patch_receipts',
        'attempts',
        'device_transfers',
        'device_sessions',
        'recovery_credentials',
        'devices',
      ])
        await database.query(`delete from justgo.${table} where user_id=$1`, [
          owner,
        ]);
      await database.query('delete from justgo.users where id=$1', [owner]);
      await database.query('commit');
    } catch (error) {
      await database.query('rollback');
      throw error;
    }
  }
}

export { expect };
