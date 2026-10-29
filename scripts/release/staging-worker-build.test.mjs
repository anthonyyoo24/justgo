import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateWorkerBundle } from './staging-worker-build.mjs';
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
