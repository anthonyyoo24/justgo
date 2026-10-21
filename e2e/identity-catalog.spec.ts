import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import {
  completeChallenge,
  continueAsGuest,
  signInFixture,
} from './support/managed-account';
import { localJournalEntries } from './support/journal';

async function signOut(page: Page) {
  await page.goto('/recovery');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(
    page.getByText(
      'Log out? Your saved data stays on this phone and account sync stops.',
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Confirm log out', exact: true })
    .click();
  for (const provider of ['Apple', 'Google']) {
    const method = page.getByRole('switch', { name: provider, exact: true });
    await expect(method).not.toBeChecked();
    await expect(method).toBeEnabled();
  }
}

test('failed provider sign-in stays on its separate page and leaves no Account connection footer', async ({
  page,
}) => {
  await continueAsGuest(page);
  await page.goto('/recovery');
  await page.route(`${journeyApiUrl}/__fixtures/provider-sessions`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAVAILABLE',
        requestId: 'fixture-sign-in-failure',
      }),
    }),
  );
  for (const provider of ['Apple', 'Google']) {
    await page.getByRole('switch', { name: provider, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/account/sign-in\\?provider=${provider.toLowerCase()}$`),
    );
    await expect(
      page.getByRole('heading', {
        name: 'Keep your data with your account',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: `Sign in with ${provider}`, exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveText(
      'Couldn’t finish connecting. Please try again. Your saved data was kept.',
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/recovery$/);
    await expect(
      page.getByRole('switch', { name: provider, exact: true }),
    ).not.toBeChecked();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Retry connection', exact: true }),
    ).toHaveCount(0);
  }
});

test('provider login, logout and returning login preserve local history and isolate different account collections', async ({
  page,
  fixtureDatabase,
}) => {
  const first = await signInFixture(page, { provider: 'apple' });
  await completeChallenge(page, 'Disposable first account writing');
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select count(*)::int as n from justgo.attempts where user_id=$1',
            [first.userId],
          )
        ).rows[0].n,
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select count(*)::int as n from justgo.journal_versions where user_id=$1',
            [first.userId],
          )
        ).rows[0].n,
    )
    .toBe(1);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  const oldEntries = await localJournalEntries(page, first.userId);
  expect(oldEntries).toHaveLength(1);
  await signOut(page);
  const revoked = await page.request.get(`${journeyApiUrl}/v1/auth/session`, {
    headers: { authorization: `Bearer ${first.token}` },
  });
  expect(revoked.status()).toBe(401);
  expect(await localJournalEntries(page, first.userId)).toEqual(oldEntries);
  await page.goto('/progress');
  await expect(page.getByText('Total reps', { exact: true })).toBeVisible();
  const signedOut = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem('justgo.identity.managed.v1') ?? '{}',
      ) as { collection: { id: string }; account: unknown },
  );
  expect(signedOut).toMatchObject({
    collection: { id: first.userId },
    account: null,
  });

  const second = await signInFixture(page, {
    provider: 'google',
    subjectHandle: null,
  });
  expect(second.userId).not.toBe(first.userId);
  await page.goto('/progress');
  await expect(page.getByText('Total reps', { exact: true })).toBeVisible();
  expect(await localJournalEntries(page, second.userId)).toEqual([]);
  expect(await localJournalEntries(page, first.userId)).toEqual(oldEntries);
  expect(
    (
      await fixtureDatabase.query(
        'select count(*)::int as n from justgo.attempts where user_id=$1',
        [second.userId],
      )
    ).rows[0].n,
  ).toBe(0);
  await signOut(page);
  const returned = await signInFixture(page, {
    provider: 'apple',
    subjectHandle: first.subjectHandle,
  });
  expect(returned.userId).toBe(first.userId);
  expect(returned.sessionId).not.toBe(first.sessionId);
  expect(await localJournalEntries(page, first.userId)).toEqual(oldEntries);
  await expect(
    page.getByRole('heading', { name: 'Terms & Privacy', exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await fixtureDatabase.query(
        'select count(*)::int as n from justgo.managed_auth_accounts where user_id=any($1::uuid[])',
        [[first.userId, second.userId]],
      )
    ).rows[0].n,
  ).toBe(2);
});

test('a remotely revoked provider session blocks cloud writes while keeping its owner’s phone history readable', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await signInFixture(page);
  await completeChallenge(page, 'Disposable revoked account writing');
  const entries = await localJournalEntries(page, account.userId);
  await fixtureDatabase.query(
    'update justgo.managed_auth_sessions set revoked_at=now() where id=$1 and user_id=$2',
    [account.sessionId, account.userId],
  );
  await page.reload();
  await page.goto('/recovery');
  await expect(
    page.getByRole('switch', { name: 'Apple', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Log out', exact: true }),
  ).toHaveCount(0);
  await page.goto('/progress');
  await expect(page.getByText('Total reps', { exact: true })).toBeVisible();
  expect(await localJournalEntries(page, account.userId)).toEqual(entries);
  const returned = await signInFixture(page, {
    subjectHandle: account.subjectHandle,
  });
  expect(returned.userId).toBe(account.userId);
  expect(returned.sessionId).not.toBe(account.sessionId);
});

test('guest writing remains the same journal through automatic sign-in, logout and returning sign-in', async ({
  page,
  fixtureDatabase,
}) => {
  const guestId = await continueAsGuest(page);
  await completeChallenge(page, 'Disposable continuity writing');
  const guestEntries = await localJournalEntries(page, guestId);
  expect(guestEntries).toHaveLength(1);
  const account = await signInFixture(page);
  const merged = await localJournalEntries(page, account.userId);
  expect(merged).toHaveLength(1);
  expect(merged[0]?.id).toBe(guestEntries[0]?.id);
  expect(merged[0]?.accountId).toBe(account.userId);
  expect(await localJournalEntries(page, guestId)).toEqual([]);
  await signOut(page);
  await expect(
    page.getByRole('button', { name: 'View guest data', exact: true }),
  ).toHaveCount(0);
  expect(await localJournalEntries(page, account.userId)).toEqual(merged);
  await page.reload();
  await page.goto('/progress');
  await expect(page.getByText('Total reps', { exact: true })).toBeVisible();
  const returned = await signInFixture(page, {
    subjectHandle: account.subjectHandle,
  });
  expect(returned.userId).toBe(account.userId);
  expect(await localJournalEntries(page, account.userId)).toEqual(merged);
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select count(*)::int as n from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows[0].n,
    )
    .toBe(1);
});

test('login switches reflect verified linking and unlinking while protecting the last method', async ({
  page,
}) => {
  await signInFixture(page, { provider: 'apple' });
  await page.goto('/recovery');
  const apple = page.getByRole('switch', { name: 'Apple', exact: true });
  const google = page.getByRole('switch', { name: 'Google', exact: true });
  await expect(apple).toBeChecked();
  await expect(google).not.toBeChecked();
  await google.click();
  await expect(google).toBeChecked();
  await apple.click();
  await expect(apple).not.toBeChecked();
  await google.click();
  await expect(google).toBeChecked();
  await expect(
    page.getByText(
      'Keep one login method connected. Use Log out to sign out on this phone.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('retired key, code and transfer URLs return to the managed Account page', async ({
  page,
}) => {
  await continueAsGuest(page);
  for (const path of [
    '/account/recover',
    '/account/keys',
    '/account/devices',
    '/account/transfer',
    '/account/troubleshooting',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/recovery$/);
    await expect(
      page.getByRole('heading', { name: 'Account', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Recovery key', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByLabel('Transfer code', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('Recovery keys', { exact: true })).toHaveCount(
      0,
    );
  }
});
