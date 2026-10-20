import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import type { Page } from '@playwright/test';
import {
  sessionCreateSchema,
  sessionResponseSchema,
  type SessionCreate,
} from '@justgo/contracts';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { continueFromTerms } from './support/acceptance';
import { leaveAccountScreens } from './support/account-navigation';

type Bootstrap = Extract<SessionCreate, { kind: 'bootstrap' }>;
const sessionsUrl = `${journeyApiUrl}/v1/sessions`;

function observeLegalRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/v1/account/acceptance')
      requests.push(`${request.method()} ${request.url()}`);
  });
  return requests;
}

function bootstrapProof(value: unknown): Bootstrap {
  expect(value).not.toHaveProperty('acceptance');
  expect(Object.keys(value as object).sort()).toEqual([
    'credential',
    'deviceId',
    'kind',
    'sessionId',
    'sessionToken',
  ]);
  const proof = sessionCreateSchema.parse(value);
  if (proof.kind !== 'bootstrap') throw new Error('Expected fixture bootstrap');
  return proof;
}

async function createFixtureAccount(page: Page) {
  const proof: Bootstrap = {
    kind: 'bootstrap',
    credential: randomBytes(32).toString('hex'),
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    sessionToken: randomBytes(32).toString('hex'),
  };
  const response = await page.request.post(sessionsUrl, { data: proof });
  expect(response.ok()).toBe(true);
  return { proof, account: sessionResponseSchema.parse(await response.json()) };
}

async function recoverFromKey(page: Page, proof: Bootstrap) {
  await page
    .getByRole('button', { name: 'Recover an existing account', exact: true })
    .or(
      page.getByRole('link', {
        name: 'Recover an existing account',
        exact: true,
      }),
    )
    .filter({ visible: true })
    .click();
  await page.getByLabel('Recovery key', { exact: true }).fill(proof.credential);
  const recovered = page.waitForResponse(
    (response) =>
      response.url() === `${journeyApiUrl}/v1/sessions` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Recover with key', exact: true })
    .click();
  const response = await recovered;
  expect(response.ok()).toBe(true);
  const account = sessionResponseSchema.parse(await response.json());
  await expect(
    page.getByText('Connected', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  return account;
}

test('Welcome presents direct documents without account mutations, then Continue creates an ordinary account without legal tracking', async ({
  page,
  fixtureDatabase,
}) => {
  const legalRequests = observeLegalRequests(page);
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().startsWith(`${journeyApiUrl}/v1/`) &&
      request.method() !== 'GET'
    )
      mutations.push(new URL(request.url()).pathname);
  });
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^Your saved activity/)).toContainText(
    'are uploaded to your JustGO account',
  );
  await expect(page.getByText(/^Your saved activity/)).toContainText(
    'Feelings and reflections are optional.',
  );
  await expect(
    page.getByRole('heading', { name: 'Analytics', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      /Sentry|Development legal drafts|not final release documents/i,
    ),
  ).toHaveCount(0);
  expect(mutations).toEqual([]);
  expect(legalRequests).toEqual([]);
  for (const viewport of [
    { width: 320, height: 611 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const agreement = page.getByText(/^By continuing, you agree to our/);
    const terms = page.getByRole('link', {
      name: 'Terms of Service',
      exact: true,
    });
    const privacy = page.getByRole('link', {
      name: 'Privacy Policy',
      exact: true,
    });
    const accept = page.getByRole('button', { name: 'Continue', exact: true });
    await expect(accept).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Account options', exact: true }),
    ).toHaveCount(0);
    await expect(async () => {
      const copy = await agreement.boundingBox();
      const first = await terms.boundingBox();
      const second = await privacy.boundingBox();
      const button = await accept.boundingBox();
      expect(copy).not.toBeNull();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(button).not.toBeNull();
      if (!copy || !first || !second || !button)
        throw new Error('Acceptance footer must remain measurable');
      expect(copy.height).toBeCloseTo(34, 0);
      expect(first.height).toBeLessThanOrEqual(20);
      expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1);
      expect(button.y - (copy.y + copy.height)).toBeCloseTo(28, 0);
      expect(viewport.height - (button.y + button.height)).toBeCloseTo(20, 0);
    }).toPass();
    await expect(page.getByText('Account & data', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText('Account & recovery', { exact: true }),
    ).toHaveCount(0);
  }

  for (const [name, path] of [
    ['Terms of Service', 'terms'],
    ['Privacy Policy', 'privacy'],
  ] as const) {
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name, exact: true }).click();
    const popup = await popupPromise;
    try {
      await expect(popup).toHaveURL(`${journeyApiUrl}/legal/${path}`);
      await expect(popup.getByText(/Development draft/i)).toBeVisible();
    } finally {
      await popup.close();
    }
  }
  expect(mutations).toEqual([]);
  expect(legalRequests).toEqual([]);
  const creating = page.waitForRequest(
    (request) => request.url() === sessionsUrl && request.method() === 'POST',
  );
  const created = page.waitForResponse(
    (response) =>
      response.url() === sessionsUrl && response.request().method() === 'POST',
  );
  await continueFromTerms(page);
  const proof = bootstrapProof((await creating).postDataJSON());
  const response = await created;
  expect(response.ok()).toBe(true);
  const account = sessionResponseSchema.parse(await response.json());
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  const retiredTable = await fixtureDatabase.query<{ name: string | null }>(
    "select to_regclass('justgo.account_acceptances') as name",
  );
  expect(retiredTable.rows).toEqual([{ name: null }]);
  expect(legalRequests).toEqual([]);

  // Preview credentials are memory-only; recovery exercises the existing account independently of legal receipts.
  await page.goto('/recovery');
  expect((await recoverFromKey(page, proof)).userId).toBe(account.userId);
  await leaveAccountScreens(page);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toHaveCount(0);
  expect(legalRequests).toEqual([]);
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await expect(
    page.getByText('General analytics', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Sensitive metadata', { exact: true }),
  ).toHaveCount(0);
});

for (const scenario of [
  { path: '/recovery', failure: 'network' },
  { path: '/account/recover', failure: 'rejected' },
] as const)
  test(`a ${scenario.failure} recovery from ${scenario.path} can explicitly create a separate account without legal metadata`, async ({
    page,
  }) => {
    const legalRequests = observeLegalRequests(page);
    const existing = await createFixtureAccount(page);
    const recoveryKey =
      scenario.failure === 'network'
        ? existing.proof.credential
        : randomBytes(32).toString('hex');
    let bootstraps = 0;
    await page.route(sessionsUrl, async (route) => {
      const input = sessionCreateSchema.parse(route.request().postDataJSON());
      if (input.kind === 'bootstrap') {
        bootstrapProof(route.request().postDataJSON());
        bootstraps++;
      }
      if (scenario.failure === 'network' && input.kind === 'recovery')
        await route.abort('failed');
      else await route.continue();
    });
    await page.goto(scenario.path);
    if (scenario.path === '/recovery')
      await page
        .getByRole('button', {
          name: 'Recover an existing account',
          exact: true,
        })
        .click();
    await page.getByLabel('Recovery key', { exact: true }).fill(recoveryKey);
    await page
      .getByRole('button', { name: 'Recover with key', exact: true })
      .click();
    await expect(
      page.getByText(
        scenario.failure === 'network'
          ? 'Couldn’t connect. Retry when you’re online; your pending action is saved.'
          : 'This recovery credential is no longer valid. Try another recovery method.',
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Create a separate empty account',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
    ).toBeVisible();
    expect(bootstraps).toBe(0);
    const creating = page.waitForResponse(
      (response) =>
        response.url() === sessionsUrl &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON().kind === 'bootstrap',
    );
    await continueFromTerms(page);
    const created = await creating;
    expect(created.ok()).toBe(true);
    const account = sessionResponseSchema.parse(await created.json());
    expect(account.userId).not.toBe(existing.account.userId);
    expect(created.request().postDataJSON().credential).not.toBe(recoveryKey);
    expect(bootstraps).toBe(1);
    await expect(page).toHaveURL(/\/recovery\/?$/);
    await expect(
      page.getByText('Connected', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    expect(legalRequests).toEqual([]);
    const original = await page.request.post(sessionsUrl, {
      data: {
        kind: 'recovery',
        credential: existing.proof.credential,
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        sessionToken: randomBytes(32).toString('hex'),
      },
    });
    expect(original.ok()).toBe(true);
    expect(sessionResponseSchema.parse(await original.json()).userId).toBe(
      existing.account.userId,
    );
  });

test('Continue retries a committed bootstrap after a lost response with the same proof and no legal write', async ({
  page,
}) => {
  const legalRequests = observeLegalRequests(page);
  const proofs: Bootstrap[] = [];
  let committedUser: string | undefined;
  await page.route(sessionsUrl, async (route) => {
    proofs.push(bootstrapProof(route.request().postDataJSON()));
    if (proofs.length === 1) {
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      committedUser = sessionResponseSchema.parse(
        await committed.json(),
      ).userId;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await continueFromTerms(page);
  await expect(page.getByRole('alert')).toHaveText(
    'Couldn’t connect. Retry when you’re online; your pending action is saved.',
  );
  await expect(page.getByRole('alert')).toHaveCSS('color', 'rgb(139, 30, 50)');
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeEnabled();
  const created = page.waitForResponse(
    (response) =>
      response.url() === sessionsUrl && response.request().method() === 'POST',
  );
  await continueFromTerms(page);
  expect(sessionResponseSchema.parse(await (await created).json()).userId).toBe(
    committedUser,
  );
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  expect(proofs).toHaveLength(2);
  expect(proofs[1]).toEqual(proofs[0]);
  expect(legalRequests).toEqual([]);
});

test('a recovered account can export its existing history and reach deletion or challenges without legal reads or writes', async ({
  page,
  fixtureDatabase,
}) => {
  const legalRequests = observeLegalRequests(page);
  const existing = await createFixtureAccount(page);
  await fixtureDatabase.query(
    `insert into justgo.attempts
    (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone,reflection_text,reflection_revision)
    select $1,$2,v.venue_id,c.id,c.level_id,'2024-11-03T05:30:00Z','2024-11-03','America/Toronto',$3,1
    from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id order by v.position limit 1`,
    [existing.account.userId, randomUUID(), 'Disposable recovered history.'],
  );
  await page.goto('/recovery');
  expect((await recoverFromKey(page, existing.proof)).userId).toBe(
    existing.account.userId,
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export my data', exact: true })
    .click();
  const path = await (await downloading).path();
  expect(path).not.toBeNull();
  const data = JSON.parse(
    strFromU8(unzipSync(await readFile(path!))['data.json']!),
  ) as { account: { id: string }; attempts: unknown[] };
  expect(data.account.id).toBe(existing.account.userId);
  expect(data.account).not.toHaveProperty('acceptance');
  expect(data.attempts).toHaveLength(1);
  await page.getByRole('link', { name: 'Delete account', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue to deletion', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('link', { name: 'Account & recovery', exact: true })
    .click();
  await leaveAccountScreens(page);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toHaveCount(0);
  expect(legalRequests).toEqual([]);
});

test('switching accounts restores the selected owner directly without legal confirmation or creating another account', async ({
  page,
}) => {
  const legalRequests = observeLegalRequests(page);
  await page.goto('/recovery');
  const created = page.waitForResponse(
    (response) =>
      response.url() === sessionsUrl && response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a new account', exact: true })
    .click();
  await continueFromTerms(page);
  const first = sessionResponseSchema.parse(await (await created).json());
  await expect(
    page.getByText('Connected', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const other = await createFixtureAccount(page);
  expect(other.account.userId).not.toBe(first.userId);
  await page.getByRole('link', { name: 'Recovery keys', exact: true }).click();
  expect((await recoverFromKey(page, other.proof)).userId).toBe(
    other.account.userId,
  );
  await leaveAccountScreens(page);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toHaveCount(0);
  expect(legalRequests).toEqual([]);
});
