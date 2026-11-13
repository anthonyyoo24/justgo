import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// The legal pages are static, so this builds them into a temporary folder and
// serves every request from it. Nothing leaves the browser.
const origin = 'http://legal.localhost';
const repository = fileURLToPath(new URL('..', import.meta.url));
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};
let site = '';

test.beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), 'justgo-legal-'));
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import { buildSite } from './sites/legal/build.mjs'; await buildSite({ outputDirectory: process.env.LEGAL_OUT });",
    ],
    { cwd: repository, env: { ...process.env, LEGAL_OUT: site } },
  );
});

test.afterAll(async () => {
  if (site) await rm(site, { recursive: true, force: true });
});

// A 390 px phone at 200% page zoom lays out at 195 CSS px (#465).
for (const colorScheme of ['light', 'dark'] as const)
  test.describe(`legal pages at 200% zoom on a phone (${colorScheme})`, () => {
    test.use({
      viewport: { width: 195, height: 422 },
      deviceScaleFactor: 4,
      colorScheme,
    });

    for (const path of ['/privacy/', '/terms/'])
      test(`${path} keeps its header inside the viewport`, async ({ page }) => {
        const outside: string[] = [];
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) {
            outside.push(url.href);
            await route.abort('blockedbyclient');
            return;
          }
          const file = resolve(
            site,
            `.${url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname}`,
          );
          if (!file.startsWith(site + sep)) {
            await route.fulfill({ status: 400 });
            return;
          }
          try {
            await route.fulfill({
              body: await readFile(file),
              contentType: types[extname(file)] ?? 'application/octet-stream',
            });
          } catch {
            await route.fulfill({ status: 404 });
          }
        });
        await page.goto(`${origin}${path}`);
        await expect(page.locator('.wordmark')).toHaveText('JustGO');
        await expect(page.locator('.brand-mark')).toHaveJSProperty(
          'complete',
          true,
        );
        const layout = await page.evaluate(() => {
          const root = document.documentElement;
          const box = (selector: string) => {
            const element = document.querySelector(selector);
            if (!element) throw new Error(`Missing ${selector}`);
            return element.getBoundingClientRect();
          };
          const mark = box('.brand-mark');
          return {
            scrollWidth: root.scrollWidth,
            clientWidth: root.clientWidth,
            wordmark: box('.wordmark').right,
            mark: mark.right,
            markRatio: mark.width / mark.height,
          };
        });
        expect(outside).toEqual([]);
        expect(layout.clientWidth).toBe(195);
        expect(layout.wordmark).toBeLessThanOrEqual(layout.clientWidth);
        expect(layout.mark).toBeLessThanOrEqual(layout.clientWidth);
        // The mark may shrink to fit, but it keeps its 425 × 234 shape.
        expect(layout.markRatio).toBeCloseTo(425 / 234, 1);
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      });
  });
