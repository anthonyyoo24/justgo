import { test as base, expect } from '@playwright/test';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  journeyApiUrl,
  journeyAppUrl,
  journeyEnvironment,
} from './environment';

const allocatedAccounts = z.object({ userIds: z.array(z.uuid()) }).strict();

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
    try {
      await use(page);
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

async function removeFixtureAccounts(database: Pool) {
  // The per-run fixture server owns this registry, independently of browser requests
  // or response delivery. Existing-account recovery cannot add cleanup authority.
  const registry = await fetch(`${journeyApiUrl}/__fixtures/accounts`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!registry.ok) throw new Error('Fixture account registry unavailable');
  const { userIds } = allocatedAccounts.parse(await registry.json());
  for (const owner of userIds) {
    await database.query('begin');
    try {
      for (const table of [
        'attempt_patch_receipts',
        'reflection_actions',
        'reflections',
        'attempts',
        'deck_skips',
        'venue_queues',
        'challenge_preferences',
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
