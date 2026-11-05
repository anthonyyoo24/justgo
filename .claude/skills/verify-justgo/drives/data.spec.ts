import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { test, expect } from '../../../../e2e/support/fixtures';
import {
  completeChallenge,
  openData,
  signInFixture,
} from '../../../../e2e/support/managed-account';
import { capture, writeProof } from './evidence';

test('data-download: a signed-in fixture downloads one ZIP holding its history and journal', async ({
  page,
}) => {
  const account = await signInFixture(page);
  await completeChallenge(page, 'Synthetic verify download reflection.');
  await openData(page);
  await capture(page, 'data', '01-data');

  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download my data', exact: true })
    .click();
  const download = await downloading;
  const file = await download.path();
  await capture(page, 'data', '02-downloaded');

  // Read the ZIP in place; it holds reflection text, so it never joins the evidence.
  const files = unzipSync(await readFile(file));
  const data = JSON.parse(strFromU8(files['data.json']!)) as {
    owner: { id: string; kind: string };
    attempts: unknown[];
    journal: { entries: unknown[] };
  };
  await writeProof('data', {
    entryPoint: 'Data > Download my data',
    suggestedFilename: download.suggestedFilename(),
    zipFiles: Object.keys(files).sort(),
    ownerIsAccount:
      data.owner.kind === 'account' && data.owner.id === account.userId,
    attempts: data.attempts.length,
    journalEntries: data.journal.entries.length,
  });
  expect(Object.keys(files).sort()).toEqual([
    'README.txt',
    'activity.csv',
    'data.json',
    'journal.json',
  ]);
  expect(data.owner).toEqual({ id: account.userId, kind: 'account' });
  expect(data.attempts).toHaveLength(1);
  expect(data.journal.entries).toHaveLength(1);
});
