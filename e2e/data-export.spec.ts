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
  // Stop the old Home document before selecting a one-shot failure for Data.
  // Session/local storage survives navigation in this same browser context.
  await page.goto('about:blank');
  const failures = '**/v1/completion-restores*';
  let blockedReads = 0;
  let downloads = 0;
  let releaseFailure = () => {};
  const pendingFailure = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  page.on('download', () => downloads++);
  // Navigation starts cloud synchronization. Hold its first read so Download
  // joins a failing pass. A single permanent API error keeps later background
  // passes healthy and avoids coupling this test to transport retry counts.
  await page.route(failures, async (route) => {
    if (route.request().method() !== 'GET' || blockedReads > 0) {
      await route.fallback();
      return;
    }
    blockedReads++;
    await pendingFailure;
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'INVALID_REQUEST',
        requestId: 'fixture-download-read',
      }),
    });
  });
  try {
    await openData(page);
    await expect.poll(() => blockedReads).toBeGreaterThan(0);
    const download = page.getByRole('button', {
      name: 'Download my data',
      exact: true,
    });
    await expect(download).toBeEnabled();
    await download.click();
    await expect(download).toBeDisabled();
    expect(downloads).toBe(0);
    releaseFailure();
    const feedback = page.getByRole('alert');
    await expect(feedback).toHaveText(
      'Couldn’t download your data. Please try again.',
    );
    await expect(download).toBeEnabled();
    expect(downloads).toBe(0);
    await page.unroute(failures);
    await expect(feedback).toHaveText(
      'Couldn’t download your data. Please try again.',
    );
    const downloading = page.waitForEvent('download');
    await download.click();
    await downloading;
    await expect(feedback).toHaveText('Your ZIP download has started.');
    expect(downloads).toBe(1);
  } finally {
    releaseFailure();
    await page.unroute(failures);
  }
});
