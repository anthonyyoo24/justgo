import { test, expect } from '../../../../e2e/support/fixtures';
import {
  journeyApiPath,
  journeyApiUrl,
} from '../../../../e2e/support/environment';
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
    if ((journeyApiPath(request.url()) ?? url.pathname).startsWith('/v1/'))
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

test('welcome-small-failure: Continue stays in view on small screens when challenges fail to load', async ({
  page,
}) => {
  await page.goto('/welcome');
  const continueButton = page.getByRole('button', {
    name: 'Continue',
    exact: true,
  });
  await expect(continueButton).toBeEnabled();
  for (let step = 0; step < 3; step++) await page.keyboard.press('Tab');
  await expect(continueButton).toBeFocused();

  await page.route(`${journeyApiUrl}/v1/challenges`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAVAILABLE', requestId: 'drive-fixture' }),
    }),
  );
  await page
    .getByRole('button', { name: 'Sign in with Google', exact: true })
    .click();
  const retry = page.getByRole('button', {
    name: 'Retry connection',
    exact: true,
  });
  const google = page.getByRole('button', {
    name: 'Sign in with Google',
    exact: true,
  });
  await expect(retry).toBeEnabled();
  const placement: Record<string, object> = {};
  for (const viewport of [
    { width: 320, height: 611 },
    { width: 375, height: 667 },
  ]) {
    const size = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await expect(continueButton).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
    await expect(retry).toBeInViewport({ ratio: 1 });
    await capture(page, 'welcome', `04-failure-${size}`);
    await google.evaluate((button) =>
      button.scrollIntoView({ block: 'center' }),
    );
    // The last row meets the scroll edge, where a subpixel can stay clipped.
    await expect(google).toBeInViewport({ ratio: 0.99 });
    await expect(continueButton).toBeInViewport({ ratio: 1 });
    await capture(page, 'welcome', `05-failure-${size}-scrolled`);
    placement[size] = {
      continue: await continueButton.boundingBox(),
      google: await google.boundingBox(),
    };
  }
  await page.unroute(`${journeyApiUrl}/v1/challenges`);
  await writeProof('welcome-small-failure', { viewport: placement });
});
