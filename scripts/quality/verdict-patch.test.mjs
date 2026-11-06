import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compare, filePatches, wholePatchId } from './verdict-patch.mjs';

function repository() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'verdict-patch-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const write = (file, text) => writeFileSync(path.join(cwd, file), text);
  const commit = (message) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'ci@example.invalid');
  git('config', 'user.name', 'ci');
  write('app.ts', 'export const a = 1;\n');
  write('app.test.ts', 'test("a", () => {});\n');
  write('README.md', 'JustGO\n');
  write('other.ts', 'export const other = 1;\n');
  const base = commit('base');
  git('switch', '-q', '-c', 'feature');
  write('app.ts', 'export const a = 2;\n');
  write('app.test.ts', 'test("a is 2", () => {});\n');
  const head = commit('feature');
  return { cwd, git, write, commit, base, head };
}

test('a clean rebase onto a moved base carries the verdict', () => {
  const repo = repository();
  try {
    const verdict = filePatches(repo.base, repo.head, repo.cwd);
    repo.git('switch', '-q', 'main');
    repo.write('other.ts', 'export const other = 2;\n');
    const moved = repo.commit('unrelated');
    repo.git('switch', '-q', 'feature');
    repo.git('rebase', '-q', moved);
    const rebased = repo.git('rev-parse', 'HEAD');
    assert.deepEqual(compare(verdict, filePatches(moved, rebased, repo.cwd)), {
      result: 'carries',
      changed: [],
    });
    assert.equal(
      wholePatchId(repo.base, repo.head, repo.cwd),
      wholePatchId(moved, rebased, repo.cwd),
    );
  } finally {
    rmSync(repo.cwd, { recursive: true, force: true });
  }
});

test('changes to tests or docs keep the verdict and list the files', () => {
  const repo = repository();
  try {
    const verdict = filePatches(repo.base, repo.head, repo.cwd);
    repo.write('app.test.ts', 'test("a is two", () => {});\n');
    repo.write('README.md', 'JustGO app\n');
    const head = repo.commit('tests and docs');
    assert.deepEqual(compare(verdict, filePatches(repo.base, head, repo.cwd)), {
      result: 'docs-tests-only',
      changed: ['README.md', 'app.test.ts'],
    });
  } finally {
    rmSync(repo.cwd, { recursive: true, force: true });
  }
});

test('a change to code, a new file or a dropped file needs a new verdict', () => {
  const repo = repository();
  try {
    const verdict = filePatches(repo.base, repo.head, repo.cwd);
    repo.write('app.ts', 'export const a = 3;\n');
    const edited = repo.commit('code');
    assert.deepEqual(
      compare(verdict, filePatches(repo.base, edited, repo.cwd)),
      { result: 're-verify', changed: ['app.ts'] },
    );
    repo.git('rm', '-q', 'app.test.ts');
    repo.write('new.ts', 'export const added = 1;\n');
    const reshaped = repo.commit('reshape');
    assert.equal(
      compare(verdict, filePatches(repo.base, reshaped, repo.cwd)).result,
      're-verify',
    );
  } finally {
    rmSync(repo.cwd, { recursive: true, force: true });
  }
});

test('whitespace-only and non-ASCII path changes need a new verdict', () => {
  const repo = repository();
  try {
    repo.write('café.ts', 'export const greeting = "hello world";\n');
    const head = repo.commit('add café');
    const verdict = filePatches(repo.base, head, repo.cwd);
    repo.write('café.ts', 'export const greeting = "helloworld";\n');
    const edited = repo.commit('whitespace');
    assert.deepEqual(
      compare(verdict, filePatches(repo.base, edited, repo.cwd)),
      { result: 're-verify', changed: ['café.ts'] },
    );
  } finally {
    rmSync(repo.cwd, { recursive: true, force: true });
  }
});

test('only docs, tests and lint config count as review-only paths', () => {
  const only = (file) =>
    compare(new Map(), new Map([[file, 'x']])).result === 'docs-tests-only';
  for (const file of [
    'docs/operations/SUPPORT.md',
    'apps/mobile/src/App.test.tsx',
    'apps/api/tests/identity/service.integration.test.ts',
    'e2e/local-flow.spec.ts',
    'eslint.config.mjs',
  ])
    assert.ok(only(file), file);
  for (const file of [
    'apps/mobile/src/App.tsx',
    'apps/api/drizzle/0024_new.sql',
    'package.json',
    '.github/workflows/ci.yml',
    'docs/legal/notes.mdx',
    'e2e/support/environment.ts',
    'apps/mobile/test-support/journey-environment.ts',
    'e2e/tsconfig.json',
  ])
    assert.ok(!only(file), file);
});
