import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
const workflow = readFileSync(
  new URL('../../.github/workflows/staging-api.yml', import.meta.url),
  'utf8',
);
const step = (name) =>
  workflow.split(`      - name: ${name}`)[1].split('      - ')[0];
test('staging release is manual, serialized, main-only and checks protection before credentials', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^ {2}(?:push|pull_request|schedule):/m);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /options: \[deploy, migrate-deploy, secrets\]/);
  assert.equal(
    (workflow.match(/github\.ref == 'refs\/heads\/main'/g) ?? []).length,
    2,
  );
  assert.equal(
    (workflow.match(/staging-api\.mjs environment/g) ?? []).length,
    2,
  );
  assert.match(workflow, /name: justgo-staging/);
  assert.match(
    workflow,
    /url: https:\/\/\$\{\{ vars\.SUPABASE_PROJECT_REF \}\}\.supabase\.co\/functions\/v1\/api/,
  );
  assert.match(workflow, /ref: \$\{\{ needs\.validate\.outputs\.sha \}\}/);
  assert.match(workflow, /uses: \.\/\.github\/actions\/setup-node/);
  const validate = workflow.split(/^ {2}release:$/m)[0];
  assert.doesNotMatch(validate, /secrets\./);
  assert.ok(
    workflow.lastIndexOf('staging-api.mjs environment') <
      workflow.indexOf('secrets.SUPABASE_ACCESS_TOKEN'),
  );
  assert.doesNotMatch(workflow, /VERCEL_|vercel-cli/);
  assert.doesNotMatch(
    workflow,
    /CLOUDFLARE_|STAGING_WORKER_|wrangler|WRANGLER_|HYPERDRIVE|abandoned|bootstrap/i,
  );
  assert.doesNotMatch(
    workflow,
    /upload-artifact|supabase db push|db:local|test:db|--public|--debug/,
  );
  assert.match(
    workflow,
    /if: always\(\)[\s\S]*rm -rf "\$RUNNER_TEMP"\/justgo-supabase-\* supabase\/functions\/api\/dist/,
  );
});

test('the Supabase CLI is a pinned action release with no provider credential during setup', () => {
  assert.match(
    workflow,
    /uses: supabase\/setup-cli@[0-9a-f]{40} # v3\.2\.0\n {8}with:\n {10}version: 3\.1\.0\n/,
  );
  const setup = workflow.indexOf('uses: supabase/setup-cli@');
  assert.ok(workflow.indexOf('uses: ./.github/actions/setup-node') < setup);
  assert.ok(setup < workflow.indexOf('secrets.SUPABASE_ACCESS_TOKEN'));
  assert.doesNotMatch(
    workflow,
    /npm install --global|pnpm add (?:-g|--global)|npx .*supabase|pnpm (?:dlx|exec) .*supabase|brew install/,
  );
  const manifest = readFileSync(
    new URL('../../apps/api/package.json', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(manifest, /"supabase"/);
});

test('the release and secrets steps each get only their own credentials', () => {
  const release = step(
    'Guard database history and release exact staging function',
  );
  const secrets = step('Set the staging function secrets');
  assert.match(release, /if: inputs\.operation != 'secrets'/);
  assert.match(secrets, /if: inputs\.operation == 'secrets'/);
  assert.match(
    release,
    /node --import tsx apps\/api\/scripts\/staging-release\.ts/,
  );
  assert.match(
    secrets,
    /node --import tsx scripts\/release\/staging-supabase\.mjs secrets/,
  );
  for (const body of [release, secrets]) {
    assert.match(body, /umask 077/);
    assert.match(body, /DO_NOT_TRACK: '1'/);
    assert.match(body, /SUPABASE_TELEMETRY_DISABLED: '1'/);
    assert.match(
      body,
      /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
    );
    assert.match(
      body,
      /SUPABASE_PROJECT_REF: \$\{\{ vars\.SUPABASE_PROJECT_REF \}\}/,
    );
    assert.match(
      body,
      /RELEASE_SHA: \$\{\{ needs\.validate\.outputs\.sha \}\}/,
    );
    assert.doesNotMatch(body, /GH_TOKEN|GITHUB_ACTIONS:|GITHUB_RUN_ID:/);
  }
  assert.match(
    release,
    /STAGING_RECOVERY_ATTESTATION: \$\{\{ secrets\.STAGING_RECOVERY_ATTESTATION \}\}/,
  );
  assert.doesNotMatch(release, /STAGING_FUNCTION_SECRETS/);
  assert.match(
    secrets,
    /STAGING_FUNCTION_SECRETS: \$\{\{ secrets\.STAGING_FUNCTION_SECRETS \}\}/,
  );
  assert.doesNotMatch(
    secrets,
    /MIGRATION_DATABASE_URL|DATABASE_CA_CERT|STAGING_RECOVERY_ATTESTATION|MIGRATION_PLAN/,
  );
  assert.match(secrets, /RELEASE_OPERATION: secrets/);
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
  assert.equal(run('reviewed', 'secrets').status, 0);
  assert.equal(run('reviewed', 'migrate-deploy', 'a'.repeat(64)).status, 0);
  assert.notEqual(run('reviewed', 'bootstrap').status, 0);
  for (const tag of [
    'missing',
    '$(touch exploited)',
    '--help',
    'reviewed^{commit}',
  ])
    assert.notEqual(run(tag).status, 0);
  assert.notEqual(run('reviewed', 'migrate-deploy', 'invalid').status, 0);
  assert.notEqual(run('reviewed', 'deploy', 'a'.repeat(64)).status, 0);
  assert.notEqual(run('reviewed', 'secrets', 'a'.repeat(64)).status, 0);
});
