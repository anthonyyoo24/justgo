import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { stagingRunnerFailureCode } from './staging-api.mjs';
import {
  dispatchRelease,
  dryRun,
  localReleaseArguments,
  receiptsFrom,
  runLocalStagingRelease,
  taggedSource,
} from './staging-local.mjs';

const sha = 'a'.repeat(40);
const plan = 'b'.repeat(64);
const code = async (work) => {
  try {
    await work();
  } catch (error) {
    return stagingRunnerFailureCode(error);
  }
  assert.fail('expected a release failure');
};
const gitFake =
  ({ status = '', head = sha, tagged = sha } = {}) =>
  async (command, args) => {
    assert.equal(command, 'git');
    if (args[0] === 'status') return status;
    if (args.includes('HEAD')) return `${head}\n`;
    if (tagged === null) throw new Error('unknown tag');
    return `${tagged}\n`;
  };

test('arguments name one tag and one operation, with a plan only for migrations', () => {
  assert.deepEqual(
    localReleaseArguments(['--tag', 'api-2026.11.11', '--operation', 'deploy']),
    { dryRun: false, tag: 'api-2026.11.11', operation: 'deploy' },
  );
  assert.deepEqual(
    localReleaseArguments([
      '--dry-run',
      '--operation',
      'migrate-deploy',
      '--plan',
      plan,
      '--tag',
      'v1',
    ]),
    { dryRun: true, operation: 'migrate-deploy', plan, tag: 'v1' },
  );
  for (const args of [
    [],
    ['--tag', 'v1'],
    ['--tag', 'v1', '--operation', 'bootstrap'],
    ['--tag', 'v1', '--operation', 'migrate-deploy'],
    ['--tag', 'v1', '--operation', 'deploy', '--plan', plan],
    ['--tag', 'v1', '--operation', 'migrate-deploy', '--plan', 'short'],
    ['--tag', '-v1', '--operation', 'deploy'],
    ['--tag', 'v 1', '--operation', 'deploy'],
    ['--tag', 'v1', '--tag', 'v2', '--operation', 'deploy'],
    ['--tag', 'v1', '--operation', 'deploy', '--dry-run', '--dry-run'],
    ['--tag', 'v1', '--operation', 'deploy', '--source', sha],
    ['--tag', 'v1', '--operation'],
  ])
    assert.throws(
      () => localReleaseArguments(args),
      (error) =>
        stagingRunnerFailureCode(error) === 'INVALID_LOCAL_STAGING_CONTEXT',
      args.join(' '),
    );
});

test('the checkout must be clean and sit on the tag', async () => {
  assert.equal(await taggedSource('v1', { run: gitFake() }), sha);
  assert.equal(
    await code(() =>
      taggedSource('v1', { run: gitFake({ status: ' M package.json' }) }),
    ),
    'STAGING_SOURCE_NOT_CLEAN',
  );
  assert.equal(
    await code(() =>
      taggedSource('v1', { run: gitFake({ tagged: 'c'.repeat(40) }) }),
    ),
    'STAGING_SOURCE_NOT_TAGGED',
  );
  assert.equal(
    await code(() => taggedSource('v1', { run: gitFake({ tagged: null }) })),
    'STAGING_SOURCE_NOT_TAGGED',
  );
});

test('a dry run builds, prints each step, ends with no deploy and runs no gh', async () => {
  for (const operation of ['deploy', 'migrate-deploy', 'secrets']) {
    const lines = [];
    const commands = [];
    let directory;
    await runLocalStagingRelease(
      [
        '--tag',
        'v1',
        '--operation',
        operation,
        ...(operation === 'migrate-deploy' ? ['--plan', plan] : []),
        '--dry-run',
      ],
      {
        env: {},
        run: async (command, args, options) => {
          commands.push(command);
          return gitFake()(command, args, options);
        },
        log: (line) => lines.push(line),
        build: async (options) => {
          directory = options.directory;
          assert.equal(options.sourceSha, sha);
          assert.ok(existsSync(directory));
          return { bytes: 1234, uploadSha256: 'd'.repeat(64) };
        },
      },
    );
    assert.deepEqual([...new Set(commands)], ['git']);
    assert.equal(lines.at(-1), 'dry run, no deploy');
    assert.match(lines[0], new RegExp(`${sha} at tag v1, clean`));
    if (operation === 'secrets') {
      assert.equal(directory, undefined);
      assert.ok(lines.some((line) => line.includes('secret names')));
    } else {
      assert.equal(existsSync(directory), false);
      assert.ok(lines.some((line) => line.includes('1234 bytes')));
      assert.ok(lines.some((line) => line.includes('api-candidate')));
      assert.ok(lines.some((line) => line.includes('previousApiSha')));
    }
  }
});

test('a dry run removes its build directory when the build fails', async () => {
  let directory;
  await assert.rejects(
    dryRun(
      { tag: 'v1', operation: 'deploy', sha },
      {
        log: () => {},
        build: async (options) => {
          directory = options.directory;
          throw new Error('bundle too large');
        },
      },
    ),
    /bundle too large/,
  );
  assert.equal(existsSync(directory), false);
});

test('CI, Vercel and EAS builds cannot start the local entry', async () => {
  for (const name of [
    'CI',
    'GITHUB_ACTIONS',
    'GITHUB_RUN_ID',
    'VERCEL',
    'EAS_BUILD',
  ])
    assert.equal(
      await code(() =>
        runLocalStagingRelease(['--tag', 'v1', '--operation', 'deploy'], {
          env: { [name]: '1' },
          run: async () => assert.fail('no command may run'),
        }),
      ),
      'INVALID_LOCAL_STAGING_CONTEXT',
    );
});

const ghFake = ({ runs, watchFails = false, log = '' }) => {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    assert.equal(command, 'gh');
    if (args[0] === 'workflow') return '';
    if (args[1] === 'list') return JSON.stringify(runs.shift() ?? []);
    if (args[1] === 'watch') {
      if (watchFails) throw new Error('run failed');
      return '';
    }
    if (args[1] === 'view') return log;
    assert.fail(args.join(' '));
  };
  return { calls, run };
};

test('a real run dispatches the workflow, waits and prints its receipts', async () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const match = {
    databaseId: 42,
    createdAt: '2026-11-11T12:00:05Z',
    displayTitle: 'Staging API migrate-deploy from v1',
    url: 'https://github.com/anthonyyoo24/justgo/actions/runs/42',
  };
  const receipt = {
    event: 'staging_supabase_release',
    sourceSha: sha,
    servingVersion: 3,
  };
  const { calls, run } = ghFake({
    runs: [
      [],
      [
        { ...match, databaseId: 7, displayTitle: 'Staging API deploy from v1' },
        { ...match, databaseId: 8, createdAt: '2026-11-11T11:00:00Z' },
        match,
      ],
    ],
    log: `deploy\tGuard\t2026-11-11T12:01:00Z ${JSON.stringify(receipt)}\nnoise {"event":"staging_\n`,
  });
  const lines = [];
  const waits = [];
  const result = await dispatchRelease(
    { tag: 'v1', operation: 'migrate-deploy', plan },
    {
      run,
      log: (line) => lines.push(line),
      wait: async (ms) => waits.push(ms),
      now: () => now,
    },
  );
  assert.deepEqual(calls[0], [
    'gh',
    'workflow',
    'run',
    'staging-api.yml',
    '--repo',
    'anthonyyoo24/justgo',
    '--ref',
    'main',
    '-f',
    'tag=v1',
    '-f',
    'operation=migrate-deploy',
    '-f',
    `migration_plan_sha256=${plan}`,
  ]);
  assert.deepEqual(waits, [3000]);
  assert.deepEqual(calls.at(-2), [
    'gh',
    'run',
    'watch',
    '42',
    '--repo',
    'anthonyyoo24/justgo',
    '--exit-status',
  ]);
  assert.deepEqual(result.receipts, [receipt]);
  assert.deepEqual(lines, [`dispatched ${match.url}`, JSON.stringify(receipt)]);
});

test('a failed run still prints its receipts, then fails', async () => {
  const failure = { event: 'staging_supabase_secrets_failed', code: 'X' };
  const { run } = ghFake({
    runs: [
      [
        {
          databaseId: 9,
          createdAt: new Date().toISOString(),
          displayTitle: 'Staging API secrets from v1',
          url: 'u',
        },
      ],
    ],
    watchFails: true,
    log: JSON.stringify(failure),
  });
  const lines = [];
  assert.equal(
    await code(() =>
      dispatchRelease(
        { tag: 'v1', operation: 'secrets' },
        { run, log: (line) => lines.push(line), wait: async () => {} },
      ),
    ),
    'STAGING_COMMAND_FAILED',
  );
  assert.deepEqual(lines, ['dispatched u', JSON.stringify(failure)]);
});

test('the run lookup is bounded', async () => {
  const { calls, run } = ghFake({ runs: [] });
  assert.equal(
    await code(() =>
      dispatchRelease(
        { tag: 'v1', operation: 'deploy' },
        { run, log: () => {}, wait: async () => {}, attempts: 3 },
      ),
    ),
    'STAGING_COMMAND_FAILED',
  );
  assert.equal(calls.filter((call) => call[2] === 'list').length, 3);
  assert.equal(
    calls.some((call) => call[2] === 'watch'),
    false,
  );
});

test('receipts come only from whole JSON lines that the lane prints', () => {
  assert.deepEqual(
    receiptsFrom(
      [
        'x {"event":"staging_database_verified","operation":"deploy"}',
        '{"event":"other"}',
        '{"event":"staging_ broken',
      ].join('\n'),
    ),
    [{ event: 'staging_database_verified', operation: 'deploy' }],
  );
});
