import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { continueAsGuest, signInFixture } from './support/managed-account';

for (const mode of ['guest', 'account'] as const) {
  test(`${mode} cold startup stays quiet until admission succeeds`, async ({
    page,
  }) => {
    if (mode === 'guest') await continueAsGuest(page);
    else await signInFixture(page);

    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const accessUrl = `${journeyApiUrl}/v1/${mode === 'guest' ? 'guest/' : ''}access`;
    await page.route(accessUrl, async (route) => {
      await pending;
      await route.continue();
    });
    try {
      const accessRequested = page.waitForRequest(accessUrl);
      await page.reload();
      await accessRequested;
      const loading = page.getByRole('progressbar', {
        name: 'Loading JustGO',
        exact: true,
      });
      await expect(loading).toBeVisible();
      await expect(page).toHaveURL(/\/access$/);
      const canvas = await loading.boundingBox();
      const viewport = page.viewportSize();
      if (!canvas || !viewport) throw new Error('Startup canvas is missing');
      expect(canvas.y).toBe(0);
      expect(canvas.height).toBe(viewport.height);
      const mark = loading.locator('img');
      await expect(mark).toBeVisible();
      await expect(mark).toHaveJSProperty('naturalWidth', 425);
      const markBounds = await mark.boundingBox();
      if (!markBounds) throw new Error('Startup mark is missing');
      expect(markBounds.width).toBe(194);
      expect(markBounds.y + markBounds.height / 2).toBe(viewport.height / 2);
      await expect(loading).toHaveCSS('background-color', 'rgb(249, 239, 232)');
      expect(
        await loading.evaluate(
          (element) => element.getAnimations({ subtree: true }).length,
        ),
      ).toBe(0);
      await expect(
        page.getByText('Checking your access…', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText('Your account is connected.', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText('Checking access for this phone.', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Check access again', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Preview app screens', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Accept challenge', exact: true }),
      ).toHaveCount(0);
      release();
      await expect(
        page.getByRole('button', { name: 'Accept challenge', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('progressbar', { name: 'Loading JustGO', exact: true }),
      ).toHaveCount(0);
    } finally {
      release();
    }
  });
}

test('failed startup leaves loading and retains saved history and access retry', async ({
  page,
}) => {
  await continueAsGuest(page);
  const accessUrl = `${journeyApiUrl}/v1/guest/access`;
  await page.route(accessUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'unavailable',
        checkedAt: new Date().toISOString(),
      }),
    }),
  );
  await page.reload();
  await expect(
    page.getByText('We can’t verify access yet.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Loading JustGO', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: 'View saved history', exact: true })
    .click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(
    page.getByRole('heading', { name: 'Progress', exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByText('We can’t verify access yet.', { exact: true }),
  ).toBeVisible();
  await page.unroute(accessUrl);
  await page
    .getByRole('button', { name: 'Check access again', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
});
