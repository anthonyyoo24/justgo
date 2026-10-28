import type {} from '../../apps/mobile/test-support/journey-managed-auth';
import type { Page } from '@playwright/test';
import { managedSessionResponseSchema } from '@justgo/contracts';
import { z } from 'zod';
import { expect } from './fixtures';
import { journeyApiUrl } from './environment';
import { continueFromTerms } from './acceptance';

const providerResponse = z.object({
  subjectHandle: z.string().regex(/^[a-f0-9]{32}$/),
});
export async function signInFixture(
  page: Page,
  options: {
    provider?: 'apple' | 'google';
    subjectHandle?: string | null;
    catalogReady?: boolean;
  } = {},
) {
  const provider = options.provider ?? 'apple';
  await page.goto(`/account/sign-in?provider=${provider}`);
  await expect(
    page.getByRole('heading', {
      name: 'Keep your data with your account',
      exact: true,
    }),
  ).toBeVisible();
  if (options.subjectHandle !== undefined)
    await page.evaluate((handle) => {
      if (!globalThis.justgoProviderFixture)
        throw new Error('Provider fixture not loaded');
      globalThis.justgoProviderFixture.selectSubject(handle);
    }, options.subjectHandle);
  const external = page.waitForResponse(
    (r) =>
      r.url() === `${journeyApiUrl}/__fixtures/provider-sessions` &&
      r.request().method() === 'POST',
  );
  const exchange = page.waitForResponse(
    (r) =>
      r.url() === `${journeyApiUrl}/v1/auth/session` &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', {
      name: provider === 'apple' ? 'Sign in with Apple' : 'Sign in with Google',
      exact: true,
    })
    .click();
  const response = await exchange;
  expect(response.ok()).toBe(true);
  const account = managedSessionResponseSchema.parse(await response.json());
  const { subjectHandle } = providerResponse.parse(
    await (await external).json(),
  );
  const token = (await response.request().allHeaders()).authorization?.replace(
    /^Bearer /,
    '',
  );
  if (!token) throw new Error('Fixture sign-in did not use a provider session');
  if (options.catalogReady !== false)
    await expect(
      page.getByRole('button', { name: 'Accept challenge', exact: true }),
    ).toBeVisible();
  return { ...account, token, subjectHandle };
}
export async function continueAsGuest(page: Page) {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await continueFromTerms(page);
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  return page.evaluate(() => {
    const state = JSON.parse(
      localStorage.getItem('justgo.identity.managed.v1') ?? '{}',
    ) as { guestId?: string };
    if (!state.guestId) throw new Error('No guest collection');
    return state.guestId;
  });
}
export async function openData(page: Page) {
  await page.goto('/data');
  await expect(
    page.getByRole('heading', { name: 'Data', exact: true }),
  ).toBeVisible();
}
export async function completeChallenge(page: Page, text?: string) {
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
