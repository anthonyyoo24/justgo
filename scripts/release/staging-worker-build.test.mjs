import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  validateWorkerBundle,
  buildStagingWorker,
} from './staging-worker-build.mjs';
import { productionPath } from './staging-api.mjs';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'worker-bundle-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const directory = join(root, 'output');
  mkdirSync(directory);
  mkdirSync(join(root, 'apps/api/src'), { recursive: true });
  writeFileSync(join(root, 'apps/api/src/worker.ts'), 'tracked Worker');
  writeFileSync(join(directory, 'worker.js'), 'reviewed bundle');
  return {
    root,
    directory,
    metafile: {
      inputs: {
        'apps/api/src/worker.ts': {},
        'node-built-in-modules:crypto': {},
      },
    },
    tracked: ['apps/api/src/worker.ts'],
  };
}
test('both Wrangler child commands receive only the explicit non-secret build environment', async (t) => {
  const f = fixture(t);
  writeFileSync(
    join(f.root, 'apps/api/package.json'),
    JSON.stringify({ devDependencies: { wrangler: '4.155.0' } }),
  );
  writeFileSync(
    join(f.root, 'apps/api/cloudflare-config.mjs'),
    `export { workerConfiguration } from ${JSON.stringify(pathToFileURL(resolve('apps/api/cloudflare-config.mjs')).href)};`,
  );
  const directory = join(f.root, 'private-build');
  mkdirSync(directory);
  const environments = [];
  await buildStagingWorker({
    root: f.root,
    directory,
    target: {
      worker: 'justgo-api-staging',
      accountId: '1'.repeat(32),
      hyperdriveId: '2'.repeat(32),
    },
    context: { sha: 'a'.repeat(40) },
    env: {
      PATH: '/synthetic/bin',
      HOME: '/synthetic/home',
      CLOUDFLARE_API_TOKEN: 'private',
      MIGRATION_DATABASE_URL: 'private',
      DATABASE_CA_CERT: 'private',
      GH_TOKEN: 'private',
    },
    run: async (command, args, options) => {
      if (command === 'git') return 'apps/api/src/worker.ts\0';
      environments.push(options.env);
      if (args.includes('--version')) return '4.155.0';
      const output = args[args.indexOf('--outdir') + 1];
      mkdirSync(output);
      writeFileSync(join(output, 'worker.js'), 'inspected worker');
      writeFileSync(
        args[args.indexOf('--metafile') + 1],
        JSON.stringify({
          inputs: { [join(f.root, 'apps/api/src/worker.ts')]: {} },
        }),
      );
      return '';
    },
  });
  assert.equal(environments.length, 2);
  for (const env of environments)
    assert.deepEqual(env, {
      PATH: '/synthetic/bin',
      HOME: '/synthetic/home',
      WRANGLER_SEND_METRICS: 'false',
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    });
});
test('bundle digest covers precisely the uploaded code', (t) => {
  const f = fixture(t);
  const first = validateWorkerBundle(f);
  assert.equal(first.content.toString(), 'reviewed bundle');
  assert.match(first.uploadSha256, /^[a-f0-9]{64}$/);
  writeFileSync(join(f.directory, 'worker.js'), 'changed bundle');
  assert.notEqual(validateWorkerBundle(f).uploadSha256, first.uploadSha256);
});
test('untracked, ignored generated contracts, operator scripts and fake virtual inputs are rejected', (t) => {
  const f = fixture(t);
  assert.throws(() => validateWorkerBundle({ ...f, tracked: [] }));
  for (const path of [
    'apps/api/src/.env.local',
    'apps/api/src/private.pem',
    'apps/api/src/fixture.test.ts',
    'apps/api/scripts/migrate.ts',
    'packages/contracts/dist/index.js',
  ]) {
    mkdirSync(join(f.root, path, '..'), { recursive: true });
    writeFileSync(join(f.root, path), 'private fixture');
    assert.equal(productionPath(path), false);
    assert.throws(() =>
      validateWorkerBundle({
        ...f,
        tracked: [...f.tracked, path],
        metafile: { inputs: { [path]: {} } },
      }),
    );
  }
  assert.throws(() =>
    validateWorkerBundle({
      ...f,
      metafile: { inputs: { 'node-built-in-modules:private': {} } },
    }),
  );
});
test('extra output modules and symlinked entrypoints fail closed', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.directory, 'private.js'), 'private fixture');
  assert.throws(() => validateWorkerBundle(f));
  rmSync(join(f.directory, 'private.js'));
  rmSync(join(f.directory, 'worker.js'));
  symlinkSync(
    join(f.root, 'apps/api/src/worker.ts'),
    join(f.directory, 'worker.js'),
  );
  assert.throws(() => validateWorkerBundle(f));
});
test('dependency files are accepted only inside this checkout', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'node_modules/dependency'), { recursive: true });
  writeFileSync(
    join(f.root, 'node_modules/dependency/index.js'),
    'locked dependency',
  );
  assert.ok(
    validateWorkerBundle({
      ...f,
      metafile: { inputs: { 'node_modules/dependency/index.js': {} } },
    }),
  );
  const outside = mkdtempSync(join(tmpdir(), 'outside-bundle-'));
  t.after(() => rmSync(outside, { force: true, recursive: true }));
  writeFileSync(join(outside, 'private.js'), 'private fixture');
  symlinkSync(
    join(outside, 'private.js'),
    join(f.root, 'node_modules/dependency/leak.js'),
  );
  assert.throws(() =>
    validateWorkerBundle({
      ...f,
      metafile: { inputs: { 'node_modules/dependency/leak.js': {} } },
    }),
  );
});
