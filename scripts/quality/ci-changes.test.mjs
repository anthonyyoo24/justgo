import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { appJobsNeeded, classifyChanges } from './ci-changes.mjs';

test('only a change made entirely of Markdown skips the app jobs', () => {
  assert.equal(appJobsNeeded(['docs/README.md', 'AGENTS.md']), false);
  assert.equal(appJobsNeeded(['docs/TESTING.md', 'package.json']), true);
  assert.equal(appJobsNeeded(['apps/mobile/src/App.tsx']), true);
  assert.equal(appJobsNeeded(['docs/notes.mdx']), true);
  assert.equal(appJobsNeeded([]), true);
});

test('pushes, missing bases and unreadable diffs run every app job', () => {
  const docsOnly = () => ['README.md'];
  assert.equal(
    classifyChanges({ event: 'push', base: 'abc', listFiles: docsOnly }),
    true,
  );
  assert.equal(
    classifyChanges({ event: 'pull_request', base: '', listFiles: docsOnly }),
    true,
  );
  assert.equal(
    classifyChanges({
      event: 'pull_request',
      base: 'abc',
      listFiles: () => {
        throw new Error('bad revision');
      },
    }),
    true,
  );
  assert.equal(
    classifyChanges({
      event: 'pull_request',
      base: 'abc',
      listFiles: docsOnly,
    }),
    false,
  );
});

test('renaming a code file to Markdown still runs the app jobs', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'ci-changes-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'user.name', 'ci');
    writeFileSync(path.join(repo, 'route.ts'), 'export const route = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    git('mv', 'route.ts', 'route.md');
    git('commit', '-q', '-m', 'rename');
    const output = path.join(repo, 'output');
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./ci-changes.mjs', import.meta.url))],
      {
        cwd: repo,
        env: {
          ...process.env,
          JUSTGO_CI_EVENT: 'pull_request',
          JUSTGO_CI_BASE: base,
          GITHUB_OUTPUT: output,
        },
      },
    );
    assert.equal(readFileSync(output, 'utf8'), 'app=true\n');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
