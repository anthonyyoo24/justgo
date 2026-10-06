import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('the explicit deployment allowlist includes every public contract module and its parent directories', () => {
  const allowlist = new Set(
    readFileSync(path.join(root, '.vercelignore'), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('!'))
      .map((line) => line.slice(1)),
  );
  const visited = new Set();
  function visit(filename) {
    if (visited.has(filename)) return;
    visited.add(filename);
    assert.ok(allowlist.has(filename), `Missing uploaded module: ${filename}`);
    for (
      let parent = path.posix.dirname(filename);
      parent !== '.';
      parent = path.posix.dirname(parent)
    ) {
      assert.ok(allowlist.has(parent), `Excluded parent directory: ${parent}`);
    }
    const source = readFileSync(path.join(root, filename), 'utf8');
    for (const [, specifier] of source.matchAll(
      /\bfrom\s+['"](\.[^'"]+)['"]/g,
    )) {
      visit(path.posix.join(path.posix.dirname(filename), specifier));
    }
  }
  visit('packages/contracts/src/index.ts');
  assert.ok(visited.size > 1, 'The public contract graph must be traversed');
});
