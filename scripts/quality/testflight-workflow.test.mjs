import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
          RELEASE_BUILD_RUN_ID: buildId,
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
  assert.equal(check('beta-reviewed', 'submit', '123456789').status, 0);
  for (const [tag, operation, buildId] of [
    ['missing'],
    ['branch-only'],
    ['beta-unmerged'],
    ['../heads/main'],
    ['beta-reviewed; touch injected'],
    ['$(touch injected)'],
    ['beta-reviewed', 'deploy'],
    ['beta-reviewed', 'build', '123456789'],
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

test('native steps pin EAS, preflight the preview environment and never auto-submit or configure tester groups', () => {
  const install = step('Install pinned EAS CLI directly');
  assert.match(install, /npm install --global eas-cli@25\.3\.0/);
  assert.match(install, /eas --version/);
  assert.ok(
    workflow.indexOf('Install pinned EAS CLI directly') <
      workflow.indexOf('EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}'),
  );
  for (const source of steps.filter((value) => /EXPO_TOKEN:/.test(value))) {
    assert.match(source, /working-directory: apps\/mobile/);
    assert.match(source, /(?:run: |\n {10})eas env:exec preview /);
    // npm exec --package exports package selection that breaks EAS's nested npx.
    assert.doesNotMatch(source, /npm exec|\bnpx\b/);
    // Typed mode/operation may control secret exposure in env, never shell text.
    assert.doesNotMatch(
      source.split(/^ {8}run:/m)[1] ?? '',
      /\$\{\{\s*inputs\./,
    );
  }
  assert.match(
    step('Check resolved beta configuration'),
    /eas env:exec preview .*npm --prefix \.\.\/\.\. run release:beta:check.*--non-interactive/,
  );
  assert.match(
    step('Build signed beta on GitHub without uploading'),
    /eas build --platform ios --profile \$BETA_BUILD_PROFILE --local --freeze-credentials --non-interactive --output/,
  );
  assert.match(
    step('Upload exact beta artifact to TestFlight'),
    /eas submit --platform ios --profile beta --path .*justgo-beta-download\/JustGO\.ipa.*--non-interactive --wait --no-auto-testflight-setup/,
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

test('diagnostics is opt-in and its private build credential stays in the protected steps', () => {
  assert.match(
    workflow,
    /diagnostics:\n {8}description:[^\n]+\n {8}required: false\n {8}type: boolean\n {8}default: false/,
  );
  assert.match(
    workflow,
    /BETA_BUILD_PROFILE: \$\{\{ inputs.diagnostics && 'beta-diagnostics' \|\| 'beta' \}\}/,
  );
  assert.match(
    workflow,
    /BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION: \$\{\{ vars\./,
  );
  assert.doesNotMatch(workflow, /BETA_DIAGNOSTICS_ACCEPTED_IPA_SHA256/);
  for (const name of [
    'Check resolved beta configuration',
    'Build signed beta on GitHub without uploading',
  ])
    assert.match(
      step(name),
      /SENTRY_AUTH_TOKEN: \$\{\{ inputs.diagnostics && .*secrets.SENTRY_AUTH_TOKEN/,
    );
  assert.doesNotMatch(
    step('Upload exact beta artifact to TestFlight'),
    /SENTRY_AUTH_TOKEN:/,
  );
});

test('resolved EAS commands preserve explicit mode, native signing and the unchanged upload target', (t) => {
  const directory = temporary(t);
  const fakeEas = join(directory, 'eas');
  const output = join(directory, 'eas-args.json');
  writeFileSync(
    fakeEas,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.EAS_TEST_OUTPUT, JSON.stringify(process.argv.slice(2)));\n`,
    { mode: 0o700 },
  );
  for (const diagnostics of ['false', 'true']) {
    for (const name of [
      'Check resolved beta configuration',
      'Build signed beta on GitHub without uploading',
      'Upload exact beta artifact to TestFlight',
    ]) {
      const result = spawnSync(
        'bash',
        ['-e', '-o', 'pipefail', '-c', script(name)],
        {
          cwd: fileURLToPath(new URL('../../apps/mobile/', import.meta.url)),
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            EAS_TEST_OUTPUT: output,
            RELEASE_DIAGNOSTICS: diagnostics,
            BETA_BUILD_PROFILE:
              diagnostics === 'true' ? 'beta-diagnostics' : 'beta',
            RELEASE_OPERATION: name.startsWith('Upload') ? 'submit' : 'build',
            RUNNER_TEMP: directory,
            TMPDIR: join(directory, 'private-build'),
          },
          encoding: 'utf8',
        },
      );
      assert.equal(result.status, 0, result.stderr);
      const args = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(args[0], 'env:exec');
      assert.equal(args[1], 'preview');
      assert.equal(args[3], '--non-interactive');
      assert.match(
        args[2],
        new RegExp(`EXPO_PUBLIC_SENTRY_ENABLED=${diagnostics}\\b`),
      );
      if (name.startsWith('Check')) {
        assert.match(
          args[2],
          new RegExp(`RELEASE_DIAGNOSTICS=${diagnostics}\\b`),
        );
        assert.match(args[2], /run release:beta:check/);
      } else if (name.startsWith('Build')) {
        assert.match(
          args[2],
          new RegExp(
            `--profile ${diagnostics === 'true' ? 'beta-diagnostics' : 'beta'} --local --freeze-credentials`,
          ),
        );
      } else {
        assert.match(
          args[2],
          /eas submit --platform ios --profile beta --path/,
        );
        assert.match(args[2], /--no-auto-testflight-setup/);
      }
    }
  }
});

test('EAS can resolve the project before preview supplies the diagnostics DSN', () => {
  const beta = workflow.split(/^ {2}beta:$/m)[1];
  const bootstrap = beta.split(/^ {4}steps:$/m)[0];
  const flag = bootstrap.match(
    /^ {6}EXPO_PUBLIC_SENTRY_ENABLED: '(true|false)'$/m,
  );
  assert.ok(flag, 'Use an explicit bootstrap flag before preview is loaded.');
  const require = createRequire(import.meta.url);
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /^(?:EXPO_PUBLIC_|SENTRY_|EAS_BUILD_|JUSTGO_APP_VARIANT$|ICLOUD_CONTAINER_ENVIRONMENT$)/.test(
        key,
      )
    )
      delete env[key];
  const result = spawnSync(
    process.execPath,
    [require.resolve('expo/bin/cli'), 'config', '--json'],
    {
      cwd: fileURLToPath(new URL('../../apps/mobile/', import.meta.url)),
      env: {
        ...env,
        EXPO_NO_DOTENV: '1',
        IOS_BUNDLE_IDENTIFIER: 'com.anthonyyoo.justgo',
        EXPO_PUBLIC_SENTRY_ENABLED: flag[1],
        RELEASE_DIAGNOSTICS: 'true',
      },
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(
    config.extra.eas.projectId,
    '53cf0560-8ab5-446a-9bc6-deb193b337b5',
  );
  assert.equal(config.ios.bundleIdentifier, 'com.anthonyyoo.justgo');
  const privacy = config.plugins.find(
    (plugin) =>
      Array.isArray(plugin) &&
      plugin[0] === './plugins/with-sentry-privacy.cjs',
  );
  assert.equal(privacy[1].enabled, false);
});

test('native compilation uses the standard stable macOS runner and explicit supported tools', () => {
  const beta = workflow.split(/^ {2}beta:$/m)[1];
  const beforeSteps = beta.split(/^ {4}steps:$/m)[0];
  // runner is unavailable in job-level env; GitHub rejects the entire workflow.
  assert.doesNotMatch(beforeSteps, /\$\{\{\s*runner[.[]/);
  const build = step('Build signed beta on GitHub without uploading');
  assert.match(
    build,
    /EAS_LOCAL_BUILD_WORKINGDIR: \$\{\{ runner.temp \}\}\/justgo-beta-private\/work/,
  );
  assert.match(
    build,
    /EAS_LOCAL_BUILD_ARTIFACTS_DIR: \$\{\{ runner.temp \}\}\/justgo-beta-artifact/,
  );
  assert.match(beta, /^ {4}runs-on: macos-26$/m);
  assert.match(
    beta,
    /DEVELOPER_DIR: \/Applications\/Xcode_26\.6\.app\/Contents\/Developer/,
  );
  assert.match(step('Check native build tools'), /Xcode 26\.6/);
  assert.match(step('Check native build tools'), /17F113/);
  assert.match(step('Check native build tools'), /pod --version/);
  assert.match(step('Check native build tools'), /fastlane --version/);
  assert.match(step('Require clean reviewed source'), /git rev-parse HEAD/);
  assert.match(step('Require clean reviewed source'), /git status --porcelain/);
  assert.doesNotMatch(workflow, /eas build:view|--id |--wait --json/);
});

test('only the inspected app and public manifest are retained, with bounded storage and cleanup on failure', () => {
  const inspect = step('Inspect signed beta and record provenance');
  assert.ok(
    inspect.indexOf('inspect-beta-ipa.mjs') <
      inspect.indexOf('github-beta-artifact.mjs record'),
  );
  assert.match(inspect, /git status --porcelain/);
  const upload = step('Save only the installable app and public manifest');
  assert.match(
    upload,
    /name: justgo-ios-beta-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/,
  );
  assert.match(upload, /retention-days: 7/);
  assert.match(upload, /compression-level: 0/);
  assert.match(upload, /if-no-files-found: error/);
  const files = upload
    .match(/^ {10}path: \|\n((?: {12}.*\n)+)/m)?.[1]
    .trim()
    .split('\n')
    .map((value) => value.trim());
  assert.deepEqual(files, [
    '${{ runner.temp }}/justgo-beta-artifact/JustGO.ipa',
    '${{ runner.temp }}/justgo-beta-artifact/manifest.json',
  ]);
  const cleanup = step('Remove temporary build and signing files');
  assert.match(cleanup, /if: always\(\)/);
  assert.match(cleanup, /security delete-keychain/);
  assert.match(
    step('Build signed beta on GitHub without uploading'),
    /TMPDIR: \$\{\{ runner.temp \}\}\/justgo-beta-private/,
  );
  assert.match(
    step('Build signed beta on GitHub without uploading'),
    /umask 077/,
  );
  assert.match(
    cleanup,
    /rm -rf.*justgo-beta-private.*justgo-beta-artifact.*justgo-beta-download/,
  );
  assert.doesNotMatch(
    workflow,
    /EAS_LOCAL_BUILD_SKIP_CLEANUP|keyP8|credentials:.*local|security.*dump/,
  );
});

test('submission selects a successful run, checks the archive hash before extraction and rechecks signed bytes', () => {
  const select = step('Select exact successful GitHub build artifact');
  assert.match(select, /GH_TOKEN: \$\{\{ github.token \}\}/);
  assert.match(select, /actions\/workflows\/testflight-beta.yml/);
  assert.match(select, /actions\/runs\/\$RELEASE_BUILD_RUN_ID/);
  assert.match(select, /github-beta-artifact.mjs select/);
  const download = step('Download and verify the exact installable app');
  assert.match(download, /actions\/artifacts\/\$ARTIFACT_ID\/zip/);
  assert.ok(download.indexOf('verify-archive') < download.indexOf('unzip -q'));
  assert.ok(
    download.indexOf('unzip -q') <
      download.indexOf('github-beta-artifact.mjs verify '),
  );
  assert.ok(
    download.indexOf('github-beta-artifact.mjs verify ') <
      download.indexOf('inspect-beta-ipa.mjs'),
  );
  assert.ok(
    workflow.indexOf('Download and verify the exact installable app') <
      workflow.indexOf('Upload exact beta artifact to TestFlight'),
  );
  for (const name of [
    'Select exact successful GitHub build artifact',
    'Download and verify the exact installable app',
    'Upload exact beta artifact to TestFlight',
  ])
    assert.match(step(name), /if: inputs.operation == 'submit'/);
});
