import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { analyticsFix, analyticsPackageOf } from './analytics-packages.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const refuse = (found) =>
  assert.deepEqual(found, [], `${found.join('\n')}\n${analyticsFix}`);

test('no tracked package.json declares an analytics or tracking package', () => {
  const manifests = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => path.posix.basename(file) === 'package.json');
  assert.ok(manifests.includes('apps/mobile/package.json'), manifests.join());
  refuse(
    manifests.flatMap((file) => {
      const manifest = JSON.parse(read(file));
      return [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ].flatMap((field) =>
        Object.keys(manifest[field] ?? {})
          .filter(analyticsPackageOf)
          .map((name) => `${file} ${field}: ${name}`),
      );
    }),
  );
});

test('the lockfile resolves no analytics or tracking package, direct or transitive', () => {
  const lock = yaml.load(read('pnpm-lock.yaml'));
  const names = Object.keys(lock.packages).map(
    (key) => key.match(/^@?[^@]+/)[0],
  );
  assert.ok(names.includes('expo'), 'pnpm-lock.yaml lists no packages');
  refuse(
    names.filter(analyticsPackageOf).map((name) => `pnpm-lock.yaml: ${name}`),
  );
});
