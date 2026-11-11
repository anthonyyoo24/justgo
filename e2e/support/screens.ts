import type { Page } from '@playwright/test';

// expo-router marks each unfocused web screen `inert` (58.0.31 and later;
// earlier releases used `aria-hidden`). Browsers hide inert content from
// people and assistive technology, but Playwright's role queries still match
// it, so a link that every tab renders resolves to more than one element.
export const outsideInertScreens = (page: Page) =>
  page.locator(':not([inert]):not([inert] *)');

/** The Open Settings link of the focused screen. */
export const openSettingsLink = (page: Page) =>
  page
    .getByRole('link', { name: 'Open Settings', exact: true })
    .and(outsideInertScreens(page));
