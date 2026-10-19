import { test, expect } from '@playwright/test';

// This is the ordinary production export. Never bootstrap an account or send
// synthetic credentials to its configured API; all permitted traffic is static.
test('the production export loads its assets and supporting routes without API traffic', async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Exported web smoke requires a static origin');
  const origin = new URL(baseURL).origin;
  expect(new URL(origin).hostname).toBe('127.0.0.1');
  const forbidden: string[] = [];
  const apiRequests: string[] = [];
  const failedAssets: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^\/v1(?:\/|$)/.test(url.pathname)) apiRequests.push(url.pathname);
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedAssets.push(new URL(response.url()).pathname);
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /^\/v1(?:\/|$)/.test(url.pathname)) {
      forbidden.push(url.pathname);
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  await page.goto('/recovery');
  await expect(
    page.getByRole('button', { name: 'Create a new account', exact: true }),
  ).toBeVisible();
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export my data', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Test haptics', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Test error reporting', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Account & recovery', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Create a new account', exact: true }),
  ).toBeVisible();
  await page.goto('/no-such-export-route');
  await expect(
    page.getByRole('heading', { name: 'Page not found', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go home', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);
  expect(apiRequests).toEqual([]);
  expect(forbidden).toEqual([]);
});
