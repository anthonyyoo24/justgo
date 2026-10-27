import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { productionPath } from '../release/staging-api.mjs';
const workflow = readFileSync(
  new URL('../../.github/workflows/staging-api.yml', import.meta.url),
  'utf8',
);
test('staging release is manual, serialized, main-only and checks protection before credentials', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^ {2}(?:push|pull_request|schedule):/m);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /options: \[deploy, migrate-deploy\]/);
  assert.equal(
    (workflow.match(/github\.ref == 'refs\/heads\/main'/g) ?? []).length,
    2,
  );
  assert.equal(
    (workflow.match(/staging-api\.mjs environment/g) ?? []).length,
    2,
  );
  assert.match(workflow, /name: justgo-staging/);
  assert.match(workflow, /ref: \$\{\{ needs\.validate\.outputs\.sha \}\}/);
  assert.match(workflow, /npm ci --prefix scripts\/release\/vercel-cli/);
  assert.match(
    workflow,
    /node --import tsx apps\/api\/scripts\/staging-release\.ts/,
  );
  const validate = workflow.split(/^ {2}release:$/m)[0];
  assert.doesNotMatch(validate, /secrets\./);
  assert.ok(
    workflow.lastIndexOf('staging-api.mjs environment') <
      workflow.indexOf('secrets.VERCEL_TOKEN'),
  );
  assert.match(
    workflow,
    /STAGING_RECOVERY_ATTESTATION: \$\{\{ secrets\.STAGING_RECOVERY_ATTESTATION \}\}/,
  );
  assert.match(
    workflow,
    /VERCEL_AUTOMATION_BYPASS_SECRET: \$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /upload-artifact|supabase db push|db:local|test:db|--public|--debug/,
  );
  assert.match(workflow, /if: always\(\)/);
});
test('the deployment CLI uses its isolated dependency lock before provider credentials', () => {
  const tool = JSON.parse(
    readFileSync(
      new URL('../release/vercel-cli/package.json', import.meta.url),
    ),
  );
  const lock = JSON.parse(
    readFileSync(
      new URL('../release/vercel-cli/package-lock.json', import.meta.url),
    ),
  );
  assert.equal(tool.private, true);
  assert.deepEqual(tool.dependencies, { vercel: '64.5.0' });
  assert.equal(lock.packages[''].dependencies.vercel, tool.dependencies.vercel);
  assert.equal(
    lock.packages['node_modules/vercel'].version,
    tool.dependencies.vercel,
  );
  assert.ok(lock.packages['node_modules/vercel'].integrity);
  assert.equal(
    productionPath('scripts/release/vercel-cli/package.json'),
    false,
  );
  assert.equal(
    productionPath('scripts/release/vercel-cli/package-lock.json'),
    false,
  );
  assert.equal(tool.overrides.tar, '7.5.22');
  for (const [path, dependency] of Object.entries(lock.packages))
    if (path.endsWith('/tar'))
      assert.equal(dependency.version, tool.overrides.tar);
  assert.match(
    workflow,
    /\$GITHUB_WORKSPACE\/scripts\/release\/vercel-cli\/node_modules\/\.bin/,
  );
  assert.doesNotMatch(workflow, /npm install --global vercel|npx .*vercel/);
  assert.ok(
    workflow.indexOf('npm ci --prefix scripts/release/vercel-cli') <
      workflow.indexOf('secrets.VERCEL_TOKEN'),
  );
  assert.match(
    readFileSync(
      new URL('../../.github/dependabot.yml', import.meta.url),
      'utf8',
    ),
    /directories:\s*\n\s*- \/\s*\n\s*- \/scripts\/release\/vercel-cli/,
  );
});
test('actual tag shell rejects missing/unreviewed refs and shell syntax without executing it', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'justgo-staging-tag-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git(['init', '-q']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--allow-empty',
    '-qm',
    'reviewed',
  ]);
  git(['branch', '-M', 'main']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  git(['tag', 'reviewed']);
  const step = workflow
    .split('      - name: Resolve reviewed tag and operation')[1]
    .split('      - name:')[0];
  const source = step
    .match(/^ {8}run: \|\n((?: {10}.*(?:\n|$))+)/m)[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  const run = (tag, operation = 'deploy', digest = '') =>
    spawnSync('bash', ['-c', source], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_TAG: tag,
        RELEASE_OPERATION: operation,
        MIGRATION_PLAN_SHA256: digest,
        GITHUB_OUTPUT: join(root, 'output'),
        GITHUB_STEP_SUMMARY: join(root, 'summary'),
      },
    });
  assert.equal(run('reviewed').status, 0);
  for (const tag of [
    'missing',
    '$(touch exploited)',
    '--help',
    'reviewed^{commit}',
  ])
    assert.notEqual(run(tag).status, 0);
  assert.notEqual(run('reviewed', 'migrate-deploy', 'invalid').status, 0);
  assert.notEqual(run('reviewed', 'deploy', 'a'.repeat(64)).status, 0);
});
