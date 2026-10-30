import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requiredDatabaseSlot,
  verifyRecentDatabaseCopy,
} from './workflow-health.mjs';

const repository = 'anthonyyoo24/justgo';
const path = '.github/workflows/database-backups.yml';
const env = {
  GITHUB_REPOSITORY: repository,
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: `${repository}/${path}@refs/heads/main`,
  BACKUP_ACTIONS_TOKEN: 'synthetic-ephemeral-token',
};
const now = Date.parse('2026-10-30T05:23:00Z');
const failure = {
  message: 'Recent successful database backup could not be verified',
};
const workflow = {
  id: 7,
  path,
  state: 'active',
  url: `https://api.github.com/repos/${repository}/actions/workflows/7`,
};
const run = {
  id: 42,
  run_attempt: 1,
  workflow_id: 7,
  path,
  display_title: 'Encrypted database recovery copy',
  repository: { full_name: repository },
  head_repository: { full_name: repository },
  head_branch: 'main',
  head_sha: 'a'.repeat(40),
  event: 'schedule',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-10-30T04:43:00Z',
  run_started_at: '2026-10-30T04:44:00Z',
  updated_at: '2026-10-30T04:55:00Z',
};
const job = {
  id: 43,
  run_id: run.id,
  head_sha: run.head_sha,
  name: 'backup',
  status: 'completed',
  conclusion: 'success',
  started_at: run.run_started_at,
  completed_at: run.updated_at,
  steps: [
    {
      number: 5,
      name: 'Encrypt and verify recovery copy',
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-10-30T04:50:00Z',
      completed_at: '2026-10-30T04:54:00Z',
    },
  ],
};

/**
 * Serve synthetic workflow/run/job metadata while asserting the fixed read-only
 * GitHub request contract. Overrides and pages exercise stale, malformed and bounded
 * pagination cases without using a real Actions token or contacting GitHub.
 */
function transport({
  workflowValue = workflow,
  runs = [run],
  jobValue = job,
  pages,
} = {}) {
  const calls = [];
  return {
    calls,
    send: async (input, init) => {
      const url = new URL(input);
      calls.push(url);
      assert.equal(url.origin, 'https://api.github.com');
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.equal(
        init.headers.Authorization,
        `Bearer ${env.BACKUP_ACTIONS_TOKEN}`,
      );
      assert.equal(init.headers['X-GitHub-Api-Version'], '2026-03-10');
      assert.ok(init.signal instanceof AbortSignal);
      if (url.pathname.endsWith('/database-backups.yml'))
        return Response.json(workflowValue);
      if (url.pathname.endsWith('/runs')) {
        assert.equal(url.searchParams.get('branch'), 'main');
        assert.equal(url.searchParams.get('status'), 'completed');
        assert.equal(url.searchParams.get('per_page'), '100');
        return Response.json(
          pages?.[Number(url.searchParams.get('page')) - 1] ?? {
            total_count: runs.length,
            workflow_runs: runs,
          },
        );
      }
      assert.equal(
        url.pathname,
        `/repos/${repository}/actions/runs/42/attempts/1/jobs`,
      );
      return Response.json({ total_count: 1, jobs: [jobValue] });
    },
  };
}

test('daily freshness changes exactly at the inclusive 05:23 UTC deadline', () => {
  for (const [time, expected] of [
    ['2026-10-30T05:22:59.999Z', '2026-10-29T04:43:00.000Z'],
    ['2026-10-30T05:23:00.000Z', '2026-10-30T04:43:00.000Z'],
    ['2026-10-30T05:23:00.001Z', '2026-10-30T04:43:00.000Z'],
    ['2026-11-01T00:00:00.000Z', '2026-10-31T04:43:00.000Z'],
    ['2027-01-01T00:00:00.000Z', '2026-12-31T04:43:00.000Z'],
    ['2026-10-30T01:23:00-04:00', '2026-10-30T04:43:00.000Z'],
  ])
    assert.equal(
      new Date(requiredDatabaseSlot(Date.parse(time))).toISOString(),
      expected,
    );
  assert.throws(() => requiredDatabaseSlot(NaN), failure);
});

test('verifies the actual copy step on trusted scheduled and manual main runs', async () => {
  for (const event of ['schedule', 'workflow_dispatch']) {
    for (const runPath of [path, `${path}@main`, `${path}@refs/heads/main`]) {
      const io = transport({ runs: [{ ...run, event, path: runPath }] });
      await verifyRecentDatabaseCopy(env, { now, send: io.send });
      assert.equal(io.calls.length, 3);
      assert.equal(
        io.calls[1].searchParams.get('created'),
        '>=2026-10-30T04:43:00.000Z',
      );
    }
  }
  // GitHub's documented step timestamps may contain explicit UTC offsets.
  const io = transport({
    jobValue: {
      ...job,
      steps: [
        {
          ...job.steps[0],
          started_at: '2026-10-30T00:50:00-04:00',
          completed_at: '2026-10-30T00:54:00-04:00',
        },
      ],
    },
  });
  await verifyRecentDatabaseCopy(env, { now, send: io.send });
});

test('a deliberate first database run can bootstrap health without older history', async () => {
  const first = {
    ...run,
    event: 'workflow_dispatch',
    created_at: '2026-10-30T17:00:00Z',
    run_started_at: '2026-10-30T17:01:00Z',
    updated_at: '2026-10-30T17:10:00Z',
  };
  const firstJob = {
    ...job,
    started_at: first.run_started_at,
    completed_at: first.updated_at,
    steps: [
      {
        ...job.steps[0],
        started_at: '2026-10-30T17:05:00Z',
        completed_at: '2026-10-30T17:09:00Z',
      },
    ],
  };
  await verifyRecentDatabaseCopy(env, {
    now: Date.parse('2026-10-30T17:23:00Z'),
    send: transport({ runs: [first], jobValue: firstJob }).send,
  });
});

test('previous daily copy is accepted before the deadline and rejected at it', async () => {
  const previous = Object.fromEntries(
    Object.entries(run).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? value.replace('2026-10-30', '2026-10-29')
        : value,
    ]),
  );
  const previousJob = {
    ...job,
    started_at: previous.run_started_at,
    completed_at: previous.updated_at,
    steps: [
      {
        ...job.steps[0],
        started_at: '2026-10-29T04:50:00Z',
        completed_at: '2026-10-29T04:54:00Z',
      },
    ],
  };
  await verifyRecentDatabaseCopy(env, {
    now: now - 1,
    send: transport({ runs: [previous], jobValue: previousJob }).send,
  });
  await assert.rejects(
    verifyRecentDatabaseCopy(env, {
      now,
      send: transport({ runs: [previous], jobValue: previousJob }).send,
    }),
    failure,
  );
});

test('rejects wrong caller, workflow, repository, kind and incomplete or incoherent runs', async () => {
  for (const override of [
    { GITHUB_REPOSITORY: 'foreign/justgo' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_WORKFLOW_REF: `${repository}/${path}@refs/heads/feature` },
    { BACKUP_ACTIONS_TOKEN: undefined },
  ])
    await assert.rejects(
      verifyRecentDatabaseCopy(
        { ...env, ...override },
        { now, send: async () => assert.fail('no request') },
      ),
      failure,
    );
  for (const override of [
    { id: undefined },
    { path: '.github/workflows/other.yml' },
    { state: 'disabled_manually' },
    { url: workflow.url.replace(repository, 'foreign/repository') },
  ])
    await assert.rejects(
      verifyRecentDatabaseCopy(env, {
        now,
        send: transport({ workflowValue: { ...workflow, ...override } }).send,
      }),
      failure,
    );
  for (const override of [
    { id: undefined },
    { run_attempt: undefined },
    { workflow_id: 8 },
    { path: '.github/workflows/other.yml' },
    { path: `${path}@feature` },
    { display_title: 'Encrypted ledger recovery copy' },
    { repository: { full_name: 'foreign/repository' } },
    { head_repository: { full_name: 'fork/justgo' } },
    { head_branch: 'feature' },
    { head_sha: 'not-a-sha' },
    { event: 'pull_request' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { created_at: '2026-10-29T04:43:00Z' },
    { run_started_at: undefined },
    { updated_at: '2026-10-30T05:24:00Z' },
    { created_at: '2026-10-30T04:56:00Z' },
    { updated_at: '2026-10-30T04:40:00Z' },
    { updated_at: '2026-02-30T00:00:00Z' },
  ])
    await assert.rejects(
      verifyRecentDatabaseCopy(env, {
        now,
        send: transport({ runs: [{ ...run, ...override }] }).send,
      }),
      failure,
    );
  await assert.rejects(
    verifyRecentDatabaseCopy(env, { now, send: transport({ runs: [] }).send }),
    failure,
  );
});

test('workflow success cannot substitute for a successful actual backup job and step', async () => {
  for (const override of [
    { id: undefined },
    { run_id: 99 },
    { head_sha: 'f'.repeat(40) },
    { name: 'other' },
    { status: 'in_progress' },
    { conclusion: 'skipped' },
    { completed_at: undefined },
    { started_at: '2026-10-30T04:30:00Z' },
    { completed_at: '2026-10-30T05:30:00Z' },
    { steps: [] },
    { steps: [...job.steps, ...job.steps] },
    { steps: [{ ...job.steps[0], conclusion: 'skipped' }] },
    { steps: [{ ...job.steps[0], status: 'queued' }] },
    { steps: [{ ...job.steps[0], completed_at: null }] },
    { steps: [{ ...job.steps[0], started_at: '2026-10-30T05:30:00Z' }] },
  ])
    await assert.rejects(
      verifyRecentDatabaseCopy(env, {
        now,
        send: transport({ jobValue: { ...job, ...override } }).send,
      }),
      failure,
    );
});

test('bounds pagination and accepts a fresh database run behind hourly ledger history', async () => {
  const ledger = { ...run, display_title: 'Encrypted ledger recovery copy' };
  const io = transport({
    pages: [
      {
        total_count: 101,
        workflow_runs: Array.from({ length: 100 }, () => ledger),
      },
      { total_count: 101, workflow_runs: [run] },
    ],
  });
  await verifyRecentDatabaseCopy(env, { now, send: io.send });
  assert.equal(io.calls.length, 4);
  const bounded = transport({
    pages: Array.from({ length: 3 }, () => ({
      total_count: 400,
      workflow_runs: Array.from({ length: 100 }, () => ledger),
    })),
  });
  await assert.rejects(
    verifyRecentDatabaseCopy(env, { now, send: bounded.send }),
    failure,
  );
  assert.equal(bounded.calls.length, 4);
});

test('provider errors and malformed responses fail safely without leaking private details', async () => {
  for (const send of [
    async () => {
      throw new Error('private credential or API body');
    },
    async () => new Response('private API body', { status: 403 }),
    async () => new Response('private malformed JSON'),
    async () => Response.json(null),
    transport({ pages: [{ total_count: 1, workflow_runs: null }] }).send,
    transport({ pages: [{ total_count: -1, workflow_runs: [run] }] }).send,
    transport({ pages: [{ total_count: 0, workflow_runs: [run] }] }).send,
  ])
    await assert.rejects(
      verifyRecentDatabaseCopy(env, { now, send }),
      (error) => {
        assert.equal(error.message, failure.message);
        assert.equal(error.cause, undefined);
        return true;
      },
    );
});
