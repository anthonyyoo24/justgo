import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { sessionResponseSchema } from '@justgo/contracts';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';

test('Settings exports every cloud page and a pending phone reflection as a usable private ZIP', async ({
  page,
  fixtureDatabase,
}) => {
  await page.goto('/recovery');
  const created = page.waitForResponse(
    (r) =>
      r.url() === `${journeyApiUrl}/v1/sessions` &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a private account', exact: true })
    .click();
  const account = sessionResponseSchema.parse(await (await created).json());
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  const cloudIds = Array.from({ length: 51 }, () => randomUUID());
  for (const id of cloudIds)
    await fixtureDatabase.query(
      `insert into justgo.attempts
      (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone,reflection_feeling,reflection_text,reflection_revision)
      select $1,$2,v.venue_id,c.id,c.level_id,'2024-11-03T05:30:00.123456Z','2024-11-03','America/Toronto','a_little_better',$3,1
      from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id order by v.position limit 1`,
      [account.userId, id, 'Disposable old cloud reflection 🌱'],
    );
  await page.getByRole('link', { name: 'Back to app', exact: true }).click();
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  // Fail only uploads; authenticated export reads still reach the real backend.
  await page.route(`${journeyApiUrl}/v1/attempts`, (route) =>
    route.request().method() === 'POST'
      ? route.abort('internetdisconnected')
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const reflection = '=SUM(1,2)\nDisposable device note, "quotes" 오늘 🌱';
  await page.getByLabel('Your reflection', { exact: true }).fill(reflection);
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export my data', exact: true })
    .click();
  const download = await downloading;
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  const path = await download.path();
  expect(path).not.toBeNull();
  const files = unzipSync(await readFile(path!));
  expect(Object.keys(files).sort()).toEqual([
    'README.txt',
    'activity.csv',
    'data.json',
  ]);
  const json = JSON.parse(strFromU8(files['data.json']!)) as {
    account: { id: string };
    attempts: { id: string }[];
    localChanges: {
      status: string;
      attempt: { reflection: { text: string } };
    }[];
  };
  expect(json.account.id).toBe(account.userId);
  expect(json.attempts.map((x) => x.id).sort()).toEqual(cloudIds.sort());
  expect(json.localChanges).toHaveLength(1);
  expect(json.localChanges[0]).toMatchObject({
    status: 'pending_upload',
    attempt: { reflection: { text: reflection } },
  });
  expect(strFromU8(files['activity.csv']!)).toContain(
    '"\'=SUM(1,2)\nDisposable device note, ""quotes"" 오늘 🌱"',
  );
  for (const field of ['sessionToken', 'credential', 'digest', 'requestId'])
    expect(Object.keys(json)).not.toContain(field);
  await expect(
    page.getByText('Your ZIP download has started.', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows,
  ).toHaveLength(51);
});

test('export shows a retryable network failure and downloads only after a fresh explicit retry', async ({
  page,
}) => {
  await page.goto('/recovery');
  await page
    .getByRole('button', { name: 'Create a private account', exact: true })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to app', exact: true }).click();
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  const failures = '**/v1/account/export*';
  await page.route(failures, (route) => route.abort('internetdisconnected'));
  await page
    .getByRole('button', { name: 'Export my data', exact: true })
    .click();
  await expect(
    page.getByText('Couldn’t export your data. Please try again.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(failures);
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export my data', exact: true })
    .click();
  await downloading;
  await expect(
    page.getByText('Your ZIP download has started.', { exact: true }),
  ).toBeVisible();
});
