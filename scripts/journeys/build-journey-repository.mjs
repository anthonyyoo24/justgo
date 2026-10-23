import { build } from 'esbuild';

await build({
  entryPoints: ['e2e/support/activity-entry.ts'],
  outfile: '.local/journey-repository.mjs',
  platform: 'node',
  format: 'esm',
  bundle: true,
  // Tests inject a durable memory journal; native lazy imports must stay outside
  // the Node transport bundle and never claim native persistence evidence.
  external: ['expo-sqlite'],
  logLevel: 'warning',
});
