import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';

for (const provider of ['apple', 'google'] as const) {
  test(`${provider} keeps both provider buttons fixed through authorization, access and challenge preparation`, async ({
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
      const actions = [
        'Sign in with Apple',
        'Sign in with Google',
        'Continue',
      ].map((name) => page.getByRole('button', { name, exact: true }));
      for (const action of actions) {
        await expect(action).toBeVisible();
        await expect(action).toBeEnabled();
      }
      await expect(
        page.getByText(/Signing in saves your challenge history/),
      ).toBeVisible();
      const initialPositions = await Promise.all(
        actions.map((action) => action.boundingBox()),
      );
      if (initialPositions.some((position) => !position))
        throw new Error('Welcome actions must be measurable before sign-in');
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
        await expect(page).toHaveURL(/\/welcome$/);
        await expect(button).toBeDisabled();
        await expect(button).toHaveAttribute('aria-busy', 'true');
        await expect(button).toHaveText('');
        await expect(spinner).toBeVisible();
        for (const action of actions) {
          await expect(action).toBeVisible();
          await expect(action).toBeDisabled();
        }
        await expect(
          page.getByText('Checking your access…', { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
        ).toHaveCount(0);
        await expect(async () => {
          const positions = await Promise.all(
            actions.map((action) => action.boundingBox()),
          );
          for (let index = 0; index < positions.length; index++) {
            const position = positions[index];
            const initial = initialPositions[index];
            if (!position || !initial)
              throw new Error('Every Welcome action must remain measurable');
            for (const axis of ['x', 'y', 'width', 'height'] as const)
              expect(
                Math.abs(position[axis] - initial[axis]),
              ).toBeLessThanOrEqual(1);
          }
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

test('Welcome retains provider failure and retries directly without a second sign-in screen', async ({
  page,
}) => {
  await page.route(`${journeyApiUrl}/__fixtures/provider-sessions`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAVAILABLE',
        requestId: 'welcome-sign-in-fixture',
      }),
    }),
  );
  await page.goto('/welcome');
  const google = page.getByRole('button', {
    name: 'Sign in with Google',
    exact: true,
  });
  await google.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Couldn’t finish connecting. Please try again. Your saved data was kept.',
  );
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(google).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeEnabled();
  await page.unroute(`${journeyApiUrl}/__fixtures/provider-sessions`);
  await google.click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Welcome retries failed challenge preparation without repeating provider authorization', async ({
  page,
}) => {
  let authorizations = 0;
  page.on('request', (request) => {
    if (request.url() === `${journeyApiUrl}/__fixtures/provider-sessions`)
      authorizations++;
  });
  await page.route(`${journeyApiUrl}/v1/challenges`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAVAILABLE',
        requestId: 'welcome-catalog-fixture',
      }),
    }),
  );
  await page.goto('/welcome');
  await page
    .getByRole('button', { name: 'Sign in with Google', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Your challenges couldn’t load. Check your connection and try again.',
  );
  await expect(page).toHaveURL(/\/welcome$/);
  const retry = page.getByRole('button', {
    name: 'Retry connection',
    exact: true,
  });
  await expect(retry).toHaveCount(1);
  await expect(retry).toBeEnabled();
  for (const name of ['Sign in with Apple', 'Sign in with Google']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name, exact: true }),
    ).toBeDisabled();
  }
  const continueButton = page.getByRole('button', {
    name: 'Continue',
    exact: true,
  });
  await expect(continueButton).toBeDisabled();
  for (const viewport of [
    { width: 320, height: 611 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(continueButton).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
    await expect(retry).toBeInViewport({ ratio: 1 });
  }
  await page.unroute(`${journeyApiUrl}/v1/challenges`);
  await retry.click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  expect(authorizations).toBe(1);
});
