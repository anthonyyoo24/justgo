import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cleanupRehearsal } from './rehearsal-cleanup.mjs';

const firstDatabase = 'justgo_restore_000000000001';
const secondDatabase = 'justgo_restore_000000000002';
const cleanupOrder = [
  'pool 1',
  'pool 2',
  'client 1',
  'client 2',
  `drop database ${secondDatabase} with(force)`,
  `drop database ${firstDatabase} with(force)`,
  'drop role justgo_backup',
  'admin',
  'directory',
];
const cleanupFailure = 'Recovery rehearsal cleanup incomplete';

function fixture(failingAction, failureMode) {
  const calls = [];
  const reports = [];
  const invoke = (name) => {
    calls.push(name);
    if (name !== failingAction) return Promise.resolve();
    const error = new Error('private database credential or key path');
    if (failureMode === 'throw') throw error;
    return Promise.reject(error);
  };
  return {
    calls,
    reports,
    resources: {
      pools: ['pool 1', 'pool 2'].map((name) => ({ end: () => invoke(name) })),
      clients: ['client 1', 'client 2'].map((name) => ({
        end: () => invoke(name),
      })),
      ownedDatabases: [firstDatabase, secondDatabase],
      ownsRole: true,
      admin: {
        query: invoke,
        end: () => invoke('admin'),
      },
      directory: '/synthetic-rehearsal',
    },
    options: {
      remove: (directory, options) => {
        assert.equal(directory, '/synthetic-rehearsal');
        assert.deepEqual(options, { recursive: true, force: true });
        return invoke('directory');
      },
      report: (message) => reports.push(message),
    },
  };
}

test('successful cleanup closes connections before dropping owned databases and role', async () => {
  const { resources, options, calls, reports } = fixture();
  await cleanupRehearsal(resources, undefined, options);
  assert.deepEqual(calls, cleanupOrder);
  assert.deepEqual(resources.ownedDatabases, [firstDatabase, secondDatabase]);
  assert.deepEqual(reports, []);
});

test('every cleanup failure is isolated and makes a successful rehearsal fail safely', async (t) => {
  for (const mode of ['throw', 'reject']) {
    for (const action of cleanupOrder) {
      await t.test(`${action}: ${mode}`, async () => {
        const { resources, options, calls, reports } = fixture(action, mode);
        await assert.rejects(
          cleanupRehearsal(resources, undefined, options),
          (error) => {
            assert.equal(error.message, cleanupFailure);
            assert.equal(error.cause, undefined);
            return true;
          },
        );
        assert.deepEqual(calls, cleanupOrder);
        assert.deepEqual(reports, []);
      });
    }
  }
});

test('cleanup retains the original sanitized rehearsal failure and reports no raw error', async () => {
  const { resources, options, calls, reports } = fixture(
    `drop database ${secondDatabase} with(force)`,
    'reject',
  );
  const failure = new Error(
    'Recovery rehearsal failed during encrypted snapshot',
  );
  await assert.rejects(
    cleanupRehearsal(resources, failure, options),
    (error) => error === failure,
  );
  assert.deepEqual(calls, cleanupOrder);
  assert.deepEqual(reports, [cleanupFailure]);
});

test('successful cleanup preserves a rehearsal failure without a cleanup warning', async () => {
  const { resources, options, reports } = fixture();
  const failure = new Error('Recovery rehearsal failed during connect');
  await assert.rejects(
    cleanupRehearsal(resources, failure, options),
    (error) => error === failure,
  );
  assert.deepEqual(reports, []);
});

test('early setup failures remove the directory without touching unowned resources', async () => {
  const { resources, options, calls } = fixture();
  Object.assign(resources, {
    pools: [],
    clients: [],
    ownedDatabases: [],
    ownsRole: false,
    admin: undefined,
  });
  await cleanupRehearsal(resources, undefined, options);
  assert.deepEqual(calls, ['directory']);
});

test('cleanup awaits each release before dropping dependent resources', async () => {
  const { resources, options, calls } = fixture();
  let release;
  resources.pools[0].end = () =>
    new Promise((resolve) => {
      calls.push('pool 1');
      release = resolve;
    });
  const cleanup = cleanupRehearsal(resources, undefined, options);
  try {
    assert.deepEqual(calls, ['pool 1']);
  } finally {
    release();
    await cleanup;
  }
  assert.deepEqual(calls, cleanupOrder);
});

test('a database cleanup error still removes temporary key material from disk', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'justgo-cleanup-test-'));
  const key = join(directory, 'owner-key.txt');
  try {
    await writeFile(key, 'synthetic private key', { mode: 0o600 });
    const { resources } = fixture(
      `drop database ${secondDatabase} with(force)`,
      'throw',
    );
    resources.directory = directory;
    await assert.rejects(cleanupRehearsal(resources), {
      message: cleanupFailure,
    });
    await assert.rejects(readFile(key), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
