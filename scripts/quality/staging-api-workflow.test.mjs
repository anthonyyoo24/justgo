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
  assert.match(workflow, /options: \[deploy, migrate-deploy, bootstrap\]/);
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
  assert.match(workflow, /uses: \.\/\.github\/actions\/setup-node/);
  assert.match(
    workflow,
    /node --import tsx apps\/api\/scripts\/staging-release\.ts/,
  );
  const validate = workflow.split(/^ {2}release:$/m)[0];
  assert.doesNotMatch(validate, /secrets\./);
  assert.ok(
    workflow.lastIndexOf('staging-api.mjs environment') <
      workflow.indexOf('secrets.CLOUDFLARE_API_TOKEN'),
  );
  assert.match(
    workflow,
    /STAGING_RECOVERY_ATTESTATION: \$\{\{ secrets\.STAGING_RECOVERY_ATTESTATION \}\}/,
  );
  assert.match(
    workflow,
    /STAGING_HYPERDRIVE_ID: \$\{\{ vars\.STAGING_HYPERDRIVE_ID \}\}/,
  );
  assert.doesNotMatch(workflow, /VERCEL_|vercel-cli/);
  assert.doesNotMatch(
    workflow,
    /upload-artifact|supabase db push|db:local|test:db|--public|--debug/,
  );
  assert.match(workflow, /if: always\(\)/);
});
test('the Worker build CLI is lockfile pinned and has no provider credential during installation', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../apps/api/package.json', import.meta.url)),
  );
  const lock = JSON.parse(
    readFileSync(new URL('../../package-lock.json', import.meta.url)),
  );
  assert.equal(manifest.devDependencies.wrangler, '4.155.0');
  assert.equal(
    lock.packages['node_modules/wrangler'].version,
    manifest.devDependencies.wrangler,
  );
  assert.ok(lock.packages['node_modules/wrangler'].integrity);
  assert.ok(
    workflow.indexOf('uses: ./.github/actions/setup-node') <
      workflow.indexOf('secrets.CLOUDFLARE_API_TOKEN'),
  );
  assert.equal(productionPath('scripts/release/staging-api-runner.mjs'), false);
  assert.doesNotMatch(
    workflow,
    /npm install --global|npx .*wrangler|wrangler deploy/,
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
  const run = (tag, operation = 'deploy', digest = '', abandoned = '') =>
    spawnSync('bash', ['-c', source], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_TAG: tag,
        RELEASE_OPERATION: operation,
        MIGRATION_PLAN_SHA256: digest,
        STAGING_ABANDONED_VERSION_ID: abandoned,
        GITHUB_OUTPUT: join(root, 'output'),
        GITHUB_STEP_SUMMARY: join(root, 'summary'),
      },
    });
  assert.equal(run('reviewed').status, 0);
  assert.equal(run('reviewed', 'bootstrap').status, 0);
  for (const tag of [
    'missing',
    '$(touch exploited)',
    '--help',
    'reviewed^{commit}',
  ])
    assert.notEqual(run(tag).status, 0);
  assert.notEqual(run('reviewed', 'migrate-deploy', 'invalid').status, 0);
  assert.notEqual(run('reviewed', 'deploy', 'a'.repeat(64)).status, 0);
  assert.notEqual(run('reviewed', 'bootstrap', 'a'.repeat(64)).status, 0);
  const abandoned = 'c0fefad7-9a31-4db7-976a-bfc8fbb0366b';
  assert.equal(run('reviewed', 'deploy', '', abandoned).status, 0);
  assert.notEqual(
    run('reviewed', 'deploy', '', '2d6ea61b-2714-4cd9-9437-2a73f9476dd6')
      .status,
    0,
  );
  assert.notEqual(run('reviewed', 'deploy', '', 'arbitrary-version').status, 0);
  assert.notEqual(run('reviewed', 'deploy', '', `${abandoned}\n`).status, 0);
  assert.notEqual(run('reviewed', 'bootstrap', '', abandoned).status, 0);
  assert.notEqual(
    run('reviewed', 'migrate-deploy', 'a'.repeat(64), abandoned).status,
    0,
  );
});

test('bootstrap uses the same protected main workflow with isolated secrets and no fabricated local run context', () => {
  const ordinary = workflow
    .split(
      '      - name: Guard database history and release exact staging candidate',
    )[1]
    .split('      - name:')[0];
  const bootstrap = workflow
    .split('      - name: Bootstrap the first reviewed staging Worker')[1]
    .split('      - name:')[0];
  assert.match(ordinary, /if: inputs\.operation != 'bootstrap'/);
  assert.match(
    ordinary,
    /STAGING_ABANDONED_VERSION_ID: \$\{\{ inputs\.abandoned_version_id \}\}/,
  );
  assert.doesNotMatch(bootstrap, /STAGING_ABANDONED_VERSION_ID/);
  assert.doesNotMatch(ordinary, /STAGING_BOOTSTRAP_BINDINGS/);
  assert.match(bootstrap, /if: inputs\.operation == 'bootstrap'/);
  assert.match(bootstrap, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    bootstrap,
    /STAGING_BOOTSTRAP_BINDINGS: \$\{\{ secrets\.STAGING_BOOTSTRAP_BINDINGS \}\}/,
  );
  assert.match(
    bootstrap,
    /RELEASE_SHA: \$\{\{ needs\.validate\.outputs\.sha \}\}/,
  );
  assert.match(
    bootstrap,
    /node --import tsx scripts\/release\/staging-bootstrap\.mjs/,
  );
  assert.doesNotMatch(
    bootstrap,
    /STAGING_RECOVERY_ATTESTATION|GITHUB_ACTIONS:|GITHUB_RUN_ID:|GITHUB_EVENT_NAME:/,
  );
  assert.match(workflow, /if: always\(\)[\s\S]*justgo-worker-bootstrap-\*/);
});
