import { defineConfig } from '@playwright/test';
import {
  journeyApiUrl,
  journeyAppUrl,
  journeyEnvironment,
} from './environment';

journeyEnvironment(process.env);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  outputDir: '../.local/journey-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../.local/journey-report', open: 'never' }],
  ],
  use: {
    baseURL: journeyAppUrl,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    // Network traces/storage states contain credentials. Keep only masked UI evidence.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: [
    {
      name: 'Fixture API',
      command:
        'node --import tsx --env-file-if-exists=apps/api/.env apps/api/scripts/challenge-dev.ts',
      cwd: '..',
      url: `${journeyApiUrl}/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      env: { NODE_ENV: 'test' },
    },
    {
      name: 'Expo web',
      command: 'npm run web -w @justgo/mobile -- --localhost --max-workers 1',
      cwd: '..',
      url: `${journeyAppUrl}/recovery`,
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      env: {
        CI: '1',
        JUSTGO_JOURNEY_FIXTURES: '1',
        EXPO_NO_DOTENV: '1',
        EXPO_PUBLIC_API_URL: journeyApiUrl,
        NODE_OPTIONS: '--dns-result-order=ipv4first',
      },
    },
  ],
});
