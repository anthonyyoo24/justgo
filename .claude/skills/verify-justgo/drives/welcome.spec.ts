import { test, expect } from '../../../../e2e/support/fixtures';
import { journeyApiUrl } from '../../../../e2e/support/environment';
import { capture, writeProof } from './evidence';

test('welcome-guest: Welcome and Terms lead a guest to the deck without creating an account', async ({
  page,
  fixtureDatabase,
}) => {
  const users = async () =>
    (
      await fixtureDatabase.query<{ n: number }>(
        'select count(*)::int as n from justgo.users',
      )
    ).rows[0]?.n;
  const before = await users();
  const apiRequests = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/v1/'))
      apiRequests.add(`${url.origin}${url.pathname}`);
  });

  await page.goto('/welcome');
  for (const name of ['Sign in with Apple', 'Sign in with Google'])
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeEnabled();
  await capture(page, 'welcome', '01-welcome');

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toBeVisible();
  for (const [name, document] of [
    ['Terms of Service', 'terms'],
    ['Privacy Policy', 'privacy'],
  ] as const)
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute(
      'href',
      `${journeyApiUrl}/legal/${document}`,
    );
  await capture(page, 'welcome', '02-terms');

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await capture(page, 'welcome', '03-deck');

  const guest = await page.evaluate(
    () =>
      (
        JSON.parse(
          localStorage.getItem('justgo.identity.managed.v1') ?? '{}',
        ) as { guestId?: string }
      ).guestId,
  );
  await writeProof('welcome', {
    entryPoint: 'Welcome > Continue > Terms & Privacy > Continue',
    usersBefore: before,
    usersAfter: await users(),
    guestCollection: Boolean(guest),
    apiRequests: [...apiRequests].sort(),
  });
  expect(guest).toBeTruthy();
  expect(await users()).toBe(before);
  expect(apiRequests.size).toBeGreaterThan(0);
  expect(
    [...apiRequests].filter((url) => !url.startsWith(`${journeyApiUrl}/v1/`)),
  ).toEqual([]);
});
