import { test as base, expect } from '@playwright/test';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  journeyApiUrl,
  journeyAppUrl,
  journeyEnvironment,
} from './environment';

const bootstrapIdentity = z.object({
  kind: z.literal('bootstrap'),
  sessionId: z.uuid(),
});

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
      await database.end();
    }
  },
  page: async ({ page, fixtureDatabase }, use, testInfo) => {
    const sessions = new Set<string>();
    // Retain only fixture UUIDs for scoped cleanup, never credential/session secrets.
    page.on('request', (request) => {
      if (
        request.url() !== `${journeyApiUrl}/v1/sessions` ||
        request.method() !== 'POST'
      )
        return;
      const parsed = bootstrapIdentity.safeParse(request.postDataJSON());
      if (parsed.success) sessions.add(parsed.data.sessionId);
    });
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
        try {
          await page.close();
        } finally {
          await removeFixtureAccounts(fixtureDatabase, sessions);
        }
      }
    }
  },
});

async function removeFixtureAccounts(database: Pool, sessions: Set<string>) {
  const owners = await database.query<{ user_id: string }>(
    'select distinct user_id from justgo.device_sessions where id = any($1::uuid[])',
    [[...sessions]],
  );
  for (const { user_id: owner } of owners.rows) {
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
