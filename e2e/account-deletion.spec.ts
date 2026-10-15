import { sessionCreateSchema, sessionResponseSchema } from '@justgo/contracts';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { leaveAccountScreens } from './support/account-navigation';

test('Settings permanently deletes the owned account and retries a lost acknowledgement without resurrecting it', async ({
  page,
  fixtureDatabase,
}) => {
  await page.goto('/recovery');
  const creating = page.waitForRequest(
    (r) => r.url() === `${journeyApiUrl}/v1/sessions` && r.method() === 'POST',
  );
  const created = page.waitForResponse(
    (r) =>
      r.url() === `${journeyApiUrl}/v1/sessions` &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a new account', exact: true })
    .click();
  const proof = sessionCreateSchema.parse((await creating).postDataJSON());
  const account = sessionResponseSchema.parse(await (await created).json());
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await fixtureDatabase.query(
    `insert into justgo.attempts (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone,reflection_text,reflection_revision)
    select $1,gen_random_uuid(),v.venue_id,c.id,c.level_id,now(),'2026-10-14','America/Toronto','Disposable deletion journey',1
    from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id limit 1`,
    [account.userId],
  );
  await leaveAccountScreens(page);
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith(`justgo:v1:${id}:`),
          ).length,
        account.userId,
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Delete account', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Delete account permanently',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Continue to deletion', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cancel subscription', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Delete account', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Delete account permanently',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Continue to deletion', exact: true })
    .click();
  let lost = true;
  await page.route(`${journeyApiUrl}/v1/account`, async (route) => {
    if (lost) {
      lost = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page
    .getByRole('button', { name: 'Delete account permanently', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Finish account deletion', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Finish deletion', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Finish deletion', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Account deleted', exact: true }),
  ).toBeVisible();
  expect(
    (
      await fixtureDatabase.query(
        'select count(*)::int as n from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    await page.evaluate(
      (id) =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith(`justgo:v1:${id}:`),
        ),
      account.userId,
    ),
  ).toEqual([]);
  expect(
    (
      await page.request.get(`${journeyApiUrl}/v1/sessions/current`, {
        headers: {
          authorization: `Bearer ${'sessionToken' in proof ? proof.sessionToken : ''}`,
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post(`${journeyApiUrl}/v1/sessions`, {
        data: { ...proof, kind: 'bootstrap' },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole('button', { name: 'Return to Settings', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Account & recovery', exact: true })
    .click();
  await expect(
    page.getByText('Your account has been deleted.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create a new account', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Get help', exact: true }),
  ).toHaveCount(0);
});
