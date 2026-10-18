import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { journeyApiUrl, journeyAppUrl } from './environment';

/** Accept only the isolated fixture's draft documents, never live legal terms. */
export async function acceptFixtureTerms(page: Page) {
  await expect(page).toHaveURL(
    (url) => url.origin === journeyAppUrl && url.pathname === '/acceptance',
  );
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toBeVisible();
  for (const [name, path] of [
    ['Terms of Service', 'terms'],
    ['Privacy Policy', 'privacy'],
  ] as const)
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute(
      'href',
      `${journeyApiUrl}/legal/${path}`,
    );
  await page.getByRole('button', { name: 'I Accept', exact: true }).click();
}
