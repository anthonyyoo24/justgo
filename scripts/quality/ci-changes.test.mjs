import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  appJobsNeeded,
  classifyChanges,
  nativeICloudNeeded,
} from './ci-changes.mjs';

test('only a change made entirely of Markdown skips the app jobs', () => {
  assert.equal(appJobsNeeded(['docs/README.md', 'AGENTS.md']), false);
  assert.equal(appJobsNeeded(['docs/TESTING.md', 'package.json']), true);
  assert.equal(appJobsNeeded(['apps/mobile/src/App.tsx']), true);
  assert.equal(appJobsNeeded(['docs/notes.mdx']), true);
  assert.equal(appJobsNeeded([]), true);
});

test('only a change to the iCloud module or the CI workflow runs the native iCloud tests', () => {
  assert.equal(
    nativeICloudNeeded(['apps/mobile/modules/justgo-icloud/ios/Sync.swift']),
    true,
  );
  assert.equal(nativeICloudNeeded(['.github/workflows/ci.yml']), true);
  assert.equal(
    nativeICloudNeeded(['apps/mobile/src/App.tsx', 'eslint.config.mjs']),
    false,
  );
  assert.equal(nativeICloudNeeded([]), true);
});

test('pushes, missing bases and unreadable diffs run every app job', () => {
  const docsOnly = () => ['README.md'];
  assert.deepEqual(
    classifyChanges({ event: 'push', base: 'abc', listFiles: docsOnly }),
    { app: true, icloud: true },
  );
  assert.deepEqual(
    classifyChanges({ event: 'pull_request', base: '', listFiles: docsOnly }),
    { app: true, icloud: true },
  );
  assert.deepEqual(
    classifyChanges({
      event: 'pull_request',
      base: 'abc',
      listFiles: () => {
        throw new Error('bad revision');
      },
    }),
    { app: true, icloud: true },
  );
  assert.deepEqual(
    classifyChanges({
      event: 'pull_request',
      base: 'abc',
      listFiles: docsOnly,
    }),
    { app: false, icloud: false },
  );
});

function classifyCommit(change) {
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
    change(repo, git);
    git('add', '-A');
    git('commit', '-q', '-m', 'change');
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
    return readFileSync(output, 'utf8');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

test('renaming a code file to Markdown still runs the app jobs', () => {
  assert.equal(
    classifyCommit((repo, git) => git('mv', 'route.ts', 'route.md')),
    'app=true\nicloud=false\n',
  );
});

test('a Markdown-only change with a non-ASCII path skips the app jobs', () => {
  assert.equal(
    classifyCommit((repo) =>
      writeFileSync(path.join(repo, 'café.md'), 'Notes\n'),
    ),
    'app=false\nicloud=false\n',
  );
});

test('a change inside the iCloud module runs the native iCloud tests', () => {
  assert.equal(
    classifyCommit((repo) => {
      const dir = path.join(repo, 'apps/mobile/modules/justgo-icloud');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'Package.swift'), '// swift\n');
    }),
    'app=true\nicloud=true\n',
  );
});
