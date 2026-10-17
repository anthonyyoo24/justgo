import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rules = readFileSync(path.join(root, '.vercelignore'), 'utf8');

function ignoredByDeployment(paths) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'justgo-upload-'));
  try {
    writeFileSync(path.join(directory, '.gitignore'), rules);
    const init = spawnSync('git', ['init', '--quiet', directory], {
      encoding: 'utf8',
    });
    assert.equal(init.status, 0, init.stderr);
    for (const filename of paths) {
      const target = path.join(directory, filename);
      if (filename.endsWith('/')) mkdirSync(target, { recursive: true });
      else if (!existsSync(target)) {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, 'synthetic upload fixture\n');
      }
    }
    const result = spawnSync(
      'git',
      [
        '-c',
        'core.excludesFile=/dev/null',
        'check-ignore',
        '--no-index',
        '--stdin',
        '-z',
      ],
      { cwd: directory, input: paths.join('\0') + '\0', encoding: 'utf8' },
    );
    assert.ok([0, 1].includes(result.status), result.stderr);
    return new Set(result.stdout.split('\0').filter(Boolean));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function productionContractGraph() {
  const visited = new Set();
  function visit(filename) {
    if (visited.has(filename)) return;
    visited.add(filename);
    const source = readFileSync(path.join(root, filename), 'utf8');
    for (const [, specifier] of source.matchAll(
      /\bfrom\s+['"](\.[^'"]+)['"]/g,
    )) {
      visit(path.posix.join(path.posix.dirname(filename), specifier));
    }
  }
  visit('packages/contracts/src/index.ts');
  visit('packages/contracts/src/openapi.ts');
  assert.ok(visited.size > 2, 'Both public contract graphs must be traversed');
  return [...visited];
}

function apiProductionFiles(directory = 'apps/api/src') {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const filename = `${directory}/${entry.name}`;
    return entry.isDirectory()
      ? apiProductionFiles(filename)
      : /\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
        ? [filename]
        : [];
  });
}

test('deployment includes both public contract graphs, API production modules and their parent directories', () => {
  const files = [...productionContractGraph(), ...apiProductionFiles()];
  const parents = new Set();
  for (const filename of files) {
    for (
      let parent = path.posix.dirname(filename);
      parent !== '.';
      parent = path.posix.dirname(parent)
    )
      parents.add(parent);
  }
  const paths = [...files, ...parents];
  const ignored = ignoredByDeployment(paths);
  for (const filename of paths)
    assert.ok(!ignored.has(filename), `Excluded production path: ${filename}`);
});

test('the contract folder rule admits new nested production modules while final exclusions reject tests, secrets and build output', () => {
  assert.ok(rules.split('\n').includes('!packages/contracts/src/**'));
  assert.ok(
    !rules
      .split('\n')
      .some(
        (entry) =>
          entry.startsWith('!packages/contracts/src/') && entry.endsWith('.ts'),
      ),
    'Contract upload uses one folder rule',
  );
  const included = [
    'packages/contracts/src/future/nested/module.ts',
    'apps/api/src/future/nested/handler.ts',
  ];
  const excluded = [
    'packages/contracts/src/future/nested/module.test.ts',
    'packages/contracts/src/future/nested/module.spec.ts',
    'packages/contracts/src/future/__tests__/module.ts',
    'packages/contracts/src/future/__mocks__/module.ts',
    'packages/contracts/src/future/test-support/fixture.ts',
    'packages/contracts/src/future/.env',
    'packages/contracts/src/future/.env.production',
    'packages/contracts/src/future/private.key',
    'packages/contracts/src/future/signing.pem',
    'packages/contracts/src/future/signing.p8',
    'packages/contracts/src/future/signing.p12',
    'packages/contracts/src/future/signing.mobileprovision',
    'packages/contracts/src/future/dist/module.js',
    'packages/contracts/dist/index.js',
    'apps/api/src/future/handler.test.ts',
    'apps/api/src/future/.env.local',
    'apps/api/src/future/dist/handler.js',
  ];
  const ignored = ignoredByDeployment([...included, ...excluded]);
  for (const filename of included)
    assert.ok(
      !ignored.has(filename),
      `Excluded new production module: ${filename}`,
    );
  for (const filename of excluded)
    assert.ok(
      ignored.has(filename),
      `Uploaded nonproduction path: ${filename}`,
    );
});
