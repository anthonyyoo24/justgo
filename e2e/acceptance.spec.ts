import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import type { Page } from '@playwright/test';
import type { Pool } from 'pg';
import {
  accountAcceptanceResponseSchema,
  CURRENT_ACCEPTANCE_VERSIONS,
  sessionCreateSchema,
  sessionResponseSchema,
  type SessionCreate,
} from '@justgo/contracts';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { acceptFixtureTerms } from './support/acceptance';
import { leaveAccountScreens } from './support/account-navigation';

const acceptanceUrl = `${journeyApiUrl}/v1/account/acceptance`;
type Bootstrap = Extract<SessionCreate, { kind: 'bootstrap' }>;

async function readReceipt(database: Pool, userId: string) {
  const result = await database.query<{
    userId: string;
    termsVersion: string;
    privacyVersion: string;
    analyticsScopeVersion: string;
    acceptedAt: Date;
  }>(
    `select user_id as "userId", terms_version as "termsVersion",
      privacy_version as "privacyVersion", analytics_scope_version as "analyticsScopeVersion",
      accepted_at as "acceptedAt" from justgo.account_acceptances where user_id=$1`,
    [userId],
  );
  return result.rows.map((row) => ({
    ...row,
    acceptedAt: row.acceptedAt.toISOString(),
  }));
}

async function createUnacceptedAccount(page: Page) {
  const proof: Bootstrap = {
    kind: 'bootstrap',
    credential: randomBytes(32).toString('hex'),
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    sessionToken: randomBytes(32).toString('hex'),
  };
  const response = await page.request.post(`${journeyApiUrl}/v1/sessions`, {
    data: proof,
  });
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

test('Welcome opens the draft explanation before creating an account, then reuses its confirmed versions after recovery', async ({
  page,
  fixtureDatabase,
}) => {
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
  expect(mutations).toEqual([]);
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
    const accept = page.getByRole('button', { name: 'I Accept', exact: true });
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
  const creating = page.waitForRequest(
    (request) =>
      request.url() === `${journeyApiUrl}/v1/sessions` &&
      request.method() === 'POST',
  );
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${journeyApiUrl}/v1/sessions` &&
      response.request().method() === 'POST',
  );
  await acceptFixtureTerms(page);
  const proof = sessionCreateSchema.parse((await creating).postDataJSON());
  if (proof.kind !== 'bootstrap') throw new Error('Expected fixture bootstrap');
  expect(proof.acceptance).toEqual(CURRENT_ACCEPTANCE_VERSIONS);
  const response = await created;
  expect(response.ok()).toBe(true);
  const account = sessionResponseSchema.parse(await response.json());
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  const receipt = await readReceipt(fixtureDatabase, account.userId);
  expect(receipt).toEqual([
    {
      userId: account.userId,
      ...CURRENT_ACCEPTANCE_VERSIONS,
      acceptedAt: expect.any(String),
    },
  ]);

  // Web credentials are memory-only; this reaches the server receipt after recovery.
  await page.goto('/recovery');
  const recovered = await recoverFromKey(page, proof);
  expect(recovered.userId).toBe(account.userId);
  await leaveAccountScreens(page);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'I Accept', exact: true }),
  ).toHaveCount(0);
  expect(await readReceipt(fixtureDatabase, account.userId)).toEqual(receipt);
  expect(mutations.filter((path) => path === '/v1/account/acceptance')).toEqual(
    [],
  );
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
  test(`a ${scenario.failure} recovery from ${scenario.path} can create an accepted separate account`, async ({
    page,
    fixtureDatabase,
  }) => {
    const existing = await createUnacceptedAccount(page);
    const recoveryKey =
      scenario.failure === 'network'
        ? existing.proof.credential
        : randomBytes(32).toString('hex');
    const sessionsUrl = `${journeyApiUrl}/v1/sessions`;
    let bootstraps = 0;
    await page.route(sessionsUrl, async (route) => {
      const input = sessionCreateSchema.parse(route.request().postDataJSON());
      if (input.kind === 'bootstrap') bootstraps++;
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
    await acceptFixtureTerms(page);
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
    expect(await readReceipt(fixtureDatabase, account.userId)).toEqual([
      expect.objectContaining(CURRENT_ACCEPTANCE_VERSIONS),
    ]);
    expect(await readReceipt(fixtureDatabase, existing.account.userId)).toEqual(
      [],
    );
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

test('an existing account keeps acceptance retryable after an uncertain save without replacing its receipt or activity', async ({
  page,
  fixtureDatabase,
}) => {
  const existing = await createUnacceptedAccount(page);
  await page.goto('/recovery');
  const recovered = await recoverFromKey(page, existing.proof);
  expect(recovered.userId).toBe(existing.account.userId);
  await fixtureDatabase.query(
    `insert into justgo.attempts
      (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone,reflection_text,reflection_revision)
      select $1,$2,v.venue_id,c.id,c.level_id,'2024-11-03T05:30:00Z','2024-11-03','America/Toronto',$3,1
      from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id order by v.position limit 1`,
    [existing.account.userId, randomUUID(), 'Disposable acceptance history.'],
  );
  // Account tools remain on their existing screens; acceptance has no account shortcut.
  expect(await readReceipt(fixtureDatabase, existing.account.userId)).toEqual(
    [],
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export my data', exact: true })
    .click();
  const downloadPath = await (await downloading).path();
  expect(downloadPath).not.toBeNull();
  const exported = unzipSync(await readFile(downloadPath!));
  const data = JSON.parse(strFromU8(exported['data.json']!)) as {
    account: { id: string };
    attempts: unknown[];
  };
  expect(data.account.id).toBe(existing.account.userId);
  expect(data.attempts).toHaveLength(1);
  await page.getByRole('link', { name: 'Delete account', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue to deletion', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('link', { name: 'Account & recovery', exact: true })
    .click();
  await expect(
    page.getByText('Connected', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await leaveAccountScreens(page);
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toBeVisible();
  let writes = 0;
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route(acceptanceUrl, async (route) => {
    if (route.request().method() === 'PUT' && ++writes === 1) {
      // The server commits, but the phone receives no acknowledgement.
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await saveGate;
      await route.abort('failed');
    } else await route.continue();
  });
  try {
    await acceptFixtureTerms(page);
    await expect(
      page.getByRole('progressbar', { name: 'Saving your acceptance' }),
    ).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Checking your acceptance' }),
    ).toHaveCount(0);
  } finally {
    releaseSave();
  }
  await expect(page.getByRole('alert')).toHaveText(
    'Couldn’t save your acceptance. Please try again.',
  );
  await expect(page.getByRole('alert')).toHaveCSS('color', 'rgb(139, 30, 50)');
  await expect(page).toHaveURL(/\/acceptance$/);
  await expect(
    page.getByRole('button', { name: 'I Accept', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toHaveCount(0);
  const receipt = await readReceipt(fixtureDatabase, existing.account.userId);
  expect(receipt).toHaveLength(1);
  await acceptFixtureTerms(page);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  expect(writes).toBe(2);
  expect(await readReceipt(fixtureDatabase, existing.account.userId)).toEqual(
    receipt,
  );
  const history = await fixtureDatabase.query(
    'select reflection_text from justgo.attempts where user_id=$1',
    [existing.account.userId],
  );
  expect(history.rows).toEqual([
    { reflection_text: 'Disposable acceptance history.' },
  ]);
});

test('switching from an accepted account to an existing unaccepted account cannot reuse the first receipt', async ({
  page,
  fixtureDatabase,
}) => {
  await page.goto('/recovery');
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${journeyApiUrl}/v1/sessions` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a new account', exact: true })
    .click();
  await acceptFixtureTerms(page);
  const first = sessionResponseSchema.parse(await (await created).json());
  await expect(page).toHaveURL(/\/recovery\/?$/);
  await expect(
    page.getByText('Connected', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const firstReceipt = await readReceipt(fixtureDatabase, first.userId);
  expect(firstReceipt).toHaveLength(1);
  const other = await createUnacceptedAccount(page);
  expect(other.account.userId).not.toBe(first.userId);
  const otherState = accountAcceptanceResponseSchema.parse(
    await (
      await page.request.get(acceptanceUrl, {
        headers: { authorization: `Bearer ${other.proof.sessionToken}` },
      })
    ).json(),
  );
  expect(otherState.receipt).toBeNull();
  await page.getByRole('link', { name: 'Recovery keys', exact: true }).click();
  const recovered = await recoverFromKey(page, other.proof);
  expect(recovered.userId).toBe(other.account.userId);
  await leaveAccountScreens(page);
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toHaveCount(0);
  expect(await readReceipt(fixtureDatabase, other.account.userId)).toEqual([]);
  expect(await readReceipt(fixtureDatabase, first.userId)).toEqual(
    firstReceipt,
  );
});
