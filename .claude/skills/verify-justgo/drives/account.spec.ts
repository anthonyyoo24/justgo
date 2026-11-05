import { test, expect } from '../../../../e2e/support/fixtures';
import { journeyApiUrl } from '../../../../e2e/support/environment';
import { signInFixture } from '../../../../e2e/support/managed-account';
import { capture, writeProof } from './evidence';

test('account-logout: a signed-in fixture opens Account from Settings and logs out', async ({
  page,
}) => {
  const account = await signInFixture(page);
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery$/);
  await expect(
    page.getByRole('switch', { name: 'Apple', exact: true }),
  ).toBeChecked();
  await capture(page, 'account', '01-account');

  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Log out?',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await capture(page, 'account', '02-logout-dialog');

  await dialog.getByRole('button', { name: 'Log out', exact: true }).click();
  for (const provider of ['Apple', 'Google']) {
    const method = page.getByRole('switch', { name: provider, exact: true });
    await expect(method).not.toBeChecked();
    await expect(method).toBeEnabled();
  }
  await capture(page, 'account', '03-signed-out');

  const session = await page.request.get(`${journeyApiUrl}/v1/auth/session`, {
    headers: { authorization: `Bearer ${account.token}` },
  });
  await writeProof('account', {
    entryPoint: 'Home > Open Settings > Account > Log out',
    revokedSessionStatus: session.status(),
  });
  expect(session.status()).toBe(401);
});
