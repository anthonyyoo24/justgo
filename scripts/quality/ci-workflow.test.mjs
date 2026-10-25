import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  action,
  commands,
  jobs,
  rootPackage,
  workflow,
} from './ci-workflow-fixture.mjs';

const [triggers] = workflow.split(/^permissions:$/m);
const producers = [
  'static',
  'unit',
  'database',
  'journeys',
  'exports',
  'native-icloud',
];

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
  assert.deepEqual(Object.keys(jobs), [...producers, 'checks']);
  for (const name of producers) assert.doesNotMatch(jobs[name], /^ {4}needs:/m);
  for (const [name, job] of Object.entries(jobs)) {
    assert.match(job, /^ {4}timeout-minutes: [1-9]\d*$/m);
    assert.match(job, /persist-credentials: false/);
    if (name !== 'native-icloud')
      assert.match(job, /uses: \.\/\.github\/actions\/setup-node/);
  }
  assert.match(
    jobs.checks,
    /^ {4}needs: \[static, unit, database, journeys, exports, native-icloud\]$/m,
  );
  assert.match(jobs.checks, /^ {4}if: always\(\)$/m);
  assert.match(
    jobs.checks,
    /run: node scripts\/quality\/api-coverage.mjs require-jobs/,
  );
  assert.match(jobs.checks, /JUSTGO_CI_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
});

test('native iCloud regressions run on a bounded macOS producer without npm prerequisites', () => {
  const job = jobs['native-icloud'];
  assert.match(job, /^ {4}runs-on: macos-15$/m);
  assert.match(job, /^ {4}timeout-minutes: 10$/m);
  assert.match(
    job,
    /uses: actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/,
  );
  assert.deepEqual(commands(job), [
    'swift test --package-path apps/mobile/modules/justgo-icloud --scratch-path .local/justgo-icloud-swift --jobs 1',
  ]);
  assert.doesNotMatch(job, /setup-node|\bnpm\b|\bnode\b|continue-on-error/);
});

test('static checks retain fresh route typechecking and audit only API production dependencies', () => {
  const runs = commands(jobs.static);
  assert.ok(
    runs.indexOf('npm run doctor -w @justgo/mobile') <
      runs.indexOf('npm run check:static'),
  );
  assert.ok(runs.includes('npm run audit:api'));
  assert.equal(
    rootPackage.scripts['audit:api'],
    'node scripts/quality/audit-api-dependencies.mjs',
  );
  assert.match(rootPackage.scripts['check:static'], /npm run typecheck/);
  assert.match(
    rootPackage.scripts['check:static'],
    /npm run test:architecture$/,
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

test('unit and database suites run once and API coverage merges without rerunning tests', () => {
  assert.deepEqual(commands(jobs.unit), [
    'npm run test:coverage -w @justgo/mobile',
    'npm run test:coverage -w @justgo/contracts',
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
      /run: npm run (?:check$|test$|test:db$|test:migrations$|test:coverage$)/m,
    );
  assert.match(
    jobs.checks,
    /node scripts\/quality\/api-coverage.mjs merge\n {10}npm run coverage:check/,
  );
  assert.match(rootPackage.scripts['test:coverage'], /--workspaces/);
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
  assert.match(jobs.database, /- run: npm run db:migrate/);
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
  assert.match(setup, /- run: npx playwright install-deps chromium/);
  assert.match(
    setup,
    /if: steps.browser-cache.outputs.cache-hit != 'true'\n {6}run: npx playwright install chromium/,
  );
  for (const name of ['journeys', 'exports'])
    assert.match(jobs[name], /uses: \.\/\.github\/actions\/setup-playwright/);
  assert.ok(
    jobs.exports.indexOf('npm run export:web -w @justgo/mobile') <
      jobs.exports.indexOf('npm run test:exported-web'),
  );
  assert.ok(
    jobs.exports.indexOf('npm run test:exported-web') <
      jobs.exports.indexOf('npm run export:ios -w @justgo/mobile'),
  );
});

test('every external action has an immutable reviewed-release pin and updates are configured', () => {
  const definitions = [
    workflow,
    action('setup-node'),
    action('setup-database'),
    action('setup-playwright'),
  ];
  let external = 0;
  for (const source of definitions)
    for (const [, reference] of source.matchAll(/\buses: ([^\s]+)/g)) {
      if (reference.startsWith('./')) continue;
      external++;
      assert.match(reference, /^actions\/[\w-]+@[a-f0-9]{40}$/);
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
    'npm run doctor -w @justgo/mobile && npm run check:static && npm run test --workspaces',
  );
});
