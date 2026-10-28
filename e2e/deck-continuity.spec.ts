import {
  challengeCardSchema,
  venueSchema,
  type Venue,
} from '@justgo/contracts';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { test, expect } from './support/fixtures';
import { signInFixture } from './support/managed-account';

const savedDeckSchema = z.object({
  version: z.literal(1),
  accountId: z.uuid(),
  selected: venueSchema,
  orders: z.partialRecord(venueSchema, z.array(challengeCardSchema.shape.id)),
});

async function createAccount(page: Page) {
  await page.goto('/recovery');
  const signOut = page.getByRole('button', { name: 'Log out', exact: true });
  const signIn = page.getByRole('switch', {
    name: 'Apple',
    exact: true,
  });
  // Both states use the same switch; hydration enables it after restoring identity.
  await expect(signIn).toBeEnabled();
  if (await signOut.isVisible()) {
    await signOut.click();
    await page
      .getByRole('alertdialog', { name: 'Log out?', exact: true })
      .getByRole('button', { name: 'Log out', exact: true })
      .click();
    await expect(signIn).toBeEnabled();
  }
  return signInFixture(page, { subjectHandle: null });
}
async function recover(page: Page, subjectHandle: string) {
  await page.goto('/recovery');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Log out?', exact: true })
    .getByRole('button', { name: 'Log out', exact: true })
    .click();
  await expect(
    page.getByRole('switch', { name: 'Apple', exact: true }),
  ).toBeEnabled();
  await signInFixture(page, { subjectHandle });
}

async function frontCard(page: Page) {
  const front = page.getByTestId('challenge-card');
  await expect(front).toBeVisible();
  const face = front.getByTestId(/^challenge-face-/);
  await expect(face).toHaveCount(1);
  const id = await face.getAttribute('data-testid');
  const label = await front.getAttribute('aria-label');
  expect(id).not.toBeNull();
  expect(label).not.toBeNull();
  return { id: id!.slice('challenge-face-'.length), label: label! };
}

async function savedDeck(page: Page, accountId: string) {
  const raw = await page.evaluate(
    (id) => localStorage.getItem(`justgo:v1:${id}:decks`),
    accountId,
  );
  return raw === null ? null : savedDeckSchema.parse(JSON.parse(raw));
}

async function expectSavedFront(
  page: Page,
  accountId: string,
  venue: Venue,
  id: string,
) {
  await expect
    .poll(async () => {
      const saved = await savedDeck(page, accountId);
      return {
        accountId: saved?.accountId,
        selected: saved?.selected,
        front: saved?.orders[venue]?.[0],
      };
    })
    .toEqual({ accountId, selected: venue, front: id });
}

test('saved venue decks resume their rotated front cards after reload and stay separate across accounts', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await createAccount(page);
  await expect(
    page.getByRole('tab', { name: 'Streets', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  const initialStreets = await frontCard(page);
  await page
    .getByRole('button', { name: 'Skip challenge', exact: true })
    .click();
  await expect(page.getByTestId('challenge-card')).toBeVisible();
  await expect(page.getByTestId('challenge-card')).not.toHaveAttribute(
    'aria-label',
    initialStreets.label,
  );
  const streets = await frontCard(page);
  await expectSavedFront(page, account.userId, 'streets', streets.id);

  await page.getByRole('tab', { name: 'Gym', exact: true }).click();
  const initialGym = await frontCard(page);
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await expect(page.getByTestId('challenge-card')).toBeVisible();
  await expect(page.getByTestId('challenge-card')).not.toHaveAttribute(
    'aria-label',
    initialGym.label,
  );
  const afterGiveUp = await frontCard(page);
  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Close reflection', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByTestId('challenge-card')).toBeVisible();
  await expect(page.getByTestId('challenge-card')).not.toHaveAttribute(
    'aria-label',
    afterGiveUp.label,
  );
  const gym = await frontCard(page);
  await expectSavedFront(page, account.userId, 'gym', gym.id);
  const saved = await savedDeck(page, account.userId);
  expect(saved?.orders.streets?.[0]).toBe(streets.id);

  await recover(page, account.subjectHandle);
  await expect(
    page.getByRole('tab', { name: 'Gym', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('challenge-card')).toHaveAttribute(
    'aria-label',
    gym.label,
  );
  expect(await savedDeck(page, account.userId)).toEqual(saved);
  await page.getByRole('tab', { name: 'Streets', exact: true }).click();
  await expect(page.getByTestId('challenge-card')).toHaveAttribute(
    'aria-label',
    streets.label,
  );
  await expectSavedFront(page, account.userId, 'streets', streets.id);
  await page.getByRole('tab', { name: 'Gym', exact: true }).click();
  await expectSavedFront(page, account.userId, 'gym', gym.id);

  await page.reload();
  const other = await createAccount(page);
  expect(other.userId).not.toBe(account.userId);
  await expect(
    page.getByRole('tab', { name: 'Streets', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  const otherFront = await frontCard(page);
  await expectSavedFront(page, other.userId, 'streets', otherFront.id);
  expect(await savedDeck(page, account.userId)).toEqual(saved);

  await recover(page, account.subjectHandle);
  await expect(
    page.getByRole('tab', { name: 'Gym', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('challenge-card')).toHaveAttribute(
    'aria-label',
    gym.label,
  );
  expect(await savedDeck(page, account.userId)).toEqual(saved);
  await expect
    .poll(
      async () =>
        (
          await fixtureDatabase.query(
            'select id from justgo.attempts where user_id=$1',
            [account.userId],
          )
        ).rows.length,
    )
    .toBe(1);
  expect(
    (
      await fixtureDatabase.query(
        'select id from justgo.attempts where user_id=$1',
        [other.userId],
      )
    ).rows,
  ).toHaveLength(0);
});
