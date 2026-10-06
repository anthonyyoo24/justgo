import { sessionResponseSchema } from '@justgo/contracts';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';

test('a real account renews and opens its challenge catalog', async ({
  page,
  fixtureDatabase,
}) => {
  await page.goto('/recovery');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url() === `${journeyApiUrl}/v1/sessions` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a private account', exact: true })
    .click();
  const created = await createdResponse;
  expect(created.ok()).toBe(true);
  const account = sessionResponseSchema.parse(await created.json());
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();

  const renewedResponse = page.waitForResponse(
    (response) =>
      response.url() === `${journeyApiUrl}/v1/sessions` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Renew this session', exact: true })
    .click();
  const renewed = await renewedResponse;
  expect(renewed.ok()).toBe(true);
  const renewal = sessionResponseSchema.parse(await renewed.json());
  expect(renewal.userId).toBe(account.userId);
  expect(renewal.sessionId).not.toBe(account.sessionId);

  await page.getByRole('link', { name: 'Back to app', exact: true }).click();
  await expect(
    page.getByText('Find a challenge', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await expect(page.getByText('Total reps', { exact: true })).toBeVisible();

  const records = await fixtureDatabase.query<{ count: string }>(
    'select count(*)::text as count from justgo.attempts where user_id=$1',
    [account.userId],
  );
  expect(records.rows[0]?.count).toBe('0');
});
