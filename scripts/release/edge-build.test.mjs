import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  edgeBundleLimit,
  releaseModule,
  validateEdgeBundle,
} from '../../apps/api/scripts/edge-build.mjs';
import { stagingRunnerFailureCode } from './staging-api.mjs';

const entry = 'apps/api/src/edge.ts';
const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'justgo-edge-build-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(join(root, 'apps/api/src'), { recursive: true });
  writeFileSync(join(root, entry), 'export {};');
  const directory = join(root, 'supabase/functions/api/dist');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'edge.mjs'), 'reviewed bundle');
  writeFileSync(join(directory, 'release.mjs'), releaseModule('a'.repeat(40)));
  return {
    root,
    directory,
    tracked: [entry],
    metafile: { inputs: { [entry]: {} } },
  };
};
const code = (work) => {
  try {
    work();
  } catch (error) {
    return stagingRunnerFailureCode(error);
  }
  assert.fail('expected a release failure');
};

test('the digest covers the bundle and the release module', (t) => {
  const f = fixture(t);
  const first = validateEdgeBundle(f);
  assert.equal(first.bytes, 'reviewed bundle'.length);
  assert.match(first.uploadSha256, /^[a-f0-9]{64}$/);
  writeFileSync(join(f.directory, 'edge.mjs'), 'changed bundle!');
  const changed = validateEdgeBundle(f);
  assert.notEqual(changed.uploadSha256, first.uploadSha256);
  writeFileSync(
    join(f.directory, 'release.mjs'),
    releaseModule('b'.repeat(40)),
  );
  assert.notEqual(validateEdgeBundle(f).uploadSha256, changed.uploadSha256);
});

test('the bundle stays within the 5 MB perf rule', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.directory, 'edge.mjs'), Buffer.alloc(edgeBundleLimit));
  assert.equal(validateEdgeBundle(f).bytes, edgeBundleLimit);
  writeFileSync(
    join(f.directory, 'edge.mjs'),
    Buffer.alloc(edgeBundleLimit + 1),
  );
  assert.equal(
    code(() => validateEdgeBundle(f)),
    'INVALID_API_UPLOAD',
  );
  writeFileSync(join(f.directory, 'edge.mjs'), '');
  assert.equal(
    code(() => validateEdgeBundle(f)),
    'INVALID_API_UPLOAD',
  );
});

test('untracked, private, test and operator inputs are refused', (t) => {
  const f = fixture(t);
  assert.equal(
    code(() => validateEdgeBundle({ ...f, tracked: [] })),
    'UNSAFE_API_UPLOAD',
  );
  assert.equal(
    code(() => validateEdgeBundle({ ...f, metafile: { inputs: {} } })),
    'INVALID_API_UPLOAD',
  );
  for (const path of [
    'apps/api/src/.env.local',
    'apps/api/src/private.pem',
    'apps/api/src/fixture.test.ts',
    'apps/api/scripts/migrate.ts',
    'packages/contracts/dist/index.js',
  ]) {
    mkdirSync(join(f.root, path, '..'), { recursive: true });
    writeFileSync(join(f.root, path), 'private fixture');
    assert.equal(
      code(() =>
        validateEdgeBundle({
          ...f,
          tracked: [...f.tracked, path],
          metafile: { inputs: { [path]: {} } },
        }),
      ),
      'UNSAFE_API_UPLOAD',
      path,
    );
  }
});

test('dependencies are accepted only inside this checkout and without private files', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'node_modules/dependency'), { recursive: true });
  writeFileSync(join(f.root, 'node_modules/dependency/index.js'), 'locked');
  assert.ok(
    validateEdgeBundle({
      ...f,
      metafile: { inputs: { 'node_modules/dependency/index.js': {} } },
    }),
  );
  writeFileSync(join(f.root, 'node_modules/dependency/.env'), 'private');
  assert.equal(
    code(() =>
      validateEdgeBundle({
        ...f,
        metafile: { inputs: { 'node_modules/dependency/.env': {} } },
      }),
    ),
    'UNSAFE_API_UPLOAD',
  );
  const outside = mkdtempSync(join(tmpdir(), 'justgo-outside-edge-'));
  t.after(() => rmSync(outside, { force: true, recursive: true }));
  writeFileSync(join(outside, 'private.js'), 'private');
  symlinkSync(
    join(outside, 'private.js'),
    join(f.root, 'node_modules/dependency/leak.js'),
  );
  assert.equal(
    code(() =>
      validateEdgeBundle({
        ...f,
        metafile: { inputs: { 'node_modules/dependency/leak.js': {} } },
      }),
    ),
    'UNSAFE_API_UPLOAD',
  );
});

test('only edge.mjs and release.mjs, as plain files, may be uploaded', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.directory, 'extra.mjs'), 'private');
  assert.equal(
    code(() => validateEdgeBundle(f)),
    'API_UPLOAD_PATH_MISMATCH',
  );
  rmSync(join(f.directory, 'extra.mjs'));
  rmSync(join(f.directory, 'edge.mjs'));
  symlinkSync(join(f.root, entry), join(f.directory, 'edge.mjs'));
  assert.equal(
    code(() => validateEdgeBundle(f)),
    'UNSAFE_API_UPLOAD',
  );
});

test('the release module names one exact source SHA, or none for a local build', () => {
  const sha = 'c'.repeat(40);
  assert.equal(
    releaseModule(sha),
    `export const release = Object.freeze({"JUSTGO_SOURCE_SHA":"${sha}","API_SENTRY_RELEASE":"${sha}"});\n`,
  );
  assert.equal(
    releaseModule(undefined),
    'export const release = Object.freeze({});\n',
  );
  for (const value of ['', 'main', 'C'.repeat(40), `${sha}\n`, 'c'.repeat(39)])
    assert.equal(
      code(() => releaseModule(value)),
      'INVALID_RELEASE_SOURCE',
      value,
    );
});
