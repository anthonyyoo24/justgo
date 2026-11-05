import { test, expect } from '../../../../e2e/support/fixtures';
import { signInFixture } from '../../../../e2e/support/managed-account';
import { seedManagedHistory } from '../../../../e2e/support/managed-data';
import { localJournalEntries } from '../../../../e2e/support/journal';
import { capture, writeProof } from './evidence';

const reflection = 'Synthetic verify day reflection.';

test('progress-day: seeded reps appear today and a rep takes an inline reflection', async ({
  page,
  fixtureDatabase,
}) => {
  const account = await signInFixture(page);
  await seedManagedHistory(page, account, 3);
  await page.reload();
  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await expect(page.getByTestId('progress-value-reps')).toHaveText('3');
  await capture(page, 'progress', '01-calendar');

  await page.getByRole('button', { name: /today, 3 reps/ }).click();
  const rep = page.getByRole('button', { name: /Rep 3\..*Add reflection/ });
  await expect(rep).toBeVisible();
  await capture(page, 'progress', '02-day-sheet');

  await rep.click();
  await page
    .getByLabel('Your day reflection', { exact: true })
    .fill(reflection);
  await page
    .getByRole('button', { name: 'Save reflection', exact: true })
    .click();
  await expect(page.getByText(reflection, { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await localJournalEntries(page, account.userId)).length)
    .toBe(1);
  await capture(page, 'progress', '03-reflection-saved');

  const attempts = await fixtureDatabase.query<{ n: number }>(
    'select count(*)::int as n from justgo.attempts where user_id=$1',
    [account.userId],
  );
  await writeProof('progress', {
    entryPoint: 'Progress tab > today > Rep 3 > Add reflection',
    serverAttempts: attempts.rows[0]?.n,
    progressReps: await page.getByTestId('progress-value-reps').textContent(),
    localJournalEntries: (await localJournalEntries(page, account.userId))
      .length,
  });
  expect(attempts.rows[0]?.n).toBe(3);
});
