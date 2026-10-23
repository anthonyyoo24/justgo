import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import {
  signInFixture,
  openData,
  completeChallenge,
} from './support/managed-account';
import { seedManagedHistory } from './support/managed-data';

test('Download includes every history page, journal version and preferences in one restorable ZIP', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await signInFixture(page);
  const attempts = await seedManagedHistory(
    page,
    account,
    51,
    'previous-month',
  );
  const headers = { authorization: `Bearer ${account.token}` };
  const text = '=SUM(1,2)\nDisposable note, "quotes" 오늘 🌱';
  const version = {
    versionId: randomUUID(),
    attemptId: attempts[0]!.id,
    parents: [],
    feelingScaleVersion: 1,
    context: attempts[0],
    reflection: { feeling: 'a_little_better', text, revision: 1 },
  };
  const uploaded = await page.request.post(`${journeyApiUrl}/v1/journal-sync`, {
    headers,
    data: { expectedEpoch: 0, versions: [version] },
  });
  expect(uploaded.ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await completeChallenge(page, 'New private fixture');
  await openData(page);
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download my data', exact: true })
    .click();
  const file = await (await downloading).path();
  expect(file).not.toBeNull();
  const files = unzipSync(await readFile(file!));
  expect(Object.keys(files).sort()).toEqual([
    'README.txt',
    'activity.csv',
    'data.json',
    'journal.json',
  ]);
  const data = JSON.parse(strFromU8(files['data.json']!)) as {
    format: string;
    formatVersion: number;
    owner: { id: string; kind: string };
    attempts: { id: string; reflection?: unknown }[];
    journal: { entries: { reflection: { text: string } }[] };
    preferences: { reduceMotion: boolean; haptics: boolean };
  };
  expect(data.format).toBe('justgo-data');
  expect(data.formatVersion).toBe(1);
  expect(data.owner).toEqual({ id: account.userId, kind: 'account' });
  expect(data.attempts).toHaveLength(52);
  expect(data.attempts.every((attempt) => !('reflection' in attempt))).toBe(
    true,
  );
  expect(
    data.journal.entries.map((entry) => entry.reflection.text).sort(),
  ).toEqual([text, 'New private fixture'].sort());
  expect(typeof data.preferences.haptics).toBe('boolean');
  expect(strFromU8(files['activity.csv']!)).toContain("'=SUM(1,2)");
  for (const field of [
    'sessionToken',
    'credential',
    'digest',
    'requestId',
    'localChanges',
    'operations',
  ])
    expect(data).not.toHaveProperty(field);
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(52);
});

test('Download reports a cloud read failure and retries only after another explicit action', async ({
  page,
}) => {
  await signInFixture(page);
  await openData(page);
  const failures = '**/v1/completion-restores*';
  await page.route(failures, (route) => route.abort('internetdisconnected'));
  await page
    .getByRole('button', { name: 'Download my data', exact: true })
    .click();
  await expect(
    page.getByText('Couldn’t download your data. Please try again.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(failures);
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download my data', exact: true })
    .click();
  await downloading;
  await expect(
    page.getByText('Your ZIP download has started.', { exact: true }),
  ).toBeVisible();
});
