import { build } from 'esbuild';

await build({
  entryPoints: ['e2e/activity-entry.ts'],
  outfile: '.local/journey-repository.mjs',
  platform: 'node',
  format: 'esm',
  bundle: true,
  logLevel: 'warning',
});
