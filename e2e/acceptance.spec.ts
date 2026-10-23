import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { continueFromTerms } from './support/acceptance';
import { signInFixture } from './support/managed-account';

function observeMutations(page: Page) {
  const mutations: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.origin === journeyApiUrl &&
      url.pathname.startsWith('/v1/') &&
      request.method() !== 'GET'
    )
      mutations.push(`${request.method()} ${url.pathname}`);
  });
  return mutations;
}

test('Welcome shows provider logos above Continue, opens direct documents and continues as a guest without creating an account', async ({
  page,
  fixtureDatabase,
}) => {
  const mutations = observeMutations(page);
  const before = await fixtureDatabase.query<{ count: number }>(
    'select count(*)::int as count from justgo.users',
  );
  await page.goto('/welcome');
  const apple = page.getByRole('button', {
    name: 'Sign in with Apple',
    exact: true,
  });
  const google = page.getByRole('button', {
    name: 'Sign in with Google',
    exact: true,
  });
  const continueButton = page.getByRole('button', {
    name: 'Continue',
    exact: true,
  });
  for (const viewport of [
    { width: 320, height: 611 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(apple).toBeVisible();
    await expect(google).toBeVisible();
    await expect(continueButton).toBeVisible();
    await expect(apple.locator('svg')).toHaveCount(1);
    await expect(google.locator('svg')).toHaveCount(1);
    await expect(async () => {
      const [a, g, c] = await Promise.all([
        apple.boundingBox(),
        google.boundingBox(),
        continueButton.boundingBox(),
      ]);
      if (!a || !g || !c) throw new Error('Welcome actions must be measurable');
      expect(a.y + a.height).toBeLessThanOrEqual(g.y);
      expect(g.y + g.height).toBeLessThanOrEqual(c.y);
      expect(Math.abs(a.x - g.x)).toBeLessThanOrEqual(1);
      expect(a.height).toBeGreaterThanOrEqual(48);
      expect(g.height).toBeGreaterThanOrEqual(48);
    }).toPass();
  }
  await continueButton.click();
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toBeVisible();
  const disclosure = page.getByText(/^You can use JustGO without signing in\./);
  await expect(disclosure).toContainText(
    'feelings and reflections stay on this phone',
  );
  await expect(disclosure).toContainText(
    'your account data syncs through JustGO’s cloud service',
  );
  await expect(disclosure).toContainText(
    'first sign-in includes the entries you’ve saved on this phone',
  );
  await expect(disclosure).toContainText(
    'We don’t sell your personal information',
  );
  expect(mutations).toEqual([]);
  for (const [name, path] of [
    ['Terms of Service', 'terms'],
    ['Privacy Policy', 'privacy'],
  ] as const) {
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name, exact: true }).click();
    const popup = await popupPromise;
    try {
      await expect(popup).toHaveURL(`${journeyApiUrl}/legal/${path}`);
      await expect(popup.getByText(/Development draft/i)).toBeVisible();
    } finally {
      await popup.close();
    }
  }
  await continueFromTerms(page);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  const state = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem('justgo.identity.managed.v1') ?? '{}',
      ) as {
        mode: string;
        guestId: string;
        collection: { id: string; kind: string };
        account: unknown;
      },
  );
  expect(state).toMatchObject({
    mode: 'guest',
    account: null,
    collection: { id: state.guestId, kind: 'guest' },
  });
  expect(mutations).toEqual([]);
  expect(
    (
      await fixtureDatabase.query(
        'select count(*)::int as count from justgo.users',
      )
    ).rows,
  ).toEqual(before.rows);
  expect(
    (
      await fixtureDatabase.query(
        "select to_regclass('justgo.account_acceptances') as name",
      )
    ).rows,
  ).toEqual([{ name: null }]);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});

for (const provider of ['apple', 'google'] as const)
  test(`${provider} first explains cloud sync without any account mutation until the provider action`, async ({
    page,
  }) => {
    const mutations = observeMutations(page);
    await page.goto('/welcome');
    const name = `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}`;
    await page.getByRole('button', { name, exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Keep your data with your account',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Signing in saves your challenge history, feelings and reflections/,
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByLabel('Recovery key', { exact: true })).toHaveCount(
      0,
    );
    expect(mutations).toEqual([]);
  });

test('a returning provider account skips legal tracking and reopens the same saved collection', async ({
  page,
}) => {
  const mutations = observeMutations(page);
  const account = await signInFixture(page, { provider: 'google' });
  await page.goto('/recovery');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm log out', exact: true })
    .click();
  await expect(
    page.getByText('Signed out. Your saved data remains on this phone.', {
      exact: true,
    }),
  ).toBeVisible();
  const returning = await signInFixture(page, {
    provider: 'google',
    subjectHandle: account.subjectHandle,
  });
  expect(returning.userId).toBe(account.userId);
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toHaveCount(0);
  expect(
    mutations.filter((request) => /acceptance|\/v1\/sessions/.test(request)),
  ).toEqual([]);
});
