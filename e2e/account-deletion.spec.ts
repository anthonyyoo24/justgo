import { sessionCreateSchema, sessionResponseSchema } from '@justgo/contracts';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { leaveAccountScreens } from './support/account-navigation';

test('Settings permanently deletes the owned account and retries a lost acknowledgement without resurrecting it', async ({
  page,
  fixtureDatabase,
}) => {
  let releaseArtwork!: () => void, releaseTexture!: () => void;
  const artworkResponse = new Promise<void>((resolve) => {
    releaseArtwork = resolve;
  });
  const textureResponse = new Promise<void>((resolve) => {
    releaseTexture = resolve;
  });
  let artworkLoaded = false,
    textureRequested = false;
  await page.route(
    (url) =>
      /\/assets\/challenges\/(?:streets(?:-cream)?|paper-texture)\.png/.test(
        decodeURIComponent(url.href),
      ),
    async (route) => {
      const texture = route.request().url().includes('paper-texture');
      if (texture) textureRequested = true;
      await (texture ? textureResponse : artworkResponse);
      if (!page.isClosed()) await route.continue();
      if (!texture) artworkLoaded = true;
    },
  );
  page.on('close', () => {
    releaseArtwork();
    releaseTexture();
  });
  await page.goto('/recovery');
  const creating = page.waitForRequest(
    (r) => r.url() === `${journeyApiUrl}/v1/sessions` && r.method() === 'POST',
  );
  const created = page.waitForResponse(
    (r) =>
      r.url() === `${journeyApiUrl}/v1/sessions` &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a new account', exact: true })
    .click();
  const proof = sessionCreateSchema.parse((await creating).postDataJSON());
  const account = sessionResponseSchema.parse(await (await created).json());
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await fixtureDatabase.query(
    `insert into justgo.attempts (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone,reflection_text,reflection_revision)
    select $1,gen_random_uuid(),v.venue_id,c.id,c.level_id,now(),'2026-10-14','America/Toronto','Disposable deletion journey',1
    from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id limit 1`,
    [account.userId],
  );
  await leaveAccountScreens(page);
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith(`justgo:v1:${id}:`),
          ).length,
        account.userId,
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Delete account', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Delete your account?',
    exact: true,
  });
  const continueButton = page.getByRole('button', {
    name: 'Continue to deletion',
    exact: true,
  });
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Cancel subscription', exact: true }),
  ).toBeVisible();
  await continueButton.click();
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByText(
      'Your account, progress, feelings and reflections will be permanently deleted. You won’t be able to recover this account.',
      { exact: true },
    ),
  ).toBeVisible();
  const cancel = confirmation.getByRole('button', {
    name: 'Cancel',
    exact: true,
  });
  await expect(cancel).toBeFocused();
  // The covered page stays out of keyboard and accessibility navigation.
  await expect(
    page.getByRole('button', { name: 'Back', exact: true }),
  ).toHaveCount(0);
  await cancel.click();
  await expect(confirmation).toHaveCount(0);
  await expect(continueButton).toBeFocused();
  await continueButton.click();
  await expect(confirmation).toBeVisible();
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(continueButton).toBeFocused();
  expect(
    (
      await fixtureDatabase.query(
        'select deleted_at from justgo.users where id=$1',
        [account.userId],
      )
    ).rows[0].deleted_at,
  ).toBeNull();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Delete account', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await continueButton.click();
  const unavailableMessage =
    'Account deletion is unavailable right now. Your account has not been deleted.';
  await page.route(`${journeyApiUrl}/v1/account`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'NOT_FOUND',
        requestId: 'missing-endpoint',
      }),
    }),
  );
  await confirmation
    .getByRole('button', { name: 'Delete account', exact: true })
    .click();
  await expect(confirmation.getByRole('alert')).toHaveText(unavailableMessage);
  await expect(page.getByText(/recovery request wasn’t found/)).toHaveCount(0);
  await cancel.click();
  await expect(continueButton).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect account', exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.get(`${journeyApiUrl}/v1/sessions/current`, {
        headers: {
          authorization: `Bearer ${'sessionToken' in proof ? proof.sessionToken : ''}`,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await fixtureDatabase.query(
        'select deleted_at from justgo.users where id=$1',
        [account.userId],
      )
    ).rows[0].deleted_at,
  ).toBeNull();
  await page.unroute(`${journeyApiUrl}/v1/account`);
  await continueButton.click();
  let lost = true;
  let releaseFirst!: () => void, releaseRetry!: () => void;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const retryResponse = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await page.route(`${journeyApiUrl}/v1/account`, async (route) => {
    if (lost) {
      lost = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await firstResponse;
      await route.abort('failed');
    } else {
      await retryResponse;
      await route.continue();
    }
  });
  try {
    await confirmation
      .getByRole('button', { name: 'Delete account', exact: true })
      .click();
    const deleteButton = confirmation.getByRole('button', {
      name: 'Delete account',
      exact: true,
    });
    const spinner = confirmation.getByRole('progressbar', {
      name: 'Deleting account',
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await expect(spinner).toBeVisible();
    await expect(deleteButton).toBeDisabled();
    await expect(
      deleteButton.getByText('Delete account', { exact: true }),
    ).toHaveCount(0);
    await expect(cancel).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Back', exact: true }),
    ).toHaveCount(0);
    releaseFirst();
    await expect(confirmation.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(confirmation.getByRole('alert')).toHaveCSS(
      'color',
      'rgb(179, 38, 30)',
    );
    await expect
      .poll(async () => {
        const copy = await confirmation
          .getByText(
            'Your account, progress, feelings and reflections will be permanently deleted. You won’t be able to recover this account.',
            { exact: true },
          )
          .boundingBox();
        const error = await confirmation.getByRole('alert').boundingBox();
        if (!copy || !error)
          throw new Error('Modal copy and error must stay mounted');
        return error.y >= copy.y + copy.height;
      })
      .toBe(true);
    await expect(spinner).toHaveCount(0);
    await expect(deleteButton).toBeEnabled();
    await cancel.click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Finish deletion', exact: true })
      .click();
    await expect(confirmation.getByRole('alert')).toBeVisible();
    await deleteButton.click();
    await expect(spinner).toBeVisible();
    await expect(confirmation.getByRole('alert')).toHaveCount(0);
    releaseRetry();
    await expect(
      page.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(confirmation).toHaveCount(0);
  } finally {
    releaseFirst();
    releaseRetry();
  }
  expect(
    (
      await fixtureDatabase.query(
        'select count(*)::int as n from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    await page.evaluate(
      (id) =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith(`justgo:v1:${id}:`),
        ),
      account.userId,
    ),
  ).toEqual([]);
  expect(
    (
      await page.request.get(`${journeyApiUrl}/v1/sessions/current`, {
        headers: {
          authorization: `Bearer ${'sessionToken' in proof ? proof.sessionToken : ''}`,
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post(`${journeyApiUrl}/v1/sessions`, {
        data: { ...proof, kind: 'bootstrap' },
      })
    ).status(),
  ).toBe(401);
  await expect(
    page.getByRole('button', { name: 'Back', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);
  await expect(page).toHaveURL(/\/welcome$/);
  let releaseCreation!: () => void;
  const creationResponse = new Promise<void>((resolve) => {
    releaseCreation = resolve;
  });
  let releaseAccess!: () => void;
  const accessResponse = new Promise<void>((resolve) => {
    releaseAccess = resolve;
  });
  await page.route(`${journeyApiUrl}/v1/access`, async (route) => {
    await accessResponse;
    await route.continue();
  });
  let releaseCatalog!: () => void;
  const catalogResponse = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });
  let failCatalog = true;
  let catalogRequests = 0;
  await page.route(`${journeyApiUrl}/v1/challenges`, async (route) => {
    catalogRequests++;
    await catalogResponse;
    if (failCatalog)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'UNAVAILABLE',
          requestId: 'welcome-catalog-retry',
        }),
      });
    else await route.continue();
  });
  let firstCreation = true;
  let replacementAccount:
    ReturnType<typeof sessionResponseSchema.parse> | undefined;
  const replacementProofs: unknown[] = [];
  await page.route(`${journeyApiUrl}/v1/sessions`, async (route) => {
    replacementProofs.push(route.request().postDataJSON());
    if (firstCreation) {
      firstCreation = false;
      const response = await route.fetch();
      replacementAccount = sessionResponseSchema.parse(await response.json());
      await creationResponse;
      await route.abort('failed');
    } else await route.continue();
  });
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  try {
    await next.click();
    await expect(
      page.getByRole('progressbar', {
        name: 'Creating your account',
        exact: true,
      }),
    ).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(next.getByText('Continue', { exact: true })).toHaveCount(0);
    releaseCreation();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(next).toBeEnabled();
    const checkingAccess = page.waitForRequest(`${journeyApiUrl}/v1/access`);
    await next.click();
    await checkingAccess;
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole('heading', { name: 'JustGO', exact: true }),
    ).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(page.getByText('Checking your access…')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Check access again', exact: true }),
    ).toHaveCount(0);
    releaseAccess();
    await expect.poll(() => catalogRequests).toBeGreaterThan(0);
    await expect(
      page.getByRole('progressbar', {
        name: 'Preparing your challenges',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'JustGO', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Find a challenge', exact: true }),
    ).toHaveCount(0);
    await expect(next).toBeDisabled();
    releaseCatalog();
    await expect(page.getByRole('alert')).toHaveText(
      'Your challenges couldn’t load. Check your connection and try again.',
    );
    await expect(next).toBeEnabled();
    failCatalog = false;
    await next.click();
    await expect.poll(() => textureRequested).toBe(true);
    await expect(next).toBeDisabled();
    releaseArtwork();
    await expect.poll(() => artworkLoaded).toBe(true);
    // The illustration alone must not expose a card still awaiting its texture.
    await expect(page.getByTestId('welcome-preparation-cover')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'JustGO', exact: true }),
    ).toBeVisible();
    releaseTexture();
    await expect(
      page.getByRole('link', { name: 'Open Settings', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('challenge-card')).toBeVisible();
    await expect(page.getByText('Your challenges couldn’t load.')).toHaveCount(
      0,
    );
    expect(replacementAccount?.userId).not.toBe(account.userId);
    expect(replacementProofs).toHaveLength(2);
    expect(replacementProofs[1]).toEqual(replacementProofs[0]);
    await expect(page.getByTestId('welcome-preparation-cover')).toHaveCount(0);
  } finally {
    releaseCreation();
    releaseAccess();
    releaseCatalog();
    releaseArtwork();
    releaseTexture();
  }
});
