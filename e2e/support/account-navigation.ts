import type { Page } from '@playwright/test';
import { expect } from './fixtures';

// Use the real header navigation without reloading the memory-only web account.
// Recovery after device revocation can retain another account screen in history.
export async function leaveAccountScreens(page: Page) {
  await expect(
    page.getByRole('link', { name: 'Back to app', exact: true }),
  ).toHaveCount(0);
  for (let steps = 0; steps < 6; steps++) {
    if (
      !/^\/(?:recovery|account(?:\/[^/]+)?|settings)\/?$/.test(
        new URL(page.url()).pathname,
      )
    )
      return;
    await page
      .getByRole('button', { name: 'Back', exact: true })
      .filter({ visible: true })
      .click();
  }
  await expect(page).not.toHaveURL(
    /\/(?:recovery|account\/[^/]+|settings)\/?$/,
  );
}
