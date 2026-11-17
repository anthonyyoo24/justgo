import type { Page } from '@playwright/test';
import type { Pool } from 'pg';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { localJournalEntries } from './support/journal';
import {
  completeChallenge,
  continueAsGuest,
  signInFixture,
} from './support/managed-account';

// JustGO is free (Anthony, 2026-11-17), so startup never asks the server
// whether a person may enter, and a phone that cannot reach it still opens.
function recordAccessChecks(page: Page) {
  const checks: string[] = [];
  page.on('request', (request) => {
    if (/\/v1\/(guest\/)?access$/.test(new URL(request.url()).pathname))
      checks.push(request.url());
  });
  return checks;
}
async function failEveryApiRequest(page: Page) {
  await page.route(`${journeyApiUrl}/v1/**`, (route) => route.abort());
}
async function expectHome(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('progressbar', { name: 'Loading JustGO', exact: true }),
  ).toHaveCount(0);
}
async function attemptCount(database: Pool, userId: string) {
  const result = await database.query<{ count: string }>(
    'select count(*)::text as count from justgo.attempts where user_id=$1',
    [userId],
  );
  return Number(result.rows[0]?.count);
}

for (const mode of ['guest', 'account'] as const) {
  test(`${mode} cold startup enters Home with no access check`, async ({
    page,
  }) => {
    if (mode === 'guest') await continueAsGuest(page);
    else await signInFixture(page);
    const checks = recordAccessChecks(page);
    await page.reload();
    await expectHome(page);
    expect(checks).toEqual([]);
  });
}

test('a guest opens and finishes a challenge while every API request fails', async ({
  page,
}) => {
  const guestId = await continueAsGuest(page);
  await failEveryApiRequest(page);
  await page.reload();
  await expectHome(page);
  await completeChallenge(page, 'Synthetic offline reflection.');
  await expect
    .poll(async () => (await localJournalEntries(page, guestId)).length)
    .toBe(1);
});

test('an account’s offline challenge reaches the server once it reconnects', async ({
  page,
  fixtureDatabase,
}) => {
  const { userId } = await signInFixture(page);
  expect(await attemptCount(fixtureDatabase, userId)).toBe(0);
  await failEveryApiRequest(page);
  await page.reload();
  await expectHome(page);
  await completeChallenge(page);
  expect(await attemptCount(fixtureDatabase, userId)).toBe(0);
  await page.unrouteAll({ behavior: 'wait' });
  await page.reload();
  await expectHome(page);
  await expect
    .poll(() => attemptCount(fixtureDatabase, userId), { timeout: 15_000 })
    .toBe(1);
});
