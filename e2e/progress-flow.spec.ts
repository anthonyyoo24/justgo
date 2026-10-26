import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { localJournalEntries as readSavedJournal } from './support/journal';
import {
  signInFixture as account,
  completeChallenge as complete,
  openData,
} from './support/managed-account';
import { seedManagedHistory as seed } from './support/managed-data';
async function progress(page: Page, count: number) {
  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await expect(page.getByTestId('progress-value-reps')).toHaveText(
    String(count),
  );
}
async function openToday(page: Page, count: number) {
  await page
    .getByRole('button', { name: new RegExp(`today, ${count} reps?`) })
    .click();
}
async function scrollToRep(page: Page, number: number) {
  const row = page.getByRole('button', {
    name: new RegExp(`Rep ${number}\\.`),
  });
  await expect
    .poll(async () => {
      if (await row.count()) {
        await row.scrollIntoViewIfNeeded();
        return row.isVisible();
      }
      await page.getByTestId('day-sheet-entry-list').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      return false;
    })
    .toBe(true);
}
test('10 + 1 stays 11 through acknowledgement, refresh and restart, with inline Add/Edit reflection', async ({
  page,
  fixtureDatabase,
}) => {
  const current = await account(page);
  await seed(page, current, 10);
  await page.reload();
  await progress(page, 10);
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${journeyApiUrl}/v1/completion-restores`, async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  try {
    await complete(page);
    await progress(page, 11);
    await openToday(page, 11);
    await scrollToRep(page, 11);
    await page
      .getByRole('button', { name: /Rep 11\..*Add reflection/ })
      .click();
    await expect(
      page.getByRole('button', { name: 'Save reflection', exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel('Your day reflection', { exact: true })
      .fill('Disposable calendar reflection.');
    await page
      .getByRole('button', { name: 'Save reflection', exact: true })
      .click();
    await expect(
      page.getByText('Disposable calendar reflection.', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await fixtureDatabase.query(
          'select id from justgo.attempts where user_id=$1',
          [current.userId],
        )
      ).rows,
    ).toHaveLength(10);
    release();
    await expect
      .poll(
        async () =>
          (await readSavedJournal(page, current.userId))[0]?.reflection.text,
      )
      .toBe('Disposable calendar reflection.');
    await page
      .getByRole('button', { name: 'Edit reflection', exact: true })
      .click();
    await page
      .getByLabel('Your day reflection', { exact: true })
      .fill('Updated disposable calendar reflection.');
    await page
      .getByRole('button', { name: 'Save reflection', exact: true })
      .click();
    await expect(
      page.getByText('Updated disposable calendar reflection.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await readSavedJournal(page, current.userId))[0]?.reflection.text,
      )
      .toBe('Updated disposable calendar reflection.');
    await page
      .getByRole('button', { name: 'Close day details', exact: true })
      .last()
      .click();
    await expect(page.getByTestId('progress-value-reps')).toHaveText('11');
    await page.reload();
    await page.goto('/progress');
    await progress(page, 11);
    await openToday(page, 11);
    await scrollToRep(page, 11);
    await page
      .getByRole('button', { name: /Rep 11\..*View Reflection/ })
      .click();
    await expect(
      page.getByText('Updated disposable calendar reflection.', {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    release();
  }
});

test('a tall day sheet reveals all nine entries without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1600 });
  const current = await account(page);
  await seed(page, current, 9);
  await page.reload();
  await progress(page, 9);
  await openToday(page, 9);
  await expect(page.getByRole('button', { name: /Rep 9\./ })).toBeInViewport();
  expect(
    await page
      .getByTestId('day-sheet-entry-list')
      .evaluate((element) => element.scrollTop),
  ).toBe(0);
});

test('41 attempts keep an unfinished inline reflection while scrolling and saving', async ({
  page,
  fixtureDatabase,
}) => {
  const current = await account(page);
  await seed(page, current, 41);
  await page.reload();
  await progress(page, 41);
  await openToday(page, 41);
  await page.getByRole('button', { name: /Rep 1\..*Add reflection/ }).click();
  const input = page.getByLabel('Your day reflection', { exact: true });
  await input.fill('Disposable 41-attempt draft.');
  await scrollToRep(page, 41);
  await expect(input).toHaveValue('Disposable 41-attempt draft.');
  await scrollToRep(page, 1);
  await page.getByRole('button', { name: /Rep 2\..*Add reflection/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Leave your reflection?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(input).toHaveValue('Disposable 41-attempt draft.');
  await page
    .getByRole('button', { name: 'Save reflection', exact: true })
    .click();
  await page.getByRole('button', { name: /Rep 1\..*View Reflection/ }).click();
  await expect(
    page.getByText('Disposable 41-attempt draft.', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await readSavedJournal(page, current.userId)).map(
        (entry) => entry.reflection.text,
      ),
    )
    .toEqual(['Disposable 41-attempt draft.']);
  expect(
    (
      await fixtureDatabase.query(
        'select reflection_text from justgo.attempts where user_id=$1 and reflection_text is not null',
        [current.userId],
      )
    ).rows,
  ).toEqual([]);
});

test('bottom three reflection editors keep their field and actions inside a reduced viewport', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.name));
  const current = await account(page);
  await seed(page, current, 9);
  await page.reload();
  await progress(page, 9);
  await openToday(page, 9);
  for (const number of [9, 8, 7]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await scrollToRep(page, number);
    await page
      .getByRole('button', {
        name: new RegExp(`Rep ${number}\\..*Add reflection`),
      })
      .click();
    const input = page.getByLabel('Your day reflection', { exact: true });
    const text = `Disposable reflection ${number}. `.repeat(60);
    await input.fill(text);
    // Browser resizing checks real layout/scroll integration. Native keyboard
    // notifications and occlusion are covered separately, not simulated here.
    await page.setViewportSize({ width: 390, height: 500 });
    const save = page.getByRole('button', {
      name: 'Save reflection',
      exact: true,
    });
    const cancel = page.getByRole('button', {
      name: 'Cancel reflection',
      exact: true,
    });
    await expect
      .poll(async () => {
        const [viewport, field, saveButton, cancelButton] = await Promise.all([
          page.getByTestId('day-sheet-entry-list').boundingBox(),
          input.boundingBox(),
          save.boundingBox(),
          cancel.boundingBox(),
        ]);
        if (!viewport || !field || !saveButton || !cancelButton) return false;
        return [field, saveButton, cancelButton].every(
          (box) =>
            box.y >= viewport.y - 1 &&
            box.y + box.height <= viewport.y + viewport.height + 1,
        );
      })
      .toBe(true);
    await expect(input).toHaveValue(text);
    await save.click();
    await expect(input).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Edit reflection', exact: true })
      .click();
    await expect(input).toHaveValue(text);
    await cancel.click();
    await expect(input).toHaveCount(0);
    // Collapse this saved entry before moving to the next one.
    await page
      .getByRole('button', {
        name: new RegExp(`Rep ${number}\\..*Hide Reflection`),
      })
      .click();
  }
  expect(errors).toEqual([]);
});

test('complete historical pages stay available offline after sync and logout keeps the same local collection', async ({
  page,
  context,
}) => {
  const current = await account(page);
  await seed(page, current, 51, 'previous-month');
  await page.reload();
  await progress(page, 51);
  await page.goto('/recovery');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Log out?', exact: true })
    .getByRole('button', { name: 'Log out', exact: true })
    .click();
  await expect(
    page.getByRole('switch', { name: 'Apple', exact: true }),
  ).toBeVisible();
  await page.goto('/progress');
  await expect(page.getByTestId('progress-value-reps')).toHaveText('51');
  await context.setOffline(true);
  await expect(page.getByTestId('progress-value-reps')).toHaveText('51');
  await context.setOffline(false);
  await openData(page);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download my data', exact: true })
    .click();
  await download;
  await expect(
    page.getByText(
      'Your phone’s saved data download has started. Sign in to include the latest cloud data.',
      { exact: true },
    ),
  ).toBeVisible();
});
