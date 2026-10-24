import type {} from '../apps/mobile/test-support/journey-storage';
import type { Page } from '@playwright/test';
import { accessResponseSchema } from '@justgo/contracts';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { continueAsGuest, signInFixture } from './support/managed-account';
import { localJournalEntries } from './support/journal';

async function approveBeta(page: Page, mode: 'guest' | 'account') {
  const expiresAt = Date.now() + 300_000;
  const accessUrl = `${journeyApiUrl}/v1/${mode === 'guest' ? 'guest/' : ''}access`;
  // Only this case's loopback server responses carry the approved beta window.
  // Identity, catalog, storage and navigation remain the actual application.
  await page.route(accessUrl, async (route) => {
    const response = await route.fetch();
    const access = accessResponseSchema.parse(await response.json());
    expect(access.status).toBe('verified');
    await route.fulfill({
      response,
      json: {
        ...access,
        source: 'free_beta',
        expiresAt: new Date(expiresAt).toISOString(),
      },
    });
  });
  const owner =
    mode === 'guest'
      ? await continueAsGuest(page)
      : (await signInFixture(page)).userId;
  const key = `justgo:v1:${owner}:access:${mode}:${encodeURIComponent(journeyApiUrl)}`;
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const approval = localStorage.getItem(key);
        return (
          approval !== null &&
          localStorage.getItem(`${key}:recovery`) === approval
        );
      }, key),
    )
    .toBe(true);
  return { owner, expiresAt };
}

test('a server denial survives offline restart even when old approval removal fails', async ({
  page,
}) => {
  const { owner, expiresAt } = await approveBeta(page, 'guest');
  const key = `justgo:v1:${owner}:access:guest:${encodeURIComponent(journeyApiUrl)}`;
  const previous = await page.evaluate((key) => localStorage.getItem(key), key);
  expect(previous).not.toBeNull();
  // Preserve the stale cache bytes deliberately; the separately persisted denial
  // must close admission on a new document, independently of optional cleanup.
  await page.addInitScript((key) => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (candidate: string) {
      if (candidate === key)
        throw new Error('Disposable approval cleanup failure');
      remove.call(this, candidate);
    };
  }, key);
  const accessUrl = `${journeyApiUrl}/v1/guest/access`;
  await page.route(accessUrl, (route) =>
    route.fulfill({
      json: {
        status: 'unpaid',
        source: 'free_beta',
        checkedAt: new Date().toISOString(),
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your next step awaits.', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(`${key}:recovery`), key),
    )
    .toBe('denied:v1');
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    previous,
  );
  await page.route(`${journeyApiUrl}/v1/**`, (route) =>
    route.abort('internetdisconnected'),
  );
  await page.reload();
  const accept = page.getByRole('button', {
    name: 'Accept challenge',
    exact: true,
  });
  await expect(
    page.getByRole('heading', {
      name: 'We can’t verify access yet.',
      exact: true,
    }),
  ).toBeVisible();
  await expect(accept).toHaveCount(0);
  await page
    .getByRole('link', { name: 'View saved history', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Progress', exact: true }),
  ).toBeVisible();

  await page.unroute(`${journeyApiUrl}/v1/**`);
  await page.unroute(accessUrl);
  await page.route(accessUrl, (route) =>
    route.fulfill({
      json: {
        status: 'verified',
        source: 'free_beta',
        checkedAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
      },
    }),
  );
  await page.goto('/');
  await expect(accept).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const approval = localStorage.getItem(key);
        return (
          approval !== null &&
          localStorage.getItem(`${key}:recovery`) === approval
        );
      }, key),
    )
    .toBe(true);
  await page.route(`${journeyApiUrl}/v1/**`, (route) =>
    route.abort('internetdisconnected'),
  );
  await page.reload();
  await expect(accept).toBeVisible();
});

for (const mode of ['guest', 'account'] as const) {
  test(`${mode} beta approval survives offline relaunch until expiry and preserves an admitted challenge`, async ({
    page,
  }) => {
    await page.clock.install();
    const { owner, expiresAt } = await approveBeta(page, mode);
    await page.route(`${journeyApiUrl}/v1/**`, (route) =>
      route.abort('internetdisconnected'),
    );
    await page.clock.fastForward(61_000);
    await page.reload();
    const accept = page.getByRole('button', {
      name: 'Accept challenge',
      exact: true,
    });
    await expect(accept).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Loading JustGO', exact: true }),
    ).toHaveCount(0);
    await accept.click();
    await expect(
      page.getByRole('button', { name: 'Completed', exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(
      Math.max(0, expiresAt - (await page.evaluate(() => Date.now()))),
    );
    await expect(
      page.getByRole('button', { name: 'Completed', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Completed', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page
      .getByLabel('Your reflection', { exact: true })
      .fill('Disposable beta expiry reflection.');
    await page
      .getByRole('button', { name: 'Save Reflection', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'We can’t verify access yet.',
        exact: true,
      }),
    ).toBeVisible();
    await expect(accept).toHaveCount(0);
    expect((await localJournalEntries(page, owner))[0]?.reflection.text).toBe(
      'Disposable beta expiry reflection.',
    );
    await page
      .getByRole('link', { name: 'View saved history', exact: true })
      .click();
    await expect(page.getByTestId('progress-value-reps')).toHaveText('1');
    await page.reload();
    await expect(page.getByTestId('progress-value-reps')).toHaveText('1');
    await page.goto('/challenge');
    await expect(
      page.getByRole('button', { name: 'Completed', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', {
        name: 'We can’t verify access yet.',
        exact: true,
      }),
    ).toBeVisible();
  });
}

test('beta expiry retains newer reflection input during a slow local save', async ({
  page,
}) => {
  await page.clock.install();
  const { owner, expiresAt } = await approveBeta(page, 'guest');
  await page.route(`${journeyApiUrl}/v1/**`, (route) =>
    route.abort('internetdisconnected'),
  );
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('First submitted input.');
  await page.evaluate(() => {
    globalThis.justgoJournalFaults.privateMode = 'blocked';
  });
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Newer unsent input after expiry.');
  await page.clock.fastForward(
    Math.max(0, expiresAt - (await page.evaluate(() => Date.now()))),
  );
  await expect(page.getByLabel('Your reflection', { exact: true })).toHaveValue(
    'Newer unsent input after expiry.',
  );
  await page.evaluate(() => globalThis.justgoJournalFaults.release());
  await expect(
    page.getByRole('button', { name: 'Save Reflection', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Your reflection', { exact: true })).toHaveValue(
    'Newer unsent input after expiry.',
  );
  expect((await localJournalEntries(page, owner))[0]?.reflection.text).toBe(
    'First submitted input.',
  );
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'We can’t verify access yet.',
      exact: true,
    }),
  ).toBeVisible();
  expect((await localJournalEntries(page, owner))[0]?.reflection.text).toBe(
    'Newer unsent input after expiry.',
  );
});
