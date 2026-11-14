import { test, expect } from '../../../../e2e/support/fixtures';
import { signInFixture } from '../../../../e2e/support/managed-account';
import { capture, writeProof } from './evidence';

type Seen = { method: string; path: string; region: string | undefined };

test('region-pin: every API request from sign-in to a saved reflection carries x-region and passes CORS', async ({
  page,
  fixtureDatabase,
}) => {
  // #449: the app pins the Supabase `api` function to the database region.
  const seen: Seen[] = [];
  const failed: string[] = [];
  const statuses: number[] = [];
  // The fixture sign-in seam under the same base path is test harness, not the API client.
  const isApi = (url: string) => {
    const { pathname } = new URL(url);
    return pathname.includes('/v1/') && !pathname.includes('/__fixtures/');
  };
  page.on('request', (request) => {
    if (!isApi(request.url())) return;
    seen.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      region: request.headers()['x-region'],
    });
  });
  // A browser that refuses a CORS preflight fails the request.
  page.on('requestfailed', (request) => {
    if (isApi(request.url()))
      failed.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  page.on('response', (response) => {
    if (isApi(response.url())) statuses.push(response.status());
  });

  const account = await signInFixture(page);
  await capture(page, 'region', '01-deck');
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByText('That’s a win!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByLabel('Your reflection', { exact: true })
    .fill('Synthetic region reflection.');
  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  const count = async (table: string) =>
    (
      await fixtureDatabase.query<{ n: number }>(
        `select count(*)::int as n from justgo.${table} where user_id=$1`,
        [account.userId],
      )
    ).rows[0]?.n;
  await expect.poll(() => count('attempts')).toBe(1);
  await expect.poll(() => count('journal_versions')).toBe(1);
  await capture(page, 'region', '02-saved');

  const writes = seen.filter(({ method }) => method !== 'GET');
  await writeProof('region', {
    entryPoint:
      'Welcome > Sign in > Accept challenge > Completed > Save Reflection',
    apiRequests: seen.length,
    apiWrites: writes.length,
    withRegion: seen.filter(({ region }) => region === 'us-east-1').length,
    withoutRegion: seen.filter(({ region }) => region !== 'us-east-1'),
    failedRequests: failed,
    nonSuccessStatuses: statuses.filter((status) => status >= 400),
    distinctPaths: [
      ...new Set(seen.map(({ method, path }) => `${method} ${path}`)),
    ],
    serverAttempts: await count('attempts'),
    serverJournalVersions: await count('journal_versions'),
  });
  expect(writes.length).toBeGreaterThan(0);
  expect(seen.filter(({ region }) => region !== 'us-east-1')).toEqual([]);
  expect(failed).toEqual([]);
});
