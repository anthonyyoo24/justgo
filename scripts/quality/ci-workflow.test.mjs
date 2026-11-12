import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import yaml from 'js-yaml';
import {
  action,
  commands,
  jobs,
  rootPackage,
  workflow,
} from './ci-workflow-fixture.mjs';

const [triggers] = workflow.split(/^permissions:$/m);
const appJobs = ['unit', 'database', 'journeys', 'exports', 'native-icloud'];
const producers = ['static', 'dependencies', ...appJobs];
const workflowsUrl = new URL('../../.github/workflows/', import.meta.url);
const actionsUrl = new URL('../../.github/actions/', import.meta.url);
const actionEntries = readdirSync(actionsUrl);
const actionFolders = actionEntries.filter((name) =>
  existsSync(new URL(`${name}/action.yml`, actionsUrl)),
);
const definitions = [
  ...readdirSync(workflowsUrl)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => readFileSync(new URL(name, workflowsUrl), 'utf8')),
  ...actionFolders.map(action),
];
const doctorSkip = /\bEXPO_(?:OFFLINE|NO_DEPENDENCY_VALIDATION|DOCTOR_\w+)\b/g;
const doctorOptIns = new Set(['EXPO_DOCTOR_ENABLE_DIRECTORY_CHECK']);
const doctorSkipsIn = (source) => {
  const found = [];
  const visit = (value) => {
    if (typeof value === 'string')
      found.push(
        ...[...value.matchAll(doctorSkip)]
          .map(([name]) => name)
          .filter((name) => !doctorOptIns.has(name)),
      );
    else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        visit(key);
        visit(child);
      }
  };
  visit(yaml.load(source));
  return found;
};

test('every .github/actions entry is a composite action folder with action.yml', () => {
  assert.deepEqual(
    actionEntries.filter((name) => !actionFolders.includes(name)),
    [],
    'Keep only action folders in .github/actions, each with its definition named action.yml, not action.yaml',
  );
  assert.ok(actionFolders.length > 0);
});

test('database CI runs real Worker, Edge and encrypted recovery boundaries after shared prerequisites', () => {
  const job = jobs.database;
  assert.match(job, /postgresql-client-17 age/);
  const runs = commands(job);
  for (const command of [
    'pnpm run test:workers',
    'pnpm run test:edge',
    'pnpm run test:backup:recovery',
  ]) {
    assert.ok(runs.includes(command));
    assert.ok(runs.indexOf('pnpm run db:migrate') < runs.indexOf(command));
    assert.ok(
      runs.indexOf('node scripts/quality/api-coverage.mjs database') <
        runs.indexOf(command),
    );
  }
  assert.match(
    rootPackage.scripts['test:backup:recovery'],
    /scripts\/backups\/rehearse\.mjs/,
  );
});

test('pushes run only for main, PRs cancel older revisions, and main results stay independent', () => {
  assert.match(triggers, /^ {2}push:\n {4}branches: \[main\]$/m);
  assert.match(triggers, /^ {2}pull_request:$/m);
  assert.doesNotMatch(triggers, /schedule:/);
  assert.match(workflow, /^ {2}cancel-in-progress: true$/m);
  const group = workflow.match(/^ {2}group: (.+)$/m)?.[1];
  assert.match(group, /github\.event\.pull_request\.number \|\| github\.sha/);
  assert.match(group, /github\.event_name/);
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
});

test('independent bounded producer jobs feed one always-evaluated required status', () => {
  assert.deepEqual(Object.keys(jobs), ['changes', ...producers, 'checks']);
  assert.doesNotMatch(jobs.static, /^ {4}needs:/m);
  assert.match(jobs.dependencies, /^ {4}needs: changes$/m);
  assert.match(
    jobs.dependencies,
    /^ {4}if: needs\.changes\.outputs\.dependencies == 'true'$/m,
  );
  for (const name of appJobs) {
    assert.match(jobs[name], /^ {4}needs: changes$/m);
    assert.match(
      jobs[name],
      name === 'native-icloud'
        ? /^ {4}if: needs\.changes\.outputs\.icloud == 'true'$/m
        : /^ {4}if: needs\.changes\.outputs\.app == 'true'$/m,
    );
  }
  for (const [name, job] of Object.entries(jobs)) {
    assert.match(job, /^ {4}timeout-minutes: [1-9]\d*$/m);
    assert.match(job, /persist-credentials: false/);
    if (!['changes', 'native-icloud', 'checks'].includes(name))
      assert.match(job, /uses: \.\/\.github\/actions\/setup-node/);
  }
  assert.deepEqual(yaml.load(workflow).jobs.checks.needs, [
    'changes',
    ...producers,
  ]);
  assert.match(jobs.checks, /^ {4}if: always\(\)$/m);
  assert.match(
    jobs.checks,
    /run: node scripts\/quality\/api-coverage.mjs require-jobs/,
  );
  assert.match(jobs.checks, /JUSTGO_CI_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.deepEqual(commands(jobs.checks), [
    'node scripts/quality/api-coverage.mjs require-jobs',
  ]);
});

test('the change classifier runs first, reads the full PR diff and only feeds the app-job condition', () => {
  const job = jobs.changes;
  assert.match(job, /^ {4}timeout-minutes: 5$/m);
  assert.match(job, /fetch-depth: 0/);
  assert.match(job, /^ {6}app: \$\{\{ steps\.classify\.outputs\.app \}\}$/m);
  assert.match(
    job,
    /^ {6}icloud: \$\{\{ steps\.classify\.outputs\.icloud \}\}$/m,
  );
  assert.match(
    job,
    /^ {6}dependencies: \$\{\{ steps\.classify\.outputs\.dependencies \}\}$/m,
  );
  assert.match(job, /JUSTGO_CI_EVENT: \$\{\{ github\.event_name \}\}/);
  assert.match(
    job,
    /JUSTGO_CI_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.deepEqual(commands(job), ['node scripts/quality/ci-changes.mjs']);
  assert.doesNotMatch(
    job,
    /^ {4}needs:|setup-node|continue-on-error|\|\|\s*true/m,
  );
});

test('native iCloud regressions run on a bounded macOS producer without pnpm prerequisites', () => {
  const job = jobs['native-icloud'];
  assert.match(job, /^ {4}runs-on: macos-15$/m);
  assert.match(job, /^ {4}timeout-minutes: 10$/m);
  assert.match(
    job,
    /uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/,
  );
  assert.deepEqual(commands(job), [
    'swift test --package-path apps/mobile/modules/justgo-icloud --scratch-path .local/justgo-icloud-swift --jobs 1',
  ]);
  assert.doesNotMatch(job, /setup-node|\bp?npm\b|\bnode\b|continue-on-error/);
});

test('every job installs the pinned pnpm from the frozen lockfile through one cached store', () => {
  const setup = action('setup-node');
  assert.match(setup, /node-version-file: \.nvmrc/);
  assert.match(setup, /corepack enable pnpm/);
  assert.match(
    setup,
    /key: \$\{\{ runner\.os \}\}-pnpm-store-\$\{\{ hashFiles\('pnpm-lock\.yaml'\) \}\}/,
  );
  assert.match(setup, /- run: pnpm install --frozen-lockfile\n/);
  assert.doesNotMatch(setup, /\bnpm (?:ci|install)\b|cache: npm/);
  assert.match(rootPackage.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
});

test('static keeps fresh route typechecking, and live Doctor and the API production audit run in their own job', () => {
  assert.deepEqual(commands(jobs.static).slice(-1), ['pnpm run check:static']);
  assert.doesNotMatch(jobs.static, /run doctor|audit:api/);
  assert.deepEqual(commands(jobs.dependencies), [
    'pnpm --filter @justgo/mobile run doctor',
    'pnpm run audit:api',
  ]);
  assert.equal(
    rootPackage.scripts['audit:api'],
    'node scripts/quality/audit-api-dependencies.mjs',
  );
  assert.match(rootPackage.scripts['check:static'], /pnpm run typecheck/);
  assert.match(
    rootPackage.scripts['check:static'],
    /pnpm run test:architecture$/,
  );
});

test('static CI checks workflow syntax and context availability with a checksum-pinned validator', () => {
  const validator = jobs.static.match(
    / {6}- name: Validate GitHub workflow definitions\n([\s\S]*?)(?= {6}- uses:)/,
  )?.[1];
  assert.ok(validator);
  assert.match(
    validator,
    /https:\/\/github.com\/rhysd\/actionlint\/releases\/download\/v1\.7\.12\/actionlint_1\.7\.12_linux_amd64.tar.gz/,
  );
  assert.match(
    validator,
    /8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8/,
  );
  assert.match(validator, /sha256sum --check/);
  assert.match(
    validator,
    /"\$RUNNER_TEMP\/actionlint" -shellcheck= -pyflakes=/,
  );
  assert.doesNotMatch(validator, /\|\|\s*true|continue-on-error/);
});

test('unit and database suites run once', () => {
  assert.deepEqual(commands(jobs.unit), [
    'pnpm --filter @justgo/mobile run test:coverage',
    'pnpm --filter @justgo/contracts run test:coverage',
    'node scripts/quality/api-coverage.mjs unit',
  ]);
  assert.ok(
    commands(jobs.database).includes(
      'node scripts/quality/api-coverage.mjs database',
    ),
  );
  for (const job of Object.values(jobs))
    assert.doesNotMatch(
      job,
      /run: pnpm run (?:check$|test$|test:db$|test:migrations$|test:coverage$)/m,
    );
  assert.match(
    rootPackage.scripts['test:coverage'],
    /pnpm -r run test:coverage/,
  );
});

test('database and journey prerequisites share isolated roles without ignored env files', () => {
  assert.match(jobs.database, /^ {4}env: &database-test-env$/m);
  assert.match(
    jobs.database,
    /justgo_runtime:runtime-ci-only@localhost:5432\/justgo_test/,
  );
  assert.match(
    jobs.database,
    /justgo_migrator:migration-ci-only@localhost:5432\/justgo_test/,
  );
  assert.match(
    jobs.database,
    /JUSTGO_TEST_ADMIN_DATABASE_URL: postgresql:\/\/postgres:local-ci-only@localhost:5432\/justgo_test/,
  );
  assert.match(jobs.database, /DATABASE_SSL: disable/);
  assert.match(jobs.journeys, /^ {4}env: \*database-test-env$/m);
  assert.match(jobs.journeys, /^ {4}services: \*postgres-service$/m);
  for (const name of ['database', 'journeys'])
    assert.match(jobs[name], /uses: \.\/\.github\/actions\/setup-database/);
  assert.match(jobs.database, /- run: pnpm run db:migrate/);
  // The journey wrapper validates its environment and migrates before service start.
  assert.doesNotMatch(action('setup-database'), /db:migrate/);
  assert.match(action('setup-database'), /apps\/api\/scripts\/provision.sql/);
  assert.match(jobs.database, /postgresql-client-17/);
});

test('browser cache is versioned, installs system dependencies on hits, and exports smoke uses web output', () => {
  const setup = action('setup-playwright');
  assert.match(setup, /require\('@playwright\/test\/package.json'\).version/);
  assert.match(setup, /path: ~\/\.cache\/ms-playwright/);
  assert.match(
    setup,
    /key: \$\{\{ runner.os \}\}-playwright-\$\{\{ steps.playwright.outputs.version \}\}/,
  );
  assert.match(setup, /- run: pnpm exec playwright install-deps chromium/);
  assert.match(
    setup,
    /if: steps.browser-cache.outputs.cache-hit != 'true'\n {6}run: pnpm exec playwright install chromium/,
  );
  for (const name of ['journeys', 'exports'])
    assert.match(jobs[name], /uses: \.\/\.github\/actions\/setup-playwright/);
  assert.ok(
    jobs.exports.indexOf('pnpm --filter @justgo/mobile run export:web') <
      jobs.exports.indexOf('pnpm run test:exported-web'),
  );
  assert.ok(
    jobs.exports.indexOf('pnpm run test:exported-web') <
      jobs.exports.indexOf('pnpm --filter @justgo/mobile run export:ios'),
  );
});

test('every external action in every workflow has an immutable reviewed-release pin and updates are configured', () => {
  let external = 0;
  for (const source of definitions)
    for (const [, reference, comment] of source.matchAll(
      /\buses: (\S+)(.*)$/gm,
    )) {
      if (reference.startsWith('./')) continue;
      external++;
      // GitHub's own actions, plus the Supabase CLI setup the staging lane pins.
      assert.match(
        reference,
        /^(?:actions\/[\w-]+|supabase\/setup-cli)@[a-f0-9]{40}$/,
      );
      assert.match(
        comment,
        /^ # v\d+\.\d+\.\d+$/,
        `${reference} needs its release version after the SHA, as in "# v7.0.1"`,
      );
    }
  assert.ok(external > 5);
  const updates = readFileSync(
    new URL('../../.github/dependabot.yml', import.meta.url),
    'utf8',
  );
  assert.match(updates, /package-ecosystem: github-actions/);
  assert.match(updates, /package-ecosystem: npm/);
  assert.equal([...updates.matchAll(/interval: weekly/g)].length, 2);
});

test('Expo Doctor runs live in CI without offline mode or skipped checks', () => {
  for (const source of definitions)
    assert.deepEqual(
      doctorSkipsIn(source),
      [],
      'Fix the Expo Doctor finding instead of hiding live metadata checks',
    );
});

test('the Expo Doctor ban reads variables and commands, not YAML comments or opt-in checks', () => {
  assert.deepEqual(
    doctorSkipsIn(`
# EXPO_OFFLINE stays unset so Expo Doctor reads live metadata.
env:
  EXPO_DOCTOR_ENABLE_DIRECTORY_CHECK: 1
`),
    [],
  );
  assert.deepEqual(
    doctorSkipsIn(`
env:
  EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK: 1
steps:
  - run: EXPO_OFFLINE=1 pnpm run check
  - run: pnpm run doctor
    env: { EXPO_NO_DEPENDENCY_VALIDATION: 1 }
`),
    [
      'EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK',
      'EXPO_OFFLINE',
      'EXPO_NO_DEPENDENCY_VALIDATION',
    ],
  );
});

test('Jest uses one local worker and two on CI without changing local verification ordering', () => {
  const source = readFileSync(
    new URL('../../apps/mobile/jest.config.cjs', import.meta.url),
    'utf8',
  );
  for (const [CI, expected] of [
    [undefined, 1],
    ['true', 2],
  ]) {
    const module = { exports: {} };
    runInNewContext(source, {
      module,
      process: { env: { CI } },
      require: { resolve: (value) => value },
    });
    assert.equal(module.exports.maxWorkers, expected);
  }
  assert.equal(
    rootPackage.scripts.check,
    'pnpm --filter @justgo/mobile run doctor && pnpm run check:static && pnpm -r run test',
  );
});
