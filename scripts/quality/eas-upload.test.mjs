import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
// The files EAS loads to configure and bundle the app on the build machine.
const entries = ['apps/mobile/app.config.ts', 'apps/mobile/metro.config.mjs'];
const extensions = ['', '.ts', '.tsx', '.mjs', '.cjs', '.js', '.json'];

function resolveLocal(from, specifier) {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [
    ...extensions.map((extension) => base + extension),
    ...extensions.slice(1).map((extension) => join(base, `index${extension}`)),
  ])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  assert.fail(`${relative(root, from)} imports missing ${specifier}`);
}

function localImports(file) {
  const source = readFileSync(file, 'utf8');
  const specifiers = [
    ...source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm,
    ),
  ].map((match) => match[1]);
  return specifiers.map((specifier) => resolveLocal(file, specifier));
}

test('EAS uploads every local file the app config and Metro config load', () => {
  const ignored = new Set(
    execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--ignored', '--exclude-from=.easignore'],
      { cwd: root, encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean),
  );
  const seen = new Set();
  const queue = entries.map((entry) => join(root, entry));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const path = relative(root, file);
    assert.ok(
      !ignored.has(path),
      `${path} is loaded during the EAS build but .easignore leaves it out`,
    );
    if (/\.(?:[cm]?js|tsx?)$/.test(file)) queue.push(...localImports(file));
  }
  assert.ok(
    seen.has(join(root, 'scripts/development/configuration.mjs')),
    'The walk must reach the Metro configuration helper',
  );
});
