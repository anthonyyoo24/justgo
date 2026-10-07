import type {} from '../apps/mobile/test-support/journey-storage';
import { sessionResponseSchema, sessionCreateSchema } from '@justgo/contracts';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';

async function openAccount(page: Page, catalogReady = true) {
  await page.goto('/recovery');
  const created = page.waitForResponse(
    (r) =>
      r.url() === `${journeyApiUrl}/v1/sessions` &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a private account', exact: true })
    .click();
  const response = await created;
  const body: unknown = await response.json();
  if (!response.ok()) {
    const code =
      body && typeof body === 'object' && 'code' in body
        ? String(body.code)
        : 'unknown';
    throw new Error(
      `Fixture bootstrap failed: HTTP ${response.status()} ${code}`,
    );
  }
  const account = sessionResponseSchema.parse(body);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to app', exact: true }).click();
  if (catalogReady)
    await expect(
      page.getByRole('button', { name: 'Accept challenge', exact: true }),
    ).toBeVisible();
  return account;
}
async function complete(page: Page) {
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByText('That’s a win!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Skip', exact: true }),
  ).toBeVisible();
}
async function fault(page: Page, mode: 'normal' | 'full' | 'blocked') {
  await page.evaluate((mode) => {
    globalThis.justgoJournalFaults.mode = mode;
  }, mode);
}

test('the actual local flow browses/start/give-up without mutations and saves completion/reflection before HTTP acknowledgement', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await openAccount(page);
  const mutations: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/v1/challenges/') && r.method() !== 'GET')
      mutations.push(r.url());
  });
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(0);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${journeyApiUrl}/v1/attempts`, async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  await complete(page);
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Disposable journey reflection.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(0);
  release();
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select reflection_text from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows[0]?.reflection_text,
    )
    .toBe('Disposable journey reflection.');
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(1);
});

test('slow phone writes prevent duplicate activation, expose delayed feedback and protect newer reflection input', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await openAccount(page);
  await fault(page, 'blocked');
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Completed', exact: true })
    .dispatchEvent('click');
  await page
    .getByRole('button', { name: 'Completed', exact: true })
    .dispatchEvent('click');
  await expect(
    page.getByRole('button', { name: 'Saving completion', exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId('completion-submit-spinner')).toBeVisible();
  await expect(page.getByText('Completed', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
  await page.evaluate(() => globalThis.justgoJournalFaults.release());
  await expect(page.getByText('That’s a win!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('First explicit submission.');
  await page
    .getByRole('button', { name: 'Close reflection', exact: true })
    .click();
  await fault(page, 'blocked');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .last()
    .dispatchEvent('click');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .last()
    .dispatchEvent('click');
  await expect(
    page.getByRole('button', { name: 'Saving reflection', exact: true }).last(),
  ).toBeDisabled();
  await expect(
    page.getByTestId('reflection-dismiss-save-spinner'),
  ).toBeVisible();
  await expect(page.getByTestId('reflection-submit-spinner')).toBeVisible();
  await expect(page.getByText('Save Reflection', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Newer unsent input.');
  await page.evaluate(() => globalThis.justgoJournalFaults.release());
  await expect(page.getByLabel('Your reflection', { exact: true })).toHaveValue(
    'Newer unsent input.',
  );
  await expect(
    page.getByRole('button', { name: 'Save Reflection', exact: true }),
  ).toBeEnabled();
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select reflection_text from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows[0]?.reflection_text,
    )
    .toBe('First explicit submission.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select reflection_revision from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows[0]?.reflection_revision,
    )
    .toBe(2);
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(1);
});

test('offline completion and empty Skip survive reload and synchronize through the real session transport', async ({
  page,
  context,
  fixtureDatabase,
}) => {
  const bootstrap = page.waitForRequest(
    (r) => r.url() === `${journeyApiUrl}/v1/sessions` && r.method() === 'POST',
  );
  const account = await openAccount(page);
  const recoveryProof = sessionCreateSchema.parse(
    (await bootstrap).postDataJSON(),
  );
  if (recoveryProof.kind !== 'bootstrap')
    throw new Error('Expected synthetic bootstrap');
  await context.setOffline(true);
  await complete(page);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page
    .getByRole('button', { name: 'Recover an existing account', exact: true })
    .click();
  await page
    .getByLabel('Recovery key', { exact: true })
    .fill(recoveryProof.credential);
  await page
    .getByRole('button', { name: 'Recover with key', exact: true })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to app', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select id from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows.length,
    )
    .toBe(1);
  const rows = await fixtureDatabase.query(
    'select reflection_text,reflection_revision from justgo.attempts where user_id=$1',
    [account.userId],
  );
  expect(rows.rows[0]).toMatchObject({
    reflection_text: null,
    reflection_revision: 0,
  });
});

test('failed phone saving allows memory-only continuation, manual warning dismissal and one full recovery confirmation', async ({
  page,
  context,
  fixtureDatabase,
}) => {
  const account = await openAccount(page);
  await fault(page, 'full');
  await context.setOffline(true);
  await complete(page);
  await expect(
    page.getByText(/Your phone is offline and storage is full/),
  ).toBeVisible();
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Retained memory-only writing.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Close saving warning', exact: true })
    .click();
  await complete(page);
  await expect(
    page.getByRole('button', { name: 'Close saving warning', exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Second retained round.');
  await fault(page, 'normal');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByText('Your activity is now saved', { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select id from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows.length,
    )
    .toBe(2);
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select id from justgo.attempts where user_id=$1 and reflection_revision=1',
            [account.userId],
          )
        ).rows.length,
    )
    .toBe(2);
  await expect(
    page.getByText('Your activity is now saved', { exact: true }),
  ).toHaveCount(1);
});

test('queued local activity renews an expired session without changing ownership or creating a duplicate', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await openAccount(page);
  let first = true;
  let calls = 0;
  await page.route(`${journeyApiUrl}/v1/attempts`, async (route) => {
    if (route.request().method() === 'POST') {
      calls++;
      if (first) {
        first = false;
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'SESSION_EXPIRED',
            requestId: 'local-session-fixture',
          }),
        });
        return;
      }
    }
    await route.continue();
  });
  await complete(page);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select id from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows.length,
    )
    .toBe(1);
  expect(calls).toBe(2);
});

test('completion and reflection use confirmed cloud fallback when phone writes fail online', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await openAccount(page);
  await fault(page, 'full');
  await complete(page);
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Cloud-saved disposable reflection.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close saving warning', exact: true }),
  ).toHaveCount(0);
  const rows = await fixtureDatabase.query(
    'select reflection_text,reflection_revision from justgo.attempts where user_id=$1',
    [account.userId],
  );
  expect(rows.rows).toEqual([
    {
      reflection_text: 'Cloud-saved disposable reflection.',
      reflection_revision: 1,
    },
  ]);
});

test('retained reflection correction is deferred during an active challenge and remains available after Give up', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await openAccount(page);
  let patchCalls = 0;
  await page.route(`${journeyApiUrl}/v1/attempts/*`, async (route) => {
    if (route.request().method() === 'PATCH' && ++patchCalls === 1) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'INVALID_REQUEST',
          requestId: 'rejected-writing-fixture',
        }),
      });
      return;
    }
    await route.continue();
  });
  await complete(page);
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Retained rejected writing.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Review activity that couldn’t upload',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Active challenge', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Review activity that couldn’t upload',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Review reflection', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open Settings', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('tab', { name: 'Progress', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Review activity that couldn’t upload',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Review reflection', exact: true })
    .click();
  await expect(page.getByLabel('Your reflection', { exact: true })).toHaveValue(
    'Retained rejected writing.',
  );
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByText(/an unchanged submission cannot be retried/),
  ).toBeVisible();
  expect(patchCalls).toBe(1);
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Corrected disposable writing.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeEnabled();
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select reflection_text from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows[0]?.reflection_text,
    )
    .toBe('Corrected disposable writing.');
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(1);
  expect(patchCalls).toBe(2);
});

test('first-download failure has a recovery action and later refresh failure leaves the downloaded deck usable', async ({
  page,
  fixtureDatabase,
}) => {
  let unavailable = true;
  await page.route(`${journeyApiUrl}/v1/challenges`, async (route) => {
    if (unavailable)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'UNAVAILABLE',
          requestId: 'catalog-fixture',
        }),
      });
    else await route.continue();
  });
  const account = await openAccount(page, false);
  await expect(
    page.getByRole('button', { name: 'Refresh challenges', exact: true }),
  ).toBeVisible();
  unavailable = false;
  await page
    .getByRole('button', { name: 'Refresh challenges', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  unavailable = true;
  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeEnabled();
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(0);
});

test('active challenges hide all page navigation, preserve browsing continuity, and reset after reload', async ({
  page,
  fixtureDatabase,
}) => {
  const bootstrap = page.waitForRequest(
    (r) => r.url() === `${journeyApiUrl}/v1/sessions` && r.method() === 'POST',
  );
  const account = await openAccount(page);
  const proof = sessionCreateSchema.parse((await bootstrap).postDataJSON());
  if (proof.kind !== 'bootstrap')
    throw new Error('Expected disposable bootstrap');
  await page.getByRole('tab', { name: 'Gym', exact: true }).click();
  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Gym', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Active challenge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Settings', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Completed', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Open Settings', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Gym', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page.reload();
  await page
    .getByRole('button', { name: 'Recover an existing account', exact: true })
    .click();
  await page.getByLabel('Recovery key', { exact: true }).fill(proof.credential);
  await page
    .getByRole('button', { name: 'Recover with key', exact: true })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to app', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Completed', exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(0);
});
