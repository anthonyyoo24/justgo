import { defineConfig } from '@playwright/test';

const port = Number(process.env.JUSTGO_EXPORTED_WEB_PORT ?? 8093);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid exported web port');
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.',
  testMatch: 'exported-web.spec.ts',
  workers: 1,
  globalTimeout: 5 * 60_000,
  timeout: 60_000,
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: '../.local/exported-web-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../.local/exported-web-report', open: 'never' }],
  ],
  use: {
    baseURL: origin,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'node scripts/journeys/serve-exported-web.mjs',
    cwd: '..',
    url: origin,
    reuseExistingServer: false,
    timeout: 10_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
