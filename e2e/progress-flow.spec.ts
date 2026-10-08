import type {} from '../apps/mobile/test-support/journey-storage';
import { randomUUID } from 'node:crypto';
import {
  catalogSchema,
  sessionCreateSchema,
  sessionResponseSchema,
  type SessionCreate,
} from '@justgo/contracts';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';

async function account(page: Page) {
  await page.goto('/recovery');
  const request = page.waitForRequest(
    (r) => r.url() === `${journeyApiUrl}/v1/sessions` && r.method() === 'POST',
  );
  const response = page.waitForResponse(
    (r) =>
      r.url() === `${journeyApiUrl}/v1/sessions` &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a private account', exact: true })
    .click();
  const proof = sessionCreateSchema.parse((await request).postDataJSON());
  if (proof.kind !== 'bootstrap')
    throw new Error('Expected synthetic bootstrap');
  const created = sessionResponseSchema.parse(await (await response).json());
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to app', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  const timeZone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  return { ...created, proof, timeZone };
}
async function seed(
  page: Page,
  proof: Extract<SessionCreate, { kind: 'bootstrap' }>,
  count: number,
  timeZone: string,
  daysAgo = 0,
) {
  const headers = { authorization: `Bearer ${proof.sessionToken}` };
  const catalog = catalogSchema.parse(
    await (
      await page.request.get(`${journeyApiUrl}/v1/challenges`, { headers })
    ).json(),
  );
  const card = catalog.cards[0]!;
  const ids: string[] = [];
  for (let n = 0; n < count; n++) {
    const id = randomUUID();
    const response = await page.request.post(`${journeyApiUrl}/v1/attempts`, {
      headers,
      data: {
        id,
        challengeId: card.challengeId,
        venue: card.venue,
        startedAt: new Date(
          Date.now() - daysAgo * 86400000 - (count - n) * 60000,
        ).toISOString(),
        startTimeZone: timeZone,
      },
    });
    expect(response.ok()).toBe(true);
    ids.push(id);
  }
  return ids;
}
async function complete(page: Page, text?: string) {
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  if (text) {
    await page.getByLabel('Your reflection', { exact: true }).fill(text);
    await page
      .getByRole('button', { name: 'Save Reflection', exact: true })
      .click();
  } else await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
}
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
async function recover(
  page: Page,
  proof: Extract<SessionCreate, { kind: 'bootstrap' }>,
) {
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
}

test('10 + 1 stays 11 through acknowledgement, refresh and restart, with inline Add/Edit reflection', async ({
  page,
  fixtureDatabase,
}) => {
  const current = await account(page);
  await seed(page, current.proof, 10, current.timeZone);
  await progress(page, 10);
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${journeyApiUrl}/v1/attempts`, async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  try {
    await complete(page);
    await progress(page, 11);
    await openToday(page, 11);
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
          (
            await fixtureDatabase.query(
              'select reflection_text from justgo.attempts where user_id=$1 and reflection_text is not null',
              [current.userId],
            )
          ).rows[0]?.reflection_text,
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
          (
            await fixtureDatabase.query(
              'select reflection_text from justgo.attempts where user_id=$1 and reflection_text is not null',
              [current.userId],
            )
          ).rows[0]?.reflection_text,
      )
      .toBe('Updated disposable calendar reflection.');
    await page
      .getByRole('button', { name: 'Close day details', exact: true })
      .last()
      .click();
    await expect(page.getByTestId('progress-value-reps')).toHaveText('11');
    await recover(page, current.proof);
    await progress(page, 11);
    await openToday(page, 11);
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

test('today cached paging survives offline and other days/months require a connection', async ({
  page,
  context,
  fixtureDatabase,
}) => {
  const current = await account(page);
  await seed(page, current.proof, 21, current.timeZone);
  await seed(page, current.proof, 1, current.timeZone, 1);
  await progress(page, 22);
  await openToday(page, 21);
  await expect(page.getByRole('button', { name: /Rep 20\./ })).toBeVisible();
  const list = page.getByTestId('day-sheet-entry-list');
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByRole('button', { name: /Rep 21\./ })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Rep 21\./ })).toBeVisible();
  await page
    .getByRole('button', { name: 'Close day details', exact: true })
    .last()
    .click();
  await expect(page.getByTestId('progress-value-reps')).toHaveText('22');
  await page.getByRole('button', { name: /, 1 rep$/ }).click();
  await expect(
    page.getByText("You're currently offline", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Connect to the internet to view this day’s activity.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Close day details', exact: true })
    .last()
    .click();
  await page
    .getByRole('button', { name: 'Previous month', exact: true })
    .click();
  await expect(
    page.getByText('You’re offline. Connect to view this month.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [current.userId],
      )
    ).rows,
  ).toHaveLength(22);
  await context.setOffline(false);
});

test('ten memory-only rounds appear once and recover through an inline local save', async ({
  page,
  context,
  fixtureDatabase,
}) => {
  const current = await account(page);
  await progress(page, 0);
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await page.evaluate(() => {
    globalThis.justgoJournalFaults.mode = 'full';
  });
  await context.setOffline(true);
  for (let n = 0; n < 10; n++) await complete(page);
  await progress(page, 10);
  await expect(
    page.getByText('on 1 active day', { exact: true }),
  ).toBeVisible();
  await openToday(page, 10);
  const list = page.getByTestId('day-sheet-entry-list');
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByRole('button', { name: /Rep 10\./ })).toBeVisible();
  await list.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole('button', { name: /Rep 1\..*Add reflection/ }).click();
  await page.evaluate(() => {
    globalThis.justgoJournalFaults.mode = 'normal';
  });
  await page
    .getByLabel('Your day reflection', { exact: true })
    .fill('Disposable recovery-trigger reflection.');
  await page
    .getByRole('button', { name: 'Save reflection', exact: true })
    .click();
  await expect(
    page.getByText('Disposable recovery-trigger reflection.', { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select id from justgo.attempts where user_id=$1',
            [current.userId],
          )
        ).rows.length,
    )
    .toBe(10);
  await page
    .getByRole('button', { name: 'Close day details', exact: true })
    .last()
    .click();
  await expect(page.getByTestId('progress-value-reps')).toHaveText('10');
  await expect(
    page.getByText('on 1 active day', { exact: true }),
  ).toBeVisible();
});

test('definitive rejection removes completion credit once and retains submitted writing through restart', async ({
  page,
  fixtureDatabase,
}) => {
  const current = await account(page);
  await progress(page, 0);
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  let reject!: () => void;
  const gate = new Promise<void>((resolve) => {
    reject = resolve;
  });
  await page.route(`${journeyApiUrl}/v1/attempts`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await gate;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ATTEMPT_INELIGIBLE',
        requestId: 'progress-rejection-fixture',
      }),
    });
  });
  try {
    await complete(page, 'Retained disposable rejected writing.');
    await progress(page, 1);
    reject();
    await expect(page.getByTestId('progress-value-reps')).toHaveText('0');
    expect(
      (
        await fixtureDatabase.query(
          'select id from justgo.attempts where user_id=$1',
          [current.userId],
        )
      ).rows,
    ).toHaveLength(0);
    const retained = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.endsWith(':journal'))
        .some((key) =>
          localStorage
            .getItem(key)
            ?.includes('Retained disposable rejected writing.'),
        ),
    );
    expect(retained).toBe(true);
    await recover(page, current.proof);
    await progress(page, 0);
  } finally {
    reject();
  }
});

test('older-day Add/Edit keeps confirmed text after pruning and remains online-only', async ({
  page,
  context,
  fixtureDatabase,
}) => {
  const current = await account(page);
  const [id] = await seed(page, current.proof, 1, current.timeZone, 1);
  await progress(page, 1);
  await page.getByRole('button', { name: /, 1 rep$/ }).click();
  await page.getByRole('button', { name: /Rep 1\..*Add reflection/ }).click();
  await page
    .getByLabel('Your day reflection', { exact: true })
    .fill('Historical disposable reflection.');
  await page
    .getByRole('button', { name: 'Save reflection', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select reflection_text from justgo.attempts where id=$1 and user_id=$2',
            [id, current.userId],
          )
        ).rows[0]?.reflection_text,
    )
    .toBe('Historical disposable reflection.');
  await expect
    .poll(() =>
      page.evaluate(
        ({ owner, id }) => {
          const raw = localStorage.getItem(`justgo:v1:${owner}:journal`);
          return raw ? JSON.parse(raw).records[id] === undefined : false;
        },
        { owner: current.userId, id: id! },
      ),
    )
    .toBe(true);
  await expect(
    page.getByText('Historical disposable reflection.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Edit reflection', exact: true })
    .click();
  await expect(
    page.getByLabel('Your day reflection', { exact: true }),
  ).toHaveValue('Historical disposable reflection.');
  await page
    .getByLabel('Your day reflection', { exact: true })
    .fill('Updated historical disposable reflection.');
  await page
    .getByRole('button', { name: 'Save reflection', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select reflection_text from justgo.attempts where id=$1 and user_id=$2',
            [id, current.userId],
          )
        ).rows[0]?.reflection_text,
    )
    .toBe('Updated historical disposable reflection.');
  await page
    .getByRole('button', { name: 'Close day details', exact: true })
    .last()
    .click();
  await expect(page.getByTestId('progress-value-reps')).toHaveText('1');
  await page.getByRole('button', { name: /, 1 rep$/ }).click();
  await page.getByRole('button', { name: /Rep 1\..*View Reflection/ }).click();
  await expect(
    page.getByText('Updated historical disposable reflection.', {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(
    page.getByText("You're currently offline", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Connect to the internet to view this day’s activity.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Updated historical disposable reflection.', {
      exact: true,
    }),
  ).not.toBeVisible();
});
