import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/testflight-beta.yml', import.meta.url),
  'utf8',
);
const steps = workflow.split(/^ {6}- /m).slice(1);
const step = (name) => {
  const source = steps.find((value) => value.startsWith(`name: ${name}\n`));
  assert.ok(source, `Missing workflow step: ${name}`);
  return source;
};
const script = (name) => {
  const source = step(name).match(/^ {8}run: \|\n((?: {10}.*(?:\n|$))+)/m);
  assert.ok(source, `Missing executable guard: ${name}`);
  return source[1]
    .trimEnd()
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
};
const nodeScript = (name) => {
  const source = script(name).match(
    /node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/,
  );
  assert.ok(source, `Missing Node guard: ${name}`);
  return source[1];
};
const temporary = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'justgo-beta-workflow-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const runGuard = (name, file, value, env, directory) => {
  writeFileSync(join(directory, file), JSON.stringify(value));
  return spawnSync(process.execPath, ['--input-type=module'], {
    input: nodeScript(name),
    env: { ...process.env, RUNNER_TEMP: directory, ...env },
    encoding: 'utf8',
  });
};

test('only manual dispatch from main can reach a separately approved build or upload', () => {
  const [trigger] = workflow.split(/^permissions:$/m);
  assert.match(trigger, /^ {2}workflow_dispatch:$/m);
  assert.doesNotMatch(
    trigger,
    /^ {2}(push|pull_request|workflow_run|schedule):/m,
  );
  assert.match(trigger, /options: \[build, submit\]/);
  assert.equal(
    [
      ...workflow.matchAll(
        /if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/g,
      ),
    ].length,
    2,
  );
  assert.match(workflow, /^ {4}needs: validate$/m);
  assert.match(
    workflow,
    /^ {4}environment:\n {6}name: testflight-beta\n {6}url: https:\/\/justgo-two\.vercel\.app$/m,
  );
  assert.match(workflow, /^ {2}cancel-in-progress: false$/m);
  assert.match(
    workflow,
    /^permissions:\n {2}contents: read\n {2}actions: read$/m,
  );
  assert.doesNotMatch(workflow, /permissions:[\s\S]*?\bwrite\b/);
  assert.match(workflow, /ref: \$\{\{ needs.validate.outputs.sha \}\}/);
});

test('the tag guard resolves exact existing tags on main and rejects unsafe or unrelated input', (t) => {
  const directory = temporary(t);
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'JustGO workflow test',
    GIT_AUTHOR_EMAIL: 'workflow@example.invalid',
    GIT_COMMITTER_NAME: 'JustGO workflow test',
    GIT_COMMITTER_EMAIL: 'workflow@example.invalid',
  };
  const git = (...args) => {
    const result = spawnSync('git', args, {
      cwd: directory,
      env: gitEnv,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  writeFileSync(join(directory, 'source.txt'), 'reviewed source\n');
  git('add', 'source.txt');
  git('commit', '-qm', 'Reviewed release');
  const sha = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', sha);
  git('tag', '-a', 'beta-reviewed', '-m', 'Reviewed beta');
  git('branch', 'branch-only');
  const other = spawnSync('git', ['commit-tree', 'HEAD^{tree}'], {
    cwd: directory,
    env: gitEnv,
    encoding: 'utf8',
    input: 'Unreviewed source\n',
  });
  assert.equal(other.status, 0, other.stderr);
  git('tag', 'beta-unmerged', other.stdout.trim());
  const output = join(directory, 'output');
  const check = (tag, operation = 'build', buildId = '') =>
    spawnSync(
      'bash',
      [
        '-e',
        '-o',
        'pipefail',
        '-c',
        script('Validate existing tag and operation'),
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          RELEASE_TAG: tag,
          RELEASE_OPERATION: operation,
          RELEASE_BUILD_ID: buildId,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: join(directory, 'summary'),
        },
      },
    );
  const accepted = check('beta-reviewed');
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(readFileSync(output, 'utf8'), `sha=${sha}\n`);
  assert.match(
    readFileSync(join(directory, 'summary'), 'utf8'),
    new RegExp(sha),
  );
  assert.equal(
    check('beta-reviewed', 'submit', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
      .status,
    0,
  );
  for (const [tag, operation, buildId] of [
    ['missing'],
    ['branch-only'],
    ['beta-unmerged'],
    ['../heads/main'],
    ['beta-reviewed; touch injected'],
    ['$(touch injected)'],
    ['beta-reviewed', 'deploy'],
    ['beta-reviewed', 'build', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    ['beta-reviewed', 'submit', ''],
    ['beta-reviewed', 'submit', '--latest'],
  ]) {
    assert.notEqual(
      check(tag, operation, buildId).status,
      0,
      `${tag}/${operation}/${buildId}`,
    );
  }
});

test('Foundation readiness uses the latest main push result for the exact tag commit', (t) => {
  const directory = temporary(t);
  const passed = {
    head_sha: 'a'.repeat(40),
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
  };
  const check = (runs) =>
    runGuard(
      'Require successful Foundation checks for this commit',
      'beta-foundation.json',
      { workflow_runs: runs },
      { RELEASE_SHA: passed.head_sha },
      directory,
    );
  assert.equal(check([passed]).status, 0);
  for (const failed of [
    { ...passed, head_sha: 'b'.repeat(40) },
    { ...passed, head_branch: 'feature' },
    { ...passed, event: 'pull_request' },
    { ...passed, status: 'in_progress', conclusion: null },
    { ...passed, conclusion: 'failure' },
    { ...passed, conclusion: 'cancelled' },
  ]) {
    assert.notEqual(check([failed, passed]).status, 0);
  }
  assert.notEqual(check([]).status, 0);
  assert.match(
    script('Require successful Foundation checks for this commit'),
    /gh api --method GET .*actions\/workflows\/ci.yml\/runs.*-f head_sha="\$RELEASE_SHA".*-f event=push.*-f branch=main.*-f per_page=1/,
  );
});

test('both environment gates reject missing reviewers and unreadable protection before Expo access', (t) => {
  const directory = temporary(t);
  const approved = {
    name: 'testflight-beta',
    protection_rules: [
      {
        type: 'required_reviewers',
        reviewers: [{ type: 'User', reviewer: { id: 42 } }],
      },
    ],
  };
  for (const name of [
    'Require configured beta approval protection',
    'Recheck beta approval protection',
  ]) {
    const check = (value) =>
      runGuard(name, 'beta-environment.json', value, {}, directory);
    assert.equal(check(approved).status, 0);
    for (const denied of [
      {},
      { ...approved, name: 'production' },
      { ...approved, protection_rules: [] },
      {
        ...approved,
        protection_rules: [{ type: 'wait_timer', wait_timer: 30 }],
      },
      {
        ...approved,
        protection_rules: [{ type: 'required_reviewers', reviewers: [] }],
      },
      {
        ...approved,
        protection_rules: [{ type: 'required_reviewers', reviewers: [{}] }],
      },
    ])
      assert.notEqual(check(denied).status, 0);
    const source = script(name);
    assert.match(
      source,
      /gh api "repos\/\$GITHUB_REPOSITORY\/environments\/testflight-beta" >/,
    );
    assert.doesNotMatch(source, /\|\|\s*(true|:)|continue-on-error/);
    assert.doesNotMatch(step(name), /EXPO_TOKEN/);
  }
  assert.ok(
    workflow.indexOf('name: Require configured beta approval protection') <
      workflow.indexOf('\n  beta:'),
  );
  assert.ok(
    workflow.indexOf('name: Recheck beta approval protection') <
      workflow.indexOf('EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}'),
  );
});

test('upload guard requires the completed real-device store beta for the correct app, owner and exact SHA', (t) => {
  const directory = temporary(t);
  const build = {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    app: {
      id: '53cf0560-8ab5-446a-9bc6-deb193b337b5',
      ownerAccount: { name: 'anthonyyoos-team' },
    },
    appIdentifier: 'com.anthonyyoo.justgo',
    platform: 'IOS',
    distribution: 'STORE',
    buildProfile: 'beta',
    isForIosSimulator: false,
    status: 'FINISHED',
    gitCommitHash: 'a'.repeat(40),
  };
  const check = (value, env = {}) =>
    runGuard(
      'Validate build ownership and commit',
      'beta-build.json',
      value,
      {
        RELEASE_OPERATION: 'submit',
        RELEASE_BUILD_ID: build.id,
        RELEASE_SHA: build.gitCommitHash,
        GITHUB_STEP_SUMMARY: join(directory, 'summary'),
        ...env,
      },
      directory,
    );
  assert.equal(check(build).status, 0);
  assert.equal(
    check([build], { RELEASE_OPERATION: 'build', RELEASE_BUILD_ID: '' }).status,
    0,
  );
  for (const value of [
    null,
    [],
    [build, build],
    { ...build, id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' },
    { ...build, app: { ...build.app, id: 'another-project' } },
    { ...build, app: { ...build.app, ownerAccount: { name: 'another-team' } } },
    { ...build, appIdentifier: 'dev.justgo.foundation' },
    { ...build, platform: 'ANDROID' },
    { ...build, distribution: 'INTERNAL' },
    { ...build, buildProfile: 'production' },
    { ...build, isForIosSimulator: true },
    { ...build, isForIosSimulator: undefined },
    { ...build, status: 'IN_PROGRESS' },
    { ...build, status: 'ERRORED' },
    { ...build, gitCommitHash: 'b'.repeat(40) },
    { ...build, gitCommitHash: undefined },
  ])
    assert.notEqual(check(value).status, 0, JSON.stringify(value));
});

test('native steps pin EAS, preflight the preview environment and never auto-submit or configure tester groups', () => {
  for (const source of steps.filter((value) => /EXPO_TOKEN:/.test(value))) {
    assert.match(source, /working-directory: apps\/mobile/);
    assert.match(source, /npm exec --yes --package=eas-cli@25\.3\.0 -- eas /);
    assert.doesNotMatch(source, /\$\{\{\s*inputs\./);
  }
  assert.match(
    step('Check resolved beta configuration'),
    /eas env:exec preview .*npm --prefix \.\.\/\.\. run release:beta:check.*--non-interactive/,
  );
  assert.match(
    step('Build signed beta without uploading'),
    /eas build --platform ios --profile beta --non-interactive --wait --json/,
  );
  assert.match(
    step('Read the exact build selected for upload'),
    /eas build:view "\$RELEASE_BUILD_ID" --json/,
  );
  assert.match(
    step('Upload exact beta build to TestFlight'),
    /eas submit --platform ios --profile beta --id "\$RELEASE_BUILD_ID" --non-interactive --wait --no-auto-testflight-setup/,
  );
  assert.doesNotMatch(
    workflow,
    /--latest|--auto-submit|--groups|eas update|eas deploy|vercel deploy/,
  );
  assert.doesNotMatch(workflow, /continue-on-error|@latest/);
  for (const [, reference] of workflow.matchAll(/\buses: ([^\s]+)/g)) {
    if (reference.startsWith('./')) continue;
    assert.match(reference, /^actions\/[\w-]+@[a-f0-9]{40}$/);
  }
});
