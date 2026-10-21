import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { catalogSchema, type CompletionAttempt } from '@justgo/contracts';
import { expect } from './fixtures';
import { journeyApiUrl } from './environment';
import { seedDay, seedStartTimes } from './seed-times';

export async function seedManagedHistory(
  page: Page,
  account: { token: string; dataEpoch: number },
  count: number,
  daysAgo: number | 'previous-month' = 0,
) {
  const headers = { authorization: `Bearer ${account.token}` };
  const catalog = catalogSchema.parse(
    await (
      await page.request.get(`${journeyApiUrl}/v1/challenges`, { headers })
    ).json(),
  );
  const card = catalog.cards[0]!;
  const zone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const day = await page.evaluate(seedDay, daysAgo);
  const attempts: CompletionAttempt[] = seedStartTimes(count, day).map(
    (startedAt) => ({
      id: randomUUID(),
      challengeId: card.challengeId,
      instruction: card.text,
      levelId: card.levelId,
      venue: card.venue,
      startedAt: new Date(startedAt).toISOString(),
      activityDate: new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(
        new Date(day.start),
      ),
      startTimeZone: zone,
      displayTimeZone: zone,
    }),
  );
  for (let index = 0; index < attempts.length; index += 50) {
    const result = await page.request.post(
      `${journeyApiUrl}/v1/completion-restores`,
      {
        headers,
        data: {
          expectedEpoch: account.dataEpoch,
          attempts: attempts.slice(index, index + 50),
        },
      },
    );
    expect(result.ok()).toBe(true);
  }
  return attempts;
}
