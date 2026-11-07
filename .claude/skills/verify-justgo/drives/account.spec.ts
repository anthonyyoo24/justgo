import { test, expect } from '../../../../e2e/support/fixtures';
import { journeyApiUrl } from '../../../../e2e/support/environment';
import { signInFixture } from '../../../../e2e/support/managed-account';
import { capture, writeProof } from './evidence';

test('account-switch and account-logout: a signed-in fixture switches provider from Account, then logs out', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await signInFixture(page, { provider: 'apple' });
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery$/);
  const apple = page.getByRole('switch', { name: 'Apple', exact: true });
  const google = page.getByRole('switch', { name: 'Google', exact: true });
  await expect(apple).toBeChecked();
  await expect(google).not.toBeChecked();
  await expect(
    apple.getByText('You’re signed in with Apple.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Log out', exact: true }),
  ).toHaveCount(0);
  await capture(page, 'account', '01-account-apple');

  await google.click();
  await expect(page).toHaveURL(/\/account\/sign-in/);
  await capture(page, 'account', '02-switch-sign-in');
  await page
    .getByRole('button', { name: 'Sign in with Google', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(google).toBeChecked();
  await expect(apple).not.toBeChecked();
  await expect(
    google.getByText('You’re signed in with Google.', { exact: true }),
  ).toBeVisible();
  await capture(page, 'account', '03-account-google');
  const sourceRevoked = (
    await fixtureDatabase.query<{ revoked: boolean }>(
      'select revoked_at is not null as revoked from justgo.managed_auth_sessions where id=$1',
      [account.sessionId],
    )
  ).rows[0]?.revoked;
  expect(sourceRevoked).toBe(true);

  await google.click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Log out?',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await capture(page, 'account', '04-logout-dialog');

  await dialog.getByRole('button', { name: 'Log out', exact: true }).click();
  for (const method of [apple, google]) {
    await expect(method).not.toBeChecked();
    await expect(method).toBeEnabled();
  }
  await capture(page, 'account', '05-signed-out');

  const session = await page.request.get(`${journeyApiUrl}/v1/auth/session`, {
    headers: { authorization: `Bearer ${account.token}` },
  });
  await writeProof('account', {
    entryPoint:
      'Home > Open Settings > Account > Google switch > Sign in with Google > Account > Google switch > Log out',
    sourceSessionRevokedAfterSwitch: sourceRevoked,
    sourceTokenStatus: session.status(),
  });
  expect(session.status()).toBe(401);
});
