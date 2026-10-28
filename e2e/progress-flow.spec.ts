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
async function expectRowAtViewportBottom(page: Page, number: number) {
  await expect
    .poll(async () => {
      const row = page.getByRole('button', {
        name: new RegExp(`Rep ${number}\\.`),
      });
      const [entry, viewport] = await Promise.all([
        row.locator('..').boundingBox(),
        page.getByTestId('day-sheet-entry-list').boundingBox(),
      ]);
      if (!entry || !viewport || entry.y < viewport.y - 1) return Infinity;
      return Math.abs(entry.y + entry.height - viewport.y - viewport.height);
    })
    .toBeLessThanOrEqual(1);
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
  await expectRowAtViewportBottom(page, 9);
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
  await page
    .getByRole('button', { name: 'Resize day details', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Resize day details', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
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

test('handle dragging keeps the chosen height and only X or overlay can request dismissal', async ({
  page,
}) => {
  const current = await account(page);
  await seed(page, current, 9);
  await page.reload();
  await progress(page, 9);
  await openToday(page, 9);
  const panel = page.getByTestId('day-sheet-panel');
  const handle = page.getByTestId('day-sheet-handle');
  const compact = (844 * 2) / 3;
  await expect
    .poll(async () => (await panel.boundingBox())?.height)
    .toBeCloseTo(compact, 0);
  const grip = await handle.boundingBox();
  if (!grip) throw new Error('Day sheet handle missing');
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 100, { steps: 10 });
  await expect
    .poll(async () => (await panel.boundingBox())?.height ?? 0)
    .toBeGreaterThan(compact + 60);
  await page.mouse.move(x, y - 280, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await panel.boundingBox())?.height)
    .toBeCloseTo(832, 0);
  await scrollToRep(page, 9);
  await page.getByTestId('day-sheet-entry-list').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expectRowAtViewportBottom(page, 9);
  const expandedGrip = await handle.boundingBox();
  if (!expandedGrip) throw new Error('Expanded day sheet handle missing');
  await page.mouse.move(x, expandedGrip.y + expandedGrip.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, expandedGrip.y + expandedGrip.height / 2 + 250, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await panel.boundingBox())?.height)
    .toBeCloseTo(832 - 250, 0);
  await scrollToRep(page, 9);
  await page.getByRole('button', { name: /Rep 9\..*Add reflection/ }).click();
  const input = page.getByLabel('Your day reflection', { exact: true });
  await input.fill('Disposable draft retained after handle dismissal.');
  const closeGrip = await handle.boundingBox();
  if (!closeGrip) throw new Error('Day sheet handle missing during edit');
  await page.mouse.move(x, closeGrip.y + closeGrip.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, closeGrip.y + closeGrip.height / 2 + 120, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(input).toHaveValue(
    'Disposable draft retained after handle dismissal.',
  );
  await expect(
    page.getByRole('heading', { name: 'Leave your reflection?', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Close day details', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Leave your reflection?', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(input).toHaveValue(
    'Disposable draft retained after handle dismissal.',
  );
  await page
    .getByTestId('day-sheet-backdrop')
    .click({ position: { x: 8, y: 8 } });
  await expect(
    page.getByRole('heading', { name: 'Leave your reflection?', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save reflection', exact: true })
    .click();
  await expect(input).toHaveCount(0);
});

test('four-attempt days fit their content and resist stretching into an empty expanded sheet', async ({
  page,
}) => {
  const current = await account(page);
  await seed(page, current, 4);
  await page.reload();
  await progress(page, 4);
  await openToday(page, 4);
  const panel = page.getByTestId('day-sheet-panel');
  const handle = page.getByTestId('day-sheet-handle');
  await expect(page.getByRole('button', { name: /Rep 4\./ })).toBeInViewport();
  await expect
    .poll(async () => (await panel.boundingBox())?.height ?? Infinity)
    .toBeLessThan((844 * 2) / 3);
  await expectRowAtViewportBottom(page, 4);
  const initial = await panel.boundingBox();
  const grip = await handle.boundingBox();
  if (!initial || !grip) throw new Error('Short day sheet missing');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2,
    grip.y + grip.height / 2 - 100,
    { steps: 10 },
  );
  await expect
    .poll(async () => (await panel.boundingBox())?.height ?? 0)
    .toBeGreaterThan(initial.height + 20);
  expect((await panel.boundingBox())!.height).toBeLessThanOrEqual(
    initial.height + 40,
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await panel.boundingBox())?.height)
    .toBeCloseTo(initial.height, 0);
  await expectRowAtViewportBottom(page, 4);
  const returnedGrip = await handle.boundingBox();
  if (!returnedGrip) throw new Error('Four-attempt handle missing');
  const cx = returnedGrip.x + returnedGrip.width / 2;
  const cy = returnedGrip.y + returnedGrip.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 25, { steps: 2 });
  await page.mouse.up();
  await expect
    .poll(async () => (await panel.boundingBox())?.height)
    .toBeCloseTo(initial.height - 25, 0);
  const smallerGrip = await handle.boundingBox();
  if (!smallerGrip) throw new Error('Resizable four-attempt handle missing');
  await page.mouse.move(cx, smallerGrip.y + smallerGrip.height / 2);
  await page.mouse.down();
  await page.mouse.move(cx, smallerGrip.y + smallerGrip.height / 2 + 450, {
    steps: 12,
  });
  await page.mouse.up();
  const minimum = await panel.boundingBox();
  if (!minimum) throw new Error('Dragging below minimum dismissed the sheet');
  expect(minimum.height).toBeLessThan(initial.height - 100);
  const minimumGrip = await handle.boundingBox();
  if (!minimumGrip) throw new Error('Minimum-height handle missing');
  await page.mouse.move(cx, minimumGrip.y + minimumGrip.height / 2);
  await page.mouse.down();
  await page.mouse.move(cx, minimumGrip.y + minimumGrip.height / 2 + 60, {
    steps: 6,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await panel.boundingBox())?.height)
    .toBeCloseTo(minimum.height, 0);
  // The floor follows actual row/header wrapping, rather than a screen fraction.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expectRowAtViewportBottom(page, 1);
  }
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
        if (!viewport || !field || !saveButton || !cancelButton)
          return { visible: false, missing: true };
        return {
          visible: [field, saveButton, cancelButton].every(
            (box) =>
              box.y >= viewport.y - 1 &&
              box.y + box.height <= viewport.y + viewport.height + 1,
          ),
          number,
          viewport,
          field,
          saveButton,
          cancelButton,
        };
      })
      .toMatchObject({ visible: true });
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
