import { test, expect } from './support/fixtures';
import { continueAsGuest } from './support/managed-account';

test('Settings keeps its title and Back button fixed while scrolling to the last row', async ({
  page,
}) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: 'Open Settings', exact: true }).click();
  const title = page.getByRole('heading', { name: 'Settings', exact: true });
  const back = page.getByRole('button', { name: 'Back', exact: true });
  const firstSection = page.getByRole('heading', {
    name: 'Preferences',
    exact: true,
  });
  await expect(back).toBeEnabled();
  const [initialTitle, initialBack, initialSection] = await Promise.all([
    title.boundingBox(),
    back.boundingBox(),
    firstSection.boundingBox(),
  ]);
  if (!initialTitle || !initialBack || !initialSection)
    throw new Error('Settings navigation must be measurable');
  const headerBottom = Math.max(
    initialTitle.y + initialTitle.height,
    initialBack.y + initialBack.height,
  );
  expect(Math.abs(initialSection.y - headerBottom - 16)).toBeLessThanOrEqual(1);
  const lastRow = page.getByRole('button', {
    name: 'Terms of use',
    exact: true,
  });
  await lastRow.scrollIntoViewIfNeeded();
  await expect(lastRow).toBeInViewport();
  await expect(title).toBeInViewport();
  await expect(back).toBeInViewport();
  await expect(async () => {
    const [currentTitle, currentBack, currentSection] = await Promise.all([
      title.boundingBox(),
      back.boundingBox(),
      firstSection.boundingBox(),
    ]);
    if (!currentTitle || !currentBack || !currentSection)
      throw new Error('Scrolled settings navigation must remain measurable');
    expect(initialSection.y - currentSection.y).toBeGreaterThan(100);
    expect(Math.abs(currentTitle.y - initialTitle.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(currentBack.y - initialBack.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(currentTitle.x - initialTitle.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(currentBack.x - initialBack.x)).toBeLessThanOrEqual(1);
  }).toPass();
  await back.click();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
});
