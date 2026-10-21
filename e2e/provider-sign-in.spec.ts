import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';

for (const provider of ['apple', 'google'] as const) {
  test(`${provider} keeps one button spinner through authorization, access and challenge preparation`, async ({
    page,
  }) => {
    const providerLabel = provider === 'apple' ? 'Apple' : 'Google';
    const buttonName = `Sign in with ${providerLabel}`;
    let authorize = () => {};
    let admit = () => {};
    let prepare = () => {};
    const authorization = new Promise<void>((resolve) => {
      authorize = resolve;
    });
    const access = new Promise<void>((resolve) => {
      admit = resolve;
    });
    const catalog = new Promise<void>((resolve) => {
      prepare = resolve;
    });
    await page.route(
      `${journeyApiUrl}/__fixtures/provider-sessions`,
      async (route) => {
        await authorization;
        await route.continue();
      },
    );
    await page.route(`${journeyApiUrl}/v1/access`, async (route) => {
      await access;
      await route.continue();
    });
    await page.route(`${journeyApiUrl}/v1/challenges`, async (route) => {
      await catalog;
      await route.continue();
    });
    try {
      await page.goto('/welcome');
      await page.getByRole('button', { name: buttonName, exact: true }).click();
      await expect(
        page.getByRole('heading', {
          name: 'Keep your data with your account',
          exact: true,
        }),
      ).toBeVisible();
      const button = page.getByRole('button', {
        name: buttonName,
        exact: true,
      });
      await expect(button).toBeEnabled();
      const before = await button.boundingBox();
      if (!before) throw new Error('Sign-in button must be measurable');
      const spinner = button.getByRole('progressbar', {
        name: `Signing in with ${providerLabel}`,
        exact: true,
      });
      const expectBusy = async () => {
        await expect(page).toHaveURL(
          new RegExp(`/account/sign-in\\?provider=${provider}$`),
        );
        await expect(button).toBeDisabled();
        await expect(button).toHaveAttribute('aria-busy', 'true');
        await expect(button).toHaveText('');
        await expect(spinner).toBeVisible();
        await expect(
          page.getByText('Checking your access…', { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
        ).toHaveCount(0);
        await expect(async () => {
          const [action, indicator] = await Promise.all([
            button.boundingBox(),
            spinner.boundingBox(),
          ]);
          if (!action || !indicator)
            throw new Error('Busy button and spinner must be measurable');
          expect(Math.abs(action.height - before.height)).toBeLessThanOrEqual(
            1,
          );
          expect(
            Math.abs(
              action.x + action.width / 2 - indicator.x - indicator.width / 2,
            ),
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(
              action.y + action.height / 2 - indicator.y - indicator.height / 2,
            ),
          ).toBeLessThanOrEqual(1);
        }).toPass();
      };
      await button.click();
      await expectBusy();
      const accessRequested = page.waitForRequest(`${journeyApiUrl}/v1/access`);
      authorize();
      await accessRequested;
      await expectBusy();
      const catalogRequested = page.waitForRequest(
        `${journeyApiUrl}/v1/challenges`,
      );
      admit();
      await catalogRequested;
      await expectBusy();
      prepare();
      await expect(
        page.getByRole('button', { name: 'Accept challenge', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Checking your access…', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('progressbar', {
          name: `Signing in with ${providerLabel}`,
          exact: true,
        }),
      ).toHaveCount(0);
    } finally {
      authorize();
      admit();
      prepare();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
