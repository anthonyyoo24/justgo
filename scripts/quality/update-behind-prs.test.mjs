import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decide, tokenName, updateBehindPulls } from './update-behind-prs.mjs';

const workflow = readFileSync(
  new URL('../../.github/workflows/update-behind-prs.yml', import.meta.url),
  'utf8',
);
const repo = 'owner/justgo';
const sha = (n) => String(n).padStart(40, 'a');
const armed = { enabledAt: '2026-11-09T00:00:00Z' };
const pull = (number, mergeStateStatus, extra = {}) => ({
  number,
  baseRefName: 'main',
  headRefOid: sha(number),
  isCrossRepository: false,
  mergeStateStatus,
  autoMergeRequest: armed,
  ...extra,
});

// A fake GitHub. `pages` answers successive GraphQL listings: each entry is
// the list of PRs for that listing, or an array of pages for one listing.
// `updates` maps a PR number to the update-branch status (default 202).
function fakeGitHub({ listings, updates = {}, graphqlStatus = 200 }) {
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
    const status = updates[Number(match[1])] ?? 202;
    return reply(
      status,
      status === 202
        ? { message: 'Updating pull request branch.' }
        : { message: `refused with ${status}` },
    );
  };
  const updated = () =>
    calls
      .filter((call) => call.method === 'PUT')
      .map((call) => ({
        number: Number(call.url.match(/pulls\/(\d+)\//)[1]),
        expected: call.body.expected_head_sha,
      }));
  return { fetch, calls, updated };
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

test('only armed PRs on main that GitHub reports BEHIND are updated, pinned to their head', async () => {
  const github = fakeGitHub({
    listings: [
      [
        pull(1, 'BEHIND'),
        pull(2, 'BEHIND', { autoMergeRequest: null }),
        pull(3, 'DIRTY'),
        pull(4, 'BLOCKED'),
        pull(5, 'CLEAN'),
        pull(6, 'BEHIND', { baseRefName: 'feature' }),
        pull(7, 'BEHIND', { isCrossRepository: true }),
        pull(8, 'BEHIND'),
      ],
    ],
  });
  const { result, lines } = await runWith(github);
  assert.deepEqual(github.updated(), [
    { number: 1, expected: sha(1) },
    { number: 8, expected: sha(8) },
  ]);
  assert.deepEqual(result.updated, [1, 8]);
  assert.deepEqual(
    result.skipped.map(({ number }) => number),
    [3, 4, 5, 7],
  );
  assert.match(lines.join('\n'), /#3: skipped, it conflicts with main/);
  assert.match(
    lines.join('\n'),
    /#4: skipped, it is not behind main \(BLOCKED\)/,
  );
  assert.match(lines.join('\n'), /#7: skipped, its branch is in a fork/);
  assert.doesNotMatch(lines.join('\n'), /#2|#6/);
  assert.match(lines.at(-1), /Updated 2, skipped 4, failed 0\./);
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
});

test('a head that moved or a conflict GitHub finds is skipped with its message; other failures fail the run', async () => {
  const github = fakeGitHub({
    listings: [[pull(1, 'BEHIND'), pull(2, 'BEHIND'), pull(3, 'BEHIND')]],
    updates: { 1: 422, 2: 403 },
  });
  const { result, lines } = await runWith(github);
  assert.deepEqual(result.updated, [3]);
  assert.deepEqual(result.skipped, [
    {
      number: 1,
      reason: `GitHub refused the update of head ${sha(1).slice(0, 7)}: refused with 422`,
    },
  ]);
  assert.deepEqual(result.failed, [
    { number: 2, status: 403, message: 'refused with 403' },
  ]);
  assert.match(lines.join('\n'), /#2: update failed with 403/);
});

test('UNKNOWN is asked again until GitHub decides, and only those PRs are rechecked', async () => {
  const github = fakeGitHub({
    listings: [
      [pull(1, 'UNKNOWN'), pull(2, 'BEHIND'), pull(3, 'UNKNOWN')],
      [pull(1, 'UNKNOWN'), pull(2, 'BEHIND'), pull(3, 'CLEAN')],
      [pull(1, 'BEHIND'), pull(2, 'BEHIND'), pull(3, 'CLEAN')],
    ],
  });
  const { result, sleeps } = await runWith(github);
  assert.deepEqual(result.updated, [2, 1]);
  assert.deepEqual(result.skipped, [
    { number: 3, reason: 'it is not behind main (CLEAN)' },
  ]);
  assert.deepEqual(sleeps, [5, 5]);
});

test('a PR still UNKNOWN after every attempt is tried anyway, and GitHub decides', async () => {
  const github = fakeGitHub({
    listings: [[pull(1, 'UNKNOWN'), pull(2, 'UNKNOWN')]],
    updates: { 2: 422 },
  });
  const { result, lines, sleeps } = await runWith(github);
  assert.equal(sleeps.length, 2);
  assert.deepEqual(result.updated, [1]);
  assert.deepEqual(
    result.skipped.map(({ number }) => number),
    [2],
  );
  assert.match(lines.join('\n'), /#1: GitHub still reports UNKNOWN/);
});

test('every page of open PRs is read', async () => {
  const github = fakeGitHub({
    listings: [[[pull(1, 'BEHIND')], [pull(2, 'CLEAN')], [pull(3, 'BEHIND')]]],
  });
  const { result } = await runWith(github);
  assert.deepEqual(result.updated, [1, 3]);
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
  assert.deepEqual(github.updated(), []);
  assert.deepEqual(denied.updated(), []);
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
