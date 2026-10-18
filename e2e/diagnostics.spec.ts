import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { acceptFixtureTerms } from './support/acceptance';

const ingestion =
  'https://o123.ingest.us.sentry.io/api/4512279181459456/envelope/';
async function openDiagnostics(page: Page, providerStatus = 200) {
  const bodies: string[] = [];
  await page.route(ingestion, async (route) => {
    const body = route.request().postData();
    if (body) bodies.push(body);
    await route.fulfill({
      status: providerStatus,
      contentType: 'application/json',
      body: '{}',
    });
  });
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await acceptFixtureTerms(page);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await page
    .getByRole('link', { name: 'Test error reporting', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Diagnostics preview', exact: true }),
  ).toBeVisible();
  return bodies;
}

for (const providerStatus of [200, 503])
  test(`the real SDK scrubs route errors and preserves retry with provider status ${providerStatus}`, async ({
    page,
  }) => {
    const bodies = await openDiagnostics(page, providerStatus);
    await page
      .getByRole('button', { name: 'Trigger test error', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Something went wrong', exact: true }),
    ).toBeVisible();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).not.toContain('synthetic diagnostic fixture failure');
    const event = JSON.parse(bodies[0]!.split('\n')[2]!);
    expect(event).toMatchObject({
      environment: 'development',
      user: { ip_address: '0.0.0.0' },
      exception: {
        values: [{ value: 'The application encountered an error.' }],
      },
    });
    for (const excluded of [
      'request',
      'breadcrumbs',
      'extra',
      'tags',
      'transaction',
      'modules',
    ])
      expect(event).not.toHaveProperty(excluded);
    expect(event.user).toEqual({ ip_address: '0.0.0.0' });
    await mkdir('.local/sentry-setup', { recursive: true });
    await writeFile(
      '.local/sentry-setup/browser-test-envelope.json',
      JSON.stringify(event),
    );
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    // Root recovery remounts the memory-only web identity. It must offer a usable
    // fresh start rather than replaying the failed screen or blocking on delivery.
    await expect(
      page.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeEnabled();
  });

test('the real SDK captures and scrubs unhandled rejections', async ({
  page,
}) => {
  const bodies = await openDiagnostics(page);
  // Expo's development overlay covers controls after an unhandled rejection.
  // Keep this last; release/native recovery is a separate signed-build gate.
  await page
    .getByRole('button', { name: 'Trigger test rejection', exact: true })
    .click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).not.toContain('synthetic rejection fixture');
});
