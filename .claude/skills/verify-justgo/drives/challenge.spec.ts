import { test, expect } from '../../../../e2e/support/fixtures';
import { signInFixture } from '../../../../e2e/support/managed-account';
import { localJournalEntries } from '../../../../e2e/support/journal';
import { capture, writeProof } from './evidence';

const reflection = 'Synthetic verify reflection.';

test('challenge-complete: a signed-in fixture completes a card, saves a reflection and sees it counted', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await signInFixture(page);
  const attempts = async () =>
    (
      await fixtureDatabase.query<{ reflection_text: string | null }>(
        'select reflection_text from justgo.attempts where user_id=$1',
        [account.userId],
      )
    ).rows;
  expect(await attempts()).toHaveLength(0);
  await capture(page, 'challenge', '01-deck');

  await page
    .getByRole('button', { name: 'Accept challenge', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Completed', exact: true }),
  ).toBeVisible();
  await capture(page, 'challenge', '02-active');

  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByText('That’s a win!', { exact: true })).toBeVisible();
  await capture(page, 'challenge', '03-success');

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Your reflection', { exact: true }).fill(reflection);
  await expect(
    page.getByRole('button', { name: 'Save Reflection', exact: true }),
  ).toBeEnabled();
  await capture(page, 'challenge', '04-reflection');

  await page
    .getByRole('button', { name: 'Save Reflection', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await attempts()).length).toBe(1);
  await expect
    .poll(async () => (await localJournalEntries(page, account.userId)).length)
    .toBe(1);
  const journalVersions = async () =>
    (
      await fixtureDatabase.query<{ n: number }>(
        'select count(*)::int as n from justgo.journal_versions where user_id=$1',
        [account.userId],
      )
    ).rows[0]?.n;
  await expect.poll(journalVersions).toBe(1);

  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await expect(page.getByTestId('progress-value-reps')).toHaveText('1');
  await capture(page, 'challenge', '05-progress');

  const [saved] = await localJournalEntries(page, account.userId);
  await writeProof('challenge', {
    entryPoint: 'Home deck > Accept challenge > Completed > Save Reflection',
    serverAttempts: (await attempts()).length,
    serverReflectionText: (await attempts())[0]?.reflection_text ?? null,
    serverJournalVersions: await journalVersions(),
    localJournalEntries: (await localJournalEntries(page, account.userId))
      .length,
    localReflectionMatches: saved?.reflection.text === reflection,
    progressReps: await page.getByTestId('progress-value-reps').textContent(),
  });
  expect((await attempts())[0]?.reflection_text).toBeNull();
});
