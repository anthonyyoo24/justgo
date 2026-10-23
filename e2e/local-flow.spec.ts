import type {} from '../apps/mobile/test-support/journey-storage';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { localJournalEntries } from './support/journal';
import {
  signInFixture,
  continueAsGuest,
  completeChallenge,
} from './support/managed-account';
const openAccount = (page: Page, catalogReady = true) =>
  signInFixture(page, { catalogReady });

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
  await page.route(`${journeyApiUrl}/v1/completion-restores`, async (route) => {
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
    .toBeNull();
  expect(
    (await localJournalEntries(page, account.userId))[0]?.reflection.text,
  ).toBe('Disposable journey reflection.');
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
  await expect(
    page.getByRole('button', { name: 'Close reflection', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Your reflection', { exact: true })).toHaveValue(
    'First explicit submission.',
  );
  await page.evaluate(() => {
    globalThis.justgoJournalFaults.privateMode = 'blocked';
  });
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .dispatchEvent('click');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .dispatchEvent('click');
  await expect(
    page.getByRole('button', { name: 'Saving reflection', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Keep editing', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId('reflection-submit-spinner')).toBeVisible();
  await expect(page.getByText('Save Reflection', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
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
  expect(
    (await localJournalEntries(page, account.userId))[0]?.reflection.text,
  ).toBe('First explicit submission.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await localJournalEntries(page, account.userId))[0]?.reflection
          .revision,
    )
    .toBe(2);
  expect(
    (
      await fixtureDatabase.query(
        'select reflection_text,reflection_revision from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toEqual([{ reflection_text: null, reflection_revision: 0 }]);
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(1);
});

test('a failed private commit keeps the editor input and retries locally without a network fallback', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await openAccount(page);
  await complete(page);
  await page.evaluate(() => {
    globalThis.justgoJournalFaults.privateMode = 'full';
  });
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Retained unsaved private writing.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByText(
      'Couldn’t save on this phone. Your writing is still here. Free some storage and try again.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Your reflection', { exact: true })).toHaveValue(
    'Retained unsaved private writing.',
  );
  expect(await localJournalEntries(page, account.userId)).toEqual([]);
  await page.evaluate(() => globalThis.justgoJournalFaults.release());
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  expect(
    (await localJournalEntries(page, account.userId))[0]?.reflection.text,
  ).toBe('Retained unsaved private writing.');
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
  expect(
    (
      await fixtureDatabase.query(
        'select reflection_text,reflection_revision from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toEqual([{ reflection_text: null, reflection_revision: 0 }]);
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

test('active challenges hide all page navigation and reset after reload while the selected venue persists', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await openAccount(page);
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
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Completed', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('tab', { name: 'Gym', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(0);
});

test('guest writing remains on this phone through offline relaunch without creating an account or uploading private data', async ({
  page,
  context,
  fixtureDatabase,
}) => {
  const before = await fixtureDatabase.query(
    'select count(*)::int as count from justgo.users',
  );
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(`${journeyApiUrl}/v1/`) && r.method() !== 'GET')
      writes.push(r.url());
  });
  const owner = await continueAsGuest(page);
  await completeChallenge(page, 'Guest offline relaunch fixture');
  expect((await localJournalEntries(page, owner))[0]?.reflection.text).toBe(
    'Guest offline relaunch fixture',
  );
  await context.setOffline(true);
  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await expect(page.getByTestId('progress-value-reps')).toHaveText('1');
  await context.setOffline(false);
  await page.reload();
  await page.route(`${journeyApiUrl}/v1/**`, (route) =>
    route.abort('internetdisconnected'),
  );
  await page.goto('/progress');
  await expect(page.getByTestId('progress-value-reps')).toHaveText('1');
  expect((await localJournalEntries(page, owner))[0]?.reflection.text).toBe(
    'Guest offline relaunch fixture',
  );
  expect(writes).toEqual([]);
  expect(
    (
      await fixtureDatabase.query(
        'select count(*)::int as count from justgo.users',
      )
    ).rows,
  ).toEqual(before.rows);
});
