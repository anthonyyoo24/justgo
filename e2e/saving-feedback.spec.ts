import { test, expect } from './support/fixtures';
import { signInFixture } from './support/managed-account';
import { openSettingsLink } from './support/screens';

for (const width of [320, 390]) {
  test(`unreadable saved data never shifts the app and stays discoverable after dismissal at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await signInFixture(page);
    const surface = page.getByTestId('challenge-screen-surface');
    const accept = page.getByRole('button', {
      name: 'Accept challenge',
      exact: true,
    });
    await expect(accept).toBeEnabled();
    const baseline = await surface.boundingBox();
    if (!baseline) throw new Error('Challenge surface must be measurable');
    // The existing guarded storage fixture fails reads without changing saved bytes.
    await page.goto('/?storageRead=unreadable');
    const notice = page.getByTestId('saving-notice-overlay');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCSS('position', 'absolute');
    const unchanged = async () => {
      await expect(accept).toBeEnabled();
      await expect
        .poll(async () => {
          const current = await surface.boundingBox();
          if (!current) return Infinity;
          return Math.max(
            ...(['x', 'y', 'width', 'height'] as const).map((key) =>
              Math.abs(current[key] - baseline[key]),
            ),
          );
        })
        .toBeLessThanOrEqual(1);
    };
    await unchanged();
    await page
      .getByRole('button', {
        name: 'Review saved entries that couldn’t load',
        exact: true,
      })
      .click();
    const details = page.getByRole('dialog', {
      name: 'Saving details',
      exact: true,
    });
    await expect(details).toBeVisible();
    await expect(
      details.getByText(/Your existing data has been kept/),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Close saving details', exact: true })
      .click();
    await expect(details).toBeHidden();
    await unchanged();
    await page
      .getByRole('button', { name: 'Close saved entries warning', exact: true })
      .click();
    await expect(notice).toBeHidden();
    await unchanged();
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Progress', exact: true }),
    ).toBeVisible();
    await openSettingsLink(page).click();
    await page.getByRole('link', { name: 'Data', exact: true }).click();
    await expect(page.getByTestId('saving-recovery-panel')).toBeVisible();
    await expect(page.getByTestId('saving-notice-overlay')).toBeHidden();
  });
}

test('a dismissed storage notice stays closed when the active challenge opens over the deck', async ({
  page,
}) => {
  await signInFixture(page);
  await page.goto('/?storageRead=unreadable');
  const notices = page.getByTestId('saving-notice-overlay');
  await expect(notices).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Close saved entries warning', exact: true })
    .click();
  await expect(notices).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Completed', exact: true }),
  ).toBeVisible();
  await expect(notices).toHaveCount(0);
});
