import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkStates,
  decide,
  tokenName,
  updateBehindPulls,
} from './update-behind-prs.mjs';

const workflow = readFileSync(
  new URL('../../.github/workflows/update-behind-prs.yml', import.meta.url),
  'utf8',
);
const repo = 'owner/justgo';
const sha = (n) => String(n).padStart(40, 'a');
const armed = { enabledAt: '2026-11-09T00:00:00Z' };
// The required check runs on a PR head. Each value is a conclusion, PENDING
// for a run still going, or MISSING for one not started. All pass by default.
const rollup = (states = {}) => ({
  nodes: [
    {
      commit: {
        statusCheckRollup: {
          contexts: {
            nodes: ['checks', 'description', 'verdict']
              .map((name) => [name, states[name] ?? 'SUCCESS'])
              .filter(([, state]) => state !== 'MISSING')
              .map(([name, state]) => ({
                name,
                status: state === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED',
                conclusion: state === 'PENDING' ? null : state,
                startedAt: '2026-11-11T00:00:00Z',
              })),
          },
        },
      },
    },
  ],
});
const pull = (number, mergeStateStatus, extra = {}) => {
  const { checks, ...rest } = extra;
  return {
    number,
    baseRefName: 'main',
    headRefOid: sha(number),
    isCrossRepository: false,
    mergeStateStatus,
    autoMergeRequest: armed,
    commits: rollup(checks),
    ...rest,
  };
};
const failing = { checks: { checks: 'FAILURE' } };

// A fake GitHub. `pages` answers successive GraphQL listings: each entry is
// the list of PRs for that listing, or an array of pages for one listing.
// `updates` maps a PR number to the update-branch status (default 202), or to
// a function of the expected head that returns it. `graphqlErrors` adds an
// `errors` array beside the data, as GitHub does for a partial failure.
function fakeGitHub({
  listings,
  updates = {},
  graphqlStatus = 200,
  graphqlErrors,
}) {
  const calls = [];
  let listing = -1;
  const fetch = async (url, init) => {
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    calls.push({ url, method: init.method, body, headers: init.headers });
    const reply = (status, json) => ({
      status,
      text: async () => JSON.stringify(json),
    });
    if (url === 'https://api.github.com/graphql') {
      if (graphqlStatus !== 200)
        return reply(graphqlStatus, { message: 'Bad credentials' });
      if (body.variables.after === null) listing++;
      const current = listings[Math.min(listing, listings.length - 1)];
      const pages = Array.isArray(current[0]) ? current : [current];
      const index = body.variables.after ? Number(body.variables.after) : 0;
      return reply(200, {
        ...(graphqlErrors && { errors: graphqlErrors }),
        data: {
          repository: {
            pullRequests: {
              pageInfo: {
                hasNextPage: index + 1 < pages.length,
                endCursor: String(index + 1),
              },
              nodes: pages[index],
            },
          },
        },
      });
    }
    const match = /\/repos\/owner\/justgo\/pulls\/(\d+)\/update-branch$/.exec(
      url,
    );
    assert.ok(match, `unexpected request ${init.method} ${url}`);
    const answer = updates[Number(match[1])] ?? 202;
    const status =
      typeof answer === 'function' ? answer(body.expected_head_sha) : answer;
    return reply(
      status,
      status === 202
        ? { message: 'Updating pull request branch.' }
        : { message: `refused with ${status}` },
    );
  };
  const listed = () => calls.filter((call) => call.method === 'POST').length;
  const updated = () =>
    calls
      .filter((call) => call.method === 'PUT')
      .map((call) => ({
        number: Number(call.url.match(/pulls\/(\d+)\//)[1]),
        expected: call.body.expected_head_sha,
      }));
  return { fetch, calls, listed, updated };
}

async function runWith(github, extra = {}) {
  const lines = [];
  const sleeps = [];
  const result = await updateBehindPulls({
    fetch: github.fetch,
    token: 'pat-for-test',
    repo,
    log: (line) => lines.push(line),
    timing: { attempts: 3, pollMs: 5 },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...extra,
  });
  return { result, lines, sleeps };
}

test('only the lowest-numbered armed PR on main that is behind with a passing verdict is updated, pinned to its head', async () => {
  const github = fakeGitHub({
    listings: [
      [
        pull(1, 'BEHIND', { checks: { verdict: 'FAILURE' } }),
        pull(2, 'BEHIND', { autoMergeRequest: null }),
        pull(3, 'DIRTY'),
        pull(4, 'BLOCKED', failing),
        pull(5, 'BEHIND', failing),
        pull(6, 'BEHIND', { baseRefName: 'feature' }),
        pull(7, 'BEHIND', { isCrossRepository: true }),
        pull(8, 'BEHIND'),
        pull(9, 'BEHIND', { checks: { description: 'FAILURE' } }),
      ],
    ],
  });
  const { result, lines } = await runWith(github);
  assert.deepEqual(github.updated(), [{ number: 5, expected: sha(5) }]);
  assert.deepEqual(result.updated, [5]);
  assert.deepEqual(result.skipped, [
    { number: 1, reason: 'no passing verdict covers its head yet' },
    {
      number: 3,
      reason: 'it conflicts with main; rebase it and get a fresh verdict',
    },
    { number: 4, reason: 'it is not behind main (BLOCKED)' },
    {
      number: 7,
      reason: 'its branch is in a fork, which this job does not update',
    },
    { number: 9, reason: 'its description check fails' },
    { number: 8, reason: '#5 goes first; this waits its turn' },
  ]);
  assert.doesNotMatch(lines.join('\n'), /#2|#6/);
  assert.match(lines.at(-1), /Updated 1, skipped 6, failed 0\./);
});

test('an up-to-date armed PR with no failed required check holds every update', async () => {
  for (const holder of [
    pull(1, 'CLEAN'),
    pull(1, 'BLOCKED', { checks: { checks: 'PENDING' } }),
    pull(1, 'BLOCKED', { checks: { verdict: 'PENDING', checks: 'MISSING' } }),
    pull(1, 'UNSTABLE'),
  ]) {
    const github = fakeGitHub({ listings: [[holder, pull(2, 'BEHIND')]] });
    const { result, lines } = await runWith(github);
    assert.deepEqual(github.updated(), []);
    assert.deepEqual(result.skipped, [
      {
        number: 2,
        reason: '#1 is up to date and about to merge; this waits its turn',
      },
    ]);
    assert.match(
      lines.join('\n'),
      /#1: up to date with no failed required check/,
    );
  }
});

test('a failed required check on the up-to-date PR releases the hold', async () => {
  for (const name of ['checks', 'description', 'verdict']) {
    const github = fakeGitHub({
      listings: [
        [
          pull(1, 'BLOCKED', { checks: { [name]: 'FAILURE' } }),
          pull(2, 'BEHIND'),
        ],
      ],
    });
    const { result } = await runWith(github);
    assert.deepEqual(result.updated, [2]);
  }
});

test('the newest run of each required check counts, and a run not started is pending', () => {
  const run = (name, conclusion, startedAt) => ({
    name,
    status: conclusion ? 'COMPLETED' : 'QUEUED',
    conclusion,
    startedAt,
  });
  const states = checkStates({
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              contexts: {
                nodes: [
                  run('verdict', 'SUCCESS', '2026-11-11T02:00:00Z'),
                  run('verdict', 'FAILURE', '2026-11-11T01:00:00Z'),
                  run('checks', 'SUCCESS', '2026-11-11T01:00:00Z'),
                  run('checks', null, null),
                  run('unit', 'FAILURE', '2026-11-11T01:00:00Z'),
                  {},
                ],
              },
            },
          },
        },
      ],
    },
  });
  assert.deepEqual(states, {
    checks: 'pending',
    description: 'pending',
    verdict: 'success',
  });
  assert.deepEqual(checkStates({}), {
    checks: 'pending',
    description: 'pending',
    verdict: 'pending',
  });
});

test('every request carries the token and asks for the REST API version', async () => {
  const github = fakeGitHub({ listings: [[pull(1, 'BEHIND')]] });
  await runWith(github);
  for (const call of github.calls) {
    assert.equal(call.headers.authorization, 'Bearer pat-for-test');
    assert.equal(call.headers['x-github-api-version'], '2022-11-28');
  }
  const [list] = github.calls;
  assert.equal(list.method, 'POST');
  assert.deepEqual(list.body.variables, {
    owner: 'owner',
    name: 'justgo',
    after: null,
  });
  assert.match(list.body.query, /states: OPEN, baseRefName: "main"/);
  assert.match(
    list.body.query,
    /statusCheckRollup[\s\S]*CheckRun \{ name status conclusion startedAt \}/,
  );
});

test('an update failure other than a refusal fails the run without a retry', async () => {
  const github = fakeGitHub({
    listings: [[pull(2, 'BEHIND'), pull(3, 'BEHIND')]],
    updates: { 2: 403 },
  });
  const { result, lines, sleeps } = await runWith(github);
  assert.deepEqual(result.updated, [3]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.failed, [
    { number: 2, status: 403, message: 'refused with 403' },
  ]);
  assert.match(lines.join('\n'), /#2: update failed with 403/);
  assert.equal(github.listed(), 1);
  assert.deepEqual(sleeps, []);
});

test('a PR whose head moved under a racing update is read again once and updated on its new head', async () => {
  const moved = 'b'.repeat(40);
  const github = fakeGitHub({
    listings: [[pull(1, 'BEHIND')], [pull(1, 'BEHIND', { headRefOid: moved })]],
    updates: { 1: (expected) => (expected === moved ? 202 : 422) },
  });
  const { result, sleeps } = await runWith(github);
  assert.deepEqual(github.updated(), [
    { number: 1, expected: sha(1) },
    { number: 1, expected: moved },
  ]);
  assert.deepEqual(result, { updated: [1], skipped: [], failed: [] });
  assert.equal(github.listed(), 2);
  assert.deepEqual(sleeps, [5]);
});

test('a refused PR gives its turn to the next, which is not read again', async () => {
  const github = fakeGitHub({
    listings: [[pull(1, 'BEHIND'), pull(2, 'BEHIND'), pull(3, 'BEHIND')]],
    updates: { 1: 422 },
  });
  const { result, sleeps } = await runWith(github);
  assert.deepEqual(
    github.updated().map(({ number }) => number),
    [1, 2],
  );
  assert.deepEqual(result.updated, [2]);
  assert.deepEqual(result.skipped, [
    { number: 3, reason: '#2 goes first; this waits its turn' },
    { number: 1, reason: '#2 goes first; this waits its turn' },
  ]);
  assert.equal(github.listed(), 1);
  assert.deepEqual(sleeps, []);
});

test('a refused PR that is no longer behind, conflicts or is gone is skipped, not retried', async () => {
  const github = fakeGitHub({
    listings: [
      [pull(1, 'BEHIND'), pull(2, 'BEHIND'), pull(3, 'BEHIND')],
      [pull(1, 'BLOCKED'), pull(2, 'DIRTY')],
    ],
    updates: { 1: 422, 2: 422, 3: 422 },
  });
  const { result, lines } = await runWith(github);
  assert.equal(github.updated().length, 3);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.skipped, [
    { number: 1, reason: 'it is not behind main (BLOCKED)' },
    {
      number: 2,
      reason: 'it conflicts with main; rebase it and get a fresh verdict',
    },
    { number: 3, reason: 'it is no longer an armed open PR on main' },
  ]);
  assert.match(
    lines.join('\n'),
    new RegExp(
      `#1: GitHub refused the update of head ${sha(1).slice(0, 7)}: refused with 422`,
    ),
  );
});

test('a refusal that persists after the second read fails the run', async () => {
  const github = fakeGitHub({
    listings: [[pull(1, 'BEHIND')]],
    updates: { 1: 422 },
  });
  const { result, lines } = await runWith(github);
  assert.deepEqual(github.updated(), [
    { number: 1, expected: sha(1) },
    { number: 1, expected: sha(1) },
  ]);
  assert.equal(github.listed(), 2);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.failed, [
    { number: 1, status: 422, message: 'refused with 422' },
  ]);
  assert.match(
    lines.join('\n'),
    /#1: GitHub refused the update again while it is still behind main/,
  );
  assert.match(lines.at(-1), /Updated 0, skipped 0, failed 1\./);
});

test('UNKNOWN is asked again until GitHub decides', async () => {
  const github = fakeGitHub({
    listings: [
      [pull(1, 'UNKNOWN'), pull(2, 'BEHIND'), pull(3, 'UNKNOWN')],
      [pull(1, 'UNKNOWN'), pull(2, 'BEHIND'), pull(3, 'DIRTY')],
      [pull(1, 'BEHIND'), pull(2, 'BEHIND'), pull(3, 'DIRTY')],
    ],
  });
  const { result, sleeps } = await runWith(github);
  assert.deepEqual(result.updated, [1]);
  assert.deepEqual(result.skipped, [
    {
      number: 3,
      reason: 'it conflicts with main; rebase it and get a fresh verdict',
    },
    { number: 2, reason: '#1 goes first; this waits its turn' },
  ]);
  assert.deepEqual(sleeps, [5, 5]);
});

test('a PR still UNKNOWN after every attempt is tried anyway, and GitHub decides', async () => {
  const github = fakeGitHub({
    listings: [[pull(1, 'UNKNOWN'), pull(2, 'UNKNOWN')]],
    updates: { 1: 422 },
  });
  const { result, lines, sleeps } = await runWith(github);
  assert.equal(sleeps.length, 2);
  assert.deepEqual(result.updated, [2]);
  assert.deepEqual(
    result.skipped.map(({ number }) => number),
    [1],
  );
  assert.deepEqual(result.failed, []);
  assert.match(lines.join('\n'), /#1: GitHub still reports UNKNOWN/);
  assert.match(lines.join('\n'), /#2: GitHub still reports UNKNOWN/);
});

test('every page of open PRs is read', async () => {
  const github = fakeGitHub({
    listings: [[[pull(3, 'BEHIND')], [pull(2, 'DIRTY')], [pull(1, 'BEHIND')]]],
  });
  const { result } = await runWith(github);
  assert.deepEqual(result.updated, [1]);
  assert.deepEqual(
    github.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.body.variables.after),
    [null, '1', '2'],
  );
});

test('a missing token, a bad repository or a failed listing stops before any update', async () => {
  const github = fakeGitHub({ listings: [[pull(1, 'BEHIND')]] });
  await assert.rejects(
    runWith(github, { token: '' }),
    /PR_UPDATE_TOKEN is not set/,
  );
  await assert.rejects(runWith(github, { repo: 'nope' }), /owner\/name/);
  const denied = fakeGitHub({ listings: [[]], graphqlStatus: 401 });
  await assert.rejects(runWith(denied), /listing open PRs failed with 401/);
  const partial = fakeGitHub({
    listings: [[pull(1, 'BEHIND')]],
    graphqlErrors: [{ message: 'Something went wrong' }],
  });
  await assert.rejects(
    runWith(partial),
    /listing open PRs failed with 200: .*Something went wrong/,
  );
  assert.deepEqual(github.updated(), []);
  assert.deepEqual(denied.updated(), []);
  assert.deepEqual(partial.updated(), []);
});

// Runs the script as the workflow does, with a stubbed fetch preloaded so no
// request leaves the process.
function runScript({ token, nodes = [], update = 202 }) {
  const stub = `
    const nodes = ${JSON.stringify(nodes)};
    globalThis.fetch = async (url) => {
      const reply = (status, json) => ({ status, text: async () => JSON.stringify(json) });
      if (url === 'https://api.github.com/graphql')
        return reply(200, { data: { repository: { pullRequests: {
          pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } });
      if (url.endsWith('/update-branch')) return reply(${update}, { message: 'answered ${update}' });
      throw new Error('unexpected request ' + url);
    };`;
  return spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(stub)}`,
      fileURLToPath(new URL('./update-behind-prs.mjs', import.meta.url)),
    ],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        GITHUB_REPOSITORY: repo,
        ...(token && { [tokenName]: token }),
      },
    },
  );
}

test('the script exits non-zero on a missing token or a failed update, and zero otherwise', () => {
  const missing = runScript({});
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /update-behind-prs: PR_UPDATE_TOKEN is not set/);

  const failed = runScript({
    token: 'pat-for-test',
    nodes: [pull(1, 'BEHIND')],
    update: 403,
  });
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stdout, /#1: update failed with 403: answered 403\./);

  const passed = runScript({
    token: 'pat-for-test',
    nodes: [pull(1, 'BEHIND')],
  });
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Updated 1, skipped 0, failed 0\./);
});

test('decide names each state', () => {
  assert.equal(decide(pull(1, 'BEHIND')), 'update');
  assert.equal(decide(pull(1, 'UNKNOWN')), 'wait');
  assert.equal(decide(pull(1, 'BEHIND', { autoMergeRequest: null })), 'ignore');
  assert.equal(decide(pull(1, 'BEHIND', { baseRefName: 'x' })), 'ignore');
  for (const state of ['BLOCKED', 'CLEAN', 'UNSTABLE', 'HAS_HOOKS', 'DRAFT'])
    assert.deepEqual(decide(pull(1, state)), {
      skip: `it is not behind main (${state})`,
    });
});

test('the workflow runs on main only, with the PAT secret and no PR code', () => {
  const [triggers, rest] = workflow.split(/^permissions:$/m);
  assert.match(triggers, /^ {2}push:\n {4}branches: \[main\]$/m);
  assert.match(triggers, /^ {2}workflow_dispatch:$/m);
  // A run that finishes may free the next PR in line.
  assert.match(
    triggers,
    /^ {2}workflow_run:\n {4}workflows: \[Foundation checks, PR description\]\n {4}types: \[completed\]$/m,
  );
  assert.doesNotMatch(workflow, /pull_request/);
  assert.match(rest, /^ {2}contents: read$/m);
  assert.match(workflow, /^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(workflow, /^ {2}cancel-in-progress: true$/m);
  assert.match(workflow, /^ {4}timeout-minutes: [1-9]\d*$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /sparse-checkout: \|\n {12}scripts\/quality\/update-behind-prs\.mjs\n/,
  );
  assert.match(
    workflow,
    new RegExp(
      `^ {10}${tokenName}: \\$\\{\\{ secrets\\.${tokenName} \\}\\}$`,
      'm',
    ),
  );
  // A GITHUB_TOKEN push leaves the PR's checks waiting for approval.
  assert.doesNotMatch(workflow, /github\.token|secrets\.GITHUB_TOKEN|GH_TOKEN/);
  assert.deepEqual(
    [...workflow.matchAll(/^ {8}run: (.+)$/gm)].map((match) => match[1]),
    ['node scripts/quality/update-behind-prs.mjs'],
  );
  const uses = [...workflow.matchAll(/\buses: ([^\s]+)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0);
  for (const reference of uses)
    assert.match(reference, /^actions\/[\w-]+@[a-f0-9]{40}$/);
});
