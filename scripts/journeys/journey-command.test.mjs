import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { runJourney } from './journey-command.mjs';
import { assertJourneyPortsAvailable } from './journey-ports.mjs';
import { action, jobs, workflow } from '../quality/ci-workflow-fixture.mjs';

const environment = {
  DATABASE_URL:
    'postgresql://justgo_runtime:fixture@127.0.0.1:5432/justgo_test',
  MIGRATION_DATABASE_URL:
    'postgresql://justgo_migrator:fixture@127.0.0.1:5432/justgo_test',
  DATABASE_SSL: 'disable',
  NO_COLOR: '1',
};

test('journey command checks ports and prerequisites before services and preserves a saved assertion failure status', async () => {
  const calls = [];
  const result = await runJourney({
    environment,
    args: ['--grep', 'saved case'],
    checkPorts: async () => {
      calls.push(['ports']);
    },
    run: async (command, args, env) => {
      assert.equal(env.NO_COLOR, undefined);
      assert.equal(env.EXPO_PUBLIC_SENTRY_ENABLED, 'true');
      assert.equal(env.EXPO_PUBLIC_SENTRY_ENVIRONMENT, 'development');
      assert.equal(
        env.EXPO_PUBLIC_SENTRY_DSN,
        'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o123.ingest.us.sentry.io/4512279181459456',
      );
      calls.push([command, ...args]);
      return command === 'npx' ? 23 : 0;
    },
  });
  assert.equal(result, 23);
  assert.deepEqual(calls, [
    ['ports'],
    ['npm', 'run', 'build:contracts'],
    ['npm', 'run', 'db:migrate'],
    ['node', 'scripts/journeys/build-journey-repository.mjs'],
    [
      'npx',
      'playwright',
      'test',
      '--config=e2e/playwright.config.ts',
      '--grep',
      'saved case',
    ],
  ]);
});

test('failed prerequisites stop before starting services or later commands', async () => {
  for (const failedStep of ['build:contracts', 'db:migrate']) {
    const calls = [];
    const result = await runJourney({
      environment,
      checkPorts: async () => {},
      run: async (command, args) => {
        calls.push([command, ...args]);
        return args.includes(failedStep) ? 23 : 0;
      },
    });
    assert.equal(result, 23);
    assert.deepEqual(calls, [
      ['npm', 'run', 'build:contracts'],
      ...(failedStep === 'db:migrate' ? [['npm', 'run', 'db:migrate']] : []),
    ]);
  }
});

test('unsafe environments are rejected before probing ports or running commands', async () => {
  const calls = [];
  await assert.rejects(
    runJourney({
      environment: { ...environment, NODE_ENV: 'production' },
      checkPorts: async () => {
        calls.push('ports');
      },
      run: async () => {
        calls.push('command');
        return 0;
      },
    }),
    /Journey fixtures require a local test environment/,
  );
  assert.deepEqual(calls, []);
});

test('an occupied fixture port prevents every command, including contract migration', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  const calls = [];
  try {
    await assert.rejects(
      runJourney({
        environment,
        checkPorts: () => assertJourneyPortsAvailable([url]),
        run: async () => {
          calls.push('command');
          return 0;
        },
      }),
      /stop its existing service before migrations/,
    );
    assert.deepEqual(calls, []);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  // Success also releases the temporary preflight listener immediately.
  await assertJourneyPortsAvailable([url]);
  await assertJourneyPortsAvailable([url]);
});

test('required CI runs every saved journey using its provisioned test database and verifies the failure report path', () => {
  assert.match(workflow, /POSTGRES_DB: justgo_test/);
  for (const name of ['setup-node', 'setup-database', 'setup-playwright'])
    assert.match(
      jobs.journeys,
      new RegExp(`uses: \\.\\/\\.github\\/actions\\/${name}`),
    );
  assert.match(action('setup-node'), /npm ci/);
  assert.match(
    action('setup-playwright'),
    /npx playwright install-deps chromium/,
  );
  assert.match(action('setup-playwright'), /npx playwright install chromium/);
  assert.match(action('setup-database'), /apps\/api\/scripts\/provision\.sql/);
  assert.match(workflow, /env: &database-test-env/);
  assert.match(
    workflow,
    /DATABASE_URL: postgresql:\/\/justgo_runtime:[^\n]+\/justgo_test/,
  );
  assert.match(
    workflow,
    /MIGRATION_DATABASE_URL: postgresql:\/\/justgo_migrator:[^\n]+\/justgo_test/,
  );
  assert.match(workflow, /DATABASE_SSL: disable/);
  assert.match(workflow, /JUSTGO_PG_BIN: \/usr\/lib\/postgresql\/17\/bin/);
  assert.match(jobs.journeys, /^ {4}env: \*database-test-env$/m);
  assert.match(
    jobs.journeys,
    /name: Verify app\/API\/database journeys\n\s+run: \|\n\s+npm run test:journey\n\s+test -s \.local\/journey-report\/index\.html/,
  );
  assert.doesNotMatch(workflow, /continue-on-error:/);
});
