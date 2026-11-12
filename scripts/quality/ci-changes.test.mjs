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
  dependencyChecksNeeded,
  isDependencyFile,
  isToolingOnly,
  nativeICloudNeeded,
} from './ci-changes.mjs';

test('only a change made entirely of Markdown skips the app jobs', () => {
  assert.equal(appJobsNeeded(['docs/README.md', 'AGENTS.md']), false);
  assert.equal(appJobsNeeded(['docs/TESTING.md', 'package.json']), true);
  assert.equal(appJobsNeeded(['apps/mobile/src/App.tsx']), true);
  assert.equal(appJobsNeeded(['docs/notes.mdx']), true);
  assert.equal(appJobsNeeded([]), true);
});

test('a change made only of Markdown and agent tooling skips the app jobs', () => {
  assert.equal(
    appJobsNeeded([
      '.claude/hooks/sync-main.mjs',
      '.claude/settings.json',
      'scripts/quality/merge-pr.mjs',
      'scripts/quality/merge-pr.test.mjs',
      'AGENTS.md',
    ]),
    false,
  );
  for (const file of [
    'scripts/quality/api-coverage.mjs',
    'scripts/quality/ci-changes.mjs',
    'scripts/quality/git.mjs',
    'scripts/quality/generate-route-types.mjs',
    '.claude/skills/verify-justgo/bin/verify',
    '.claude/settings.local.json',
    '.github/workflows/ci.yml',
    'eslint.config.mjs',
    'scripts/journeys/run-journey.mjs',
    'scripts/backups/run.mjs',
  ]) {
    assert.equal(isToolingOnly(file), false, file);
    assert.equal(appJobsNeeded(['.claude/hooks/x.mjs', file]), true, file);
  }
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

test('only a change to what live Doctor or the audit reads runs them', () => {
  for (const file of [
    'package.json',
    'apps/mobile/package.json',
    'apps/api/package.json',
    'packages/contracts/package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    '.nvmrc',
    'apps/mobile/app.config.ts',
    'apps/mobile/eas.json',
    'apps/mobile/metro.config.js',
    'apps/mobile/plugins/with-sentry-privacy.cjs',
    'apps/mobile/modules/justgo-icloud/ios/Sync.swift',
    'apps/mobile/ios/Podfile',
    '.github/workflows/ci.yml',
    '.github/actions/setup-node/action.yml',
    'scripts/quality/audit-api-dependencies.mjs',
    'scripts/quality/ci-changes.mjs',
    'scripts/quality/git.mjs',
  ]) {
    assert.equal(isDependencyFile(file), true, file);
    assert.equal(dependencyChecksNeeded(['AGENTS.md', file]), true, file);
  }
  for (const file of [
    'apps/mobile/src/App.tsx',
    'apps/mobile/src/package.json.ts',
    'apps/api/src/app.ts',
    'apps/api/drizzle/0030_x.sql',
    'e2e/progress-flow.spec.ts',
    'scripts/quality/merge-pr.mjs',
    '.claude/hooks/sync-main.mjs',
    '.github/workflows/dependency-health.yml',
    'docs/README.md',
  ])
    assert.equal(isDependencyFile(file), false, file);
  assert.equal(
    dependencyChecksNeeded(['apps/mobile/src/App.tsx', 'apps/api/src/app.ts']),
    false,
  );
  assert.equal(dependencyChecksNeeded([]), true);
});

test('pushes, missing bases and unreadable diffs run every app job', () => {
  const docsOnly = () => ['README.md'];
  assert.deepEqual(
    classifyChanges({ event: 'push', base: 'abc', listFiles: docsOnly }),
    { app: true, icloud: true, dependencies: true },
  );
  assert.deepEqual(
    classifyChanges({ event: 'pull_request', base: '', listFiles: docsOnly }),
    { app: true, icloud: true, dependencies: true },
  );
  assert.deepEqual(
    classifyChanges({
      event: 'pull_request',
      base: 'abc',
      listFiles: () => {
        throw new Error('bad revision');
      },
    }),
    { app: true, icloud: true, dependencies: true },
  );
  assert.deepEqual(
    classifyChanges({
      event: 'pull_request',
      base: 'abc',
      listFiles: docsOnly,
    }),
    { app: false, icloud: false, dependencies: false },
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
    'app=true\nicloud=false\ndependencies=false\n',
  );
});

test('a Markdown-only change with a non-ASCII path skips the app jobs', () => {
  assert.equal(
    classifyCommit((repo) =>
      writeFileSync(path.join(repo, 'café.md'), 'Notes\n'),
    ),
    'app=false\nicloud=false\ndependencies=false\n',
  );
});

test('a change inside the iCloud module runs the native iCloud tests', () => {
  assert.equal(
    classifyCommit((repo) => {
      const dir = path.join(repo, 'apps/mobile/modules/justgo-icloud');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'Package.swift'), '// swift\n');
    }),
    'app=true\nicloud=true\ndependencies=true\n',
  );
});
