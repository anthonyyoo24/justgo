import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../../../..');
const entry = 'apps/api/scripts/edge-trial/hosted.ts';
const outfile = 'supabase/functions/justgo-trial/dist/edge.mjs';

/** The P15-1 `bundled` recipe from `../edge-trial.ts`, which passed every local lane. */
const banner = [
  "import { createRequire as __trialCreateRequire } from 'node:module';",
  "import { Buffer } from 'node:buffer';",
  "import process from 'node:process';",
  "import { setImmediate, clearImmediate } from 'node:timers';",
  'const require = __trialCreateRequire(import.meta.url);',
  'const global = globalThis;',
].join('\n');

await mkdir(dirname(resolve(root, outfile)), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  logLevel: 'error',
  banner: { js: banner },
  external: ['pg-native', 'pg-cloudflare'],
  alias: {
    '@justgo/contracts': resolve(root, 'packages/contracts/src/index.ts'),
    '@justgo/contracts/openapi': resolve(
      root,
      'packages/contracts/src/openapi.ts',
    ),
  },
});
const bundle = await readFile(resolve(root, outfile));
console.log(
  JSON.stringify({
    entry,
    outfile,
    bytes: bundle.byteLength,
    sha256: createHash('sha256').update(bundle).digest('hex'),
  }),
);
