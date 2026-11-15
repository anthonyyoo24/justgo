import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import {
  signInFixture,
  openData,
  completeChallenge,
} from './support/managed-account';
import { localJournalEntries } from './support/journal';

async function choose(page: Page, bytes: Uint8Array) {
  const selected = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await (
    await selected
  ).setFiles({
    name: 'JustGO-data-fixture.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(bytes),
  });
}
test("one import restores deleted history and writing, preserves conflicts, accepts another owner's backup and rejects invalid files before writing", async ({
  page,
  fixtureDatabase,
}) => {
  const account = await signInFixture(page);
  await completeChallenge(page, 'Backup fixture original');
  await openData(page);
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download my data', exact: true })
    .click();
  const filename = await (await downloading).path();
  const bytes = await readFile(filename!);
  const files = unzipSync(bytes);
  const data = JSON.parse(strFromU8(files['data.json']!)) as {
    owner: { id: string };
    attempts: unknown[];
    journal: {
      entries: { accountId: string; reflection: { text: string } }[];
      alternatives: { accountId: string }[];
    };
  };
  await page
    .getByRole('button', { name: 'Delete all my data', exact: true })
    .click();
  await page
    .getByRole('alertdialog', { name: 'Delete all saved data?', exact: true })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(
    page.getByText(
      'All saved data was deleted. Your account and downloaded files were kept.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toEqual([]);
  expect(await localJournalEntries(page, account.userId)).toEqual([]);
  await choose(page, bytes);
  await expect(
    page.getByRole('heading', { name: 'Import this data?', exact: true }),
  ).toBeVisible();
  expect(await localJournalEntries(page, account.userId)).toEqual([]);
  await page
    .getByRole('button', { name: 'Confirm import', exact: true })
    .click();
  await expect(
    page.getByText(
      'Your data was imported. Existing differing journal entries were kept.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (await localJournalEntries(page, account.userId))[0]?.reflection.text,
  ).toBe('Backup fixture original');
  data.journal.entries[0]!.reflection.text = 'Backup fixture alternate';
  files['data.json'] = strToU8(JSON.stringify(data));
  await choose(page, zipSync(files, { level: 0 }));
  await page
    .getByRole('button', { name: 'Confirm import', exact: true })
    .click();
  await expect(
    page.getByText(
      'Your data was imported. Existing differing journal entries were kept.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (await localJournalEntries(page, account.userId))[0]?.reflection.text,
  ).toBe('Backup fixture original');
  const versions = await fixtureDatabase.query(
    "select reflection->>'text' as reflection_text from justgo.journal_versions where user_id=$1 order by reflection_text",
    [account.userId],
  );
  expect(
    versions.rows.map(
      (row: { reflection_text: string }) => row.reflection_text,
    ),
  ).toEqual(['Backup fixture alternate', 'Backup fixture original']);
  // One person uses the phone, so a backup from another account joins this one.
  const otherOwner = randomUUID();
  data.owner.id = otherOwner;
  for (const entry of [...data.journal.entries, ...data.journal.alternatives])
    entry.accountId = otherOwner;
  files['data.json'] = strToU8(JSON.stringify(data));
  await choose(page, zipSync(files, { level: 0 }));
  await page
    .getByRole('button', { name: 'Confirm import', exact: true })
    .click();
  await expect(
    page.getByText(
      'Your data was imported. Existing differing journal entries were kept.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (await localJournalEntries(page, account.userId))[0]?.reflection.text,
  ).toBe('Backup fixture original');
  await choose(page, new Uint8Array([1, 2, 3]));
  await expect(
    page.getByText(/Choose an unchanged JustGO export/),
  ).toBeVisible();
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(1);
});
test('a signed-out import stays on the phone and uploads as an import at the next sign-in', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await signInFixture(page);
  await completeChallenge(page, 'Signed-out import original');
  await openData(page);
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download my data', exact: true })
    .click();
  const bytes = await readFile((await (await downloading).path())!);
  await page
    .getByRole('button', { name: 'Delete all my data', exact: true })
    .click();
  await page
    .getByRole('alertdialog', { name: 'Delete all saved data?', exact: true })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(
    page.getByText(
      'All saved data was deleted. Your account and downloaded files were kept.',
      { exact: true },
    ),
  ).toBeVisible();
  const serverAttempts = async () =>
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows.length;
  expect(await serverAttempts()).toBe(0);
  await page.goto('/recovery');
  await page.getByRole('switch', { checked: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Log out?', exact: true })
    .getByRole('button', { name: 'Log out', exact: true })
    .click();
  await expect(
    page.getByRole('switch', { name: 'Apple', exact: true }),
  ).not.toBeChecked();
  await openData(page);
  await choose(page, bytes);
  await page
    .getByRole('button', { name: 'Confirm import', exact: true })
    .click();
  await expect(
    page.getByText(
      'Your data was imported. Existing differing journal entries were kept.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/data$/);
  expect(
    (await localJournalEntries(page, account.userId))[0]?.reflection.text,
  ).toBe('Signed-out import original');
  expect(await serverAttempts()).toBe(0);
  await signInFixture(page, { subjectHandle: account.subjectHandle });
  await expect.poll(serverAttempts).toBe(1);
  await expect
    .poll(async () =>
      (
        await fixtureDatabase.query(
          "select reflection->>'text' as text from justgo.journal_versions where user_id=$1",
          [account.userId],
        )
      ).rows.map((row: { text: string }) => row.text),
    )
    .toEqual(['Signed-out import original']);
});
