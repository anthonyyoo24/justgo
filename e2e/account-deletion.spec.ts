import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { completeChallenge, signInFixture } from './support/managed-account';
import { localJournalEntries } from './support/journal';

const deletionCopy =
  'Your account, progress and journal on this phone, in JustGO’s cloud and in associated iCloud copies will be permanently deleted. Downloaded files you saved elsewhere remain under your control.\n\nDeleting your account does not cancel an App Store subscription. Manage subscriptions separately in your device’s Settings.';

test('managed account deletion preserves confirmation focus, survives a lost acknowledgement and clears only the deleted owner', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await signInFixture(page);
  await completeChallenge(page, 'Disposable managed deletion reflection');
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select count(*)::int as n from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows[0].n,
    )
    .toBe(1);
  await expect
    .poll(async () => (await localJournalEntries(page, account.userId)).length)
    .toBe(1);
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Delete your account?',
    exact: true,
  });
  const deleteAction = page.getByRole('button', {
    name: 'Delete account',
    exact: true,
  });
  await expect(confirmation).toHaveCount(0);
  await expect(
    deleteAction.getByText('Delete account', { exact: true }),
  ).toHaveCSS('color', 'rgb(179, 38, 30)');
  await expect(deleteAction.locator('svg path')).toHaveCount(1);
  await expect(deleteAction.locator('svg path')).toHaveAttribute(
    'stroke',
    '#B3261E',
  );
  await deleteAction.click();
  await expect(page).toHaveURL(/\/recovery$/);
  await expect(
    page.getByRole('button', { name: 'Continue to deletion', exact: true }),
  ).toHaveCount(0);
  await expect(
    confirmation.getByText(deletionCopy, { exact: true }),
  ).toBeVisible();
  const cancel = confirmation.getByRole('button', {
    name: 'Cancel',
    exact: true,
  });
  await expect(cancel).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Back', exact: true }),
  ).toHaveCount(0);
  await cancel.click();
  await expect(confirmation).toHaveCount(0);
  await expect(deleteAction).toBeFocused();
  await deleteAction.click();
  await expect(confirmation).toBeVisible();
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(deleteAction).toBeFocused();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(confirmation).toHaveCount(0);

  await page.route(`${journeyApiUrl}/v1/account`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'NOT_FOUND',
        requestId: 'fixture-missing-delete-endpoint',
      }),
    }),
  );
  await deleteAction.click();
  await confirmation
    .getByRole('button', { name: 'Delete account', exact: true })
    .click();
  await expect(confirmation.getByRole('alert')).toHaveText(
    'Account deletion is unavailable right now. Your account has not been deleted.',
  );
  await cancel.click();
  expect(
    (
      await fixtureDatabase.query(
        'select deleted_at from justgo.users where id=$1',
        [account.userId],
      )
    ).rows[0].deleted_at,
  ).toBeNull();
  expect((await localJournalEntries(page, account.userId)).length).toBe(1);
  expect(
    (
      await page.request.get(`${journeyApiUrl}/v1/auth/session`, {
        headers: { authorization: `Bearer ${account.token}` },
      })
    ).status(),
  ).toBe(200);
  await page.unroute(`${journeyApiUrl}/v1/account`);

  let releaseFirst!: () => void, releaseRetry!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const deleteProofs: string[] = [];
  await page.route(`${journeyApiUrl}/v1/account`, async (route) => {
    deleteProofs.push((await route.request().allHeaders()).authorization ?? '');
    if (deleteProofs.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await firstGate;
      await route.abort('failed');
    } else {
      await retryGate;
      await route.continue();
    }
  });
  try {
    await deleteAction.click();
    const deleteButton = confirmation.getByRole('button', {
      name: 'Delete account',
      exact: true,
    });
    await deleteButton.click();
    const spinner = confirmation.getByRole('progressbar', {
      name: 'Deleting account',
      exact: true,
    });
    await expect(spinner).toBeVisible();
    await expect(deleteButton).toBeDisabled();
    await expect(cancel).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Back', exact: true }),
    ).toHaveCount(0);
    releaseFirst();
    await expect(confirmation.getByRole('alert')).toContainText(
      'Your deletion request is saved.',
    );
    await expect(confirmation.getByRole('alert')).toHaveCSS(
      'color',
      'rgb(179, 38, 30)',
    );
    await expect(async () => {
      const [copy, error] = await Promise.all([
        confirmation.getByText(deletionCopy, { exact: true }).boundingBox(),
        confirmation.getByRole('alert').boundingBox(),
      ]);
      if (!copy || !error)
        throw new Error('Deletion copy and error must remain mounted');
      expect(error.y).toBeGreaterThanOrEqual(copy.y + copy.height);
    }).toPass();
    await cancel.click();
    await expect(confirmation).toHaveCount(0);
    await deleteAction.click();
    await deleteButton.click();
    await expect(spinner).toBeVisible();
    releaseRetry();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeVisible();
    expect(deleteProofs).toHaveLength(2);
    expect(deleteProofs[1]).toBe(deleteProofs[0]);
  } finally {
    releaseFirst();
    releaseRetry();
  }

  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Back', exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await fixtureDatabase.query(
        'select count(*)::int as n from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await fixtureDatabase.query(
        'select count(*)::int as n from justgo.journal_versions where user_id=$1',
        [account.userId],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await fixtureDatabase.query(
        'select deleted_at from justgo.users where id=$1',
        [account.userId],
      )
    ).rows[0].deleted_at,
  ).not.toBeNull();
  expect(
    await page.evaluate(
      async (owner) =>
        (await indexedDB.databases()).some(
          (database) => database.name === `justgo-journal-v1-${owner}`,
        ),
      account.userId,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      (owner) =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith(`justgo:v1:${owner}:`),
        ),
      account.userId,
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      (token) =>
        Object.values(sessionStorage).some(
          (value) => typeof value === 'string' && value.includes(token),
        ),
      account.token,
    ),
  ).toBe(false);
  expect(
    (
      await page.request.get(`${journeyApiUrl}/v1/auth/session`, {
        headers: { authorization: `Bearer ${account.token}` },
      })
    ).status(),
  ).toBe(401);
  const resurrect = await page.request.post(
    `${journeyApiUrl}/v1/auth/session`,
    {
      headers: { authorization: `Bearer ${account.token}` },
      data: { deviceId: account.deviceId },
    },
  );
  expect(resurrect.status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeVisible();
});
