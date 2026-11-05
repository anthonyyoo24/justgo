import path from 'node:path';
import { defineConfig } from '@playwright/test';
import journeys from '../../../e2e/playwright.config';
import { evidenceDir } from './drives/evidence';

// Commands run from the repository root, which owns .env files and services.
const root = process.cwd();
// Attach mode only removes fixture accounts from the instance `verify serve` owns.
const attach = process.env.JUSTGO_VERIFY_ATTACH === '1';
const servers = [journeys.webServer ?? []].flat();

export default defineConfig({
  ...journeys,
  testDir: path.join(import.meta.dirname, 'drives'),
  testMatch: attach ? 'cleanup.spec.ts' : '*.spec.ts',
  testIgnore: attach ? [] : 'cleanup.spec.ts',
  outputDir: path.join(evidenceDir, 'playwright-output'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(evidenceDir, 'report'), open: 'never' }],
  ],
  webServer: attach ? [] : servers.map((server) => ({ ...server, cwd: root })),
});
