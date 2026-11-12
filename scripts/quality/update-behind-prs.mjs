import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Branch protection on main requires up-to-date branches, and GitHub never
// updates a PR with auto-merge armed when main moves, so that PR sits BEHIND.
// .github/workflows/update-behind-prs.yml runs this on each push to main and
// after each CI or PR description run. It brings one armed PR at a time up to
// date, the next in line, through the same update-branch call as merge-pr.mjs,
// pinned to the head it read. GitHub then reruns checks, description and
// verdict and merges the PR once they pass, and that push to main starts the
// next one. Updating every behind PR at once reran CI on all of them, and each
// merge made the rest behind again.
//
// The next in line is the lowest-numbered behind PR whose head already has a
// passing verdict. Nothing is updated while an armed PR that is up to date
// still has a passing or running verdict and no failed required check: it is
// about to merge. A PR whose checks fail drops out, and the next run moves on.
// It skips a PR that conflicts, and says why.
//
// The token must not be GITHUB_TOKEN: GitHub holds the CI runs that a
// GITHUB_TOKEN push starts until someone approves them, so the PR stays stuck.

export const tokenName = 'PR_UPDATE_TOKEN';
const api = 'https://api.github.com';

// GitHub works out mergeStateStatus after main moves, and answers UNKNOWN
// until it has. Ask again this many times, this far apart.
export const defaultTiming = { attempts: 6, pollMs: 10000 };

const query = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, baseRefName: "main", first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        baseRefName
        headRefOid
        isCrossRepository
        mergeStateStatus
        autoMergeRequest { enabledAt }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                contexts(first: 100) {
                  nodes {
                    ... on CheckRun { name status conclusion startedAt }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

// What to do with one open PR: 'update', 'wait' while GitHub still works out
// whether it is behind, 'ignore' when auto-merge is off, or a skip reason.
export function decide(pull) {
  if (pull.baseRefName !== 'main' || !pull.autoMergeRequest) return 'ignore';
  if (pull.isCrossRepository)
    return { skip: 'its branch is in a fork, which this job does not update' };
  switch (pull.mergeStateStatus) {
    case 'BEHIND':
      return 'update';
    case 'UNKNOWN':
      return 'wait';
    case 'DIRTY':
      return {
        skip: 'it conflicts with main; rebase it and get a fresh verdict',
      };
    default:
      return { skip: `it is not behind main (${pull.mergeStateStatus})` };
  }
}

// The required checks branch protection names.
export const requiredChecks = ['checks', 'description', 'verdict'];

// The newest run of each required check on the PR head: 'success', 'failure'
// or 'pending'. A check that has not started yet counts as pending.
export function checkStates(pull) {
  const runs =
    pull.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
  const newest = new Map();
  for (const run of runs) {
    if (!requiredChecks.includes(run?.name)) continue;
    const seen = newest.get(run.name);
    // A queued run has no startedAt yet and is the newest.
    const time = (r) => (r.startedAt ? Date.parse(r.startedAt) : Infinity);
    if (!seen || time(run) >= time(seen)) newest.set(run.name, run);
  }
  const states = {};
  for (const name of requiredChecks) {
    const run = newest.get(name);
    if (!run || run.status !== 'COMPLETED') states[name] = 'pending';
    else if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(run.conclusion))
      states[name] = 'success';
    else states[name] = 'failure';
  }
  return states;
}

// Why a behind PR cannot go next, or undefined when it can: a passing verdict
// must cover its head, and its description must not fail. Its checks may have
// failed against an older main, which the update may fix.
export function notReady(pull) {
  const states = checkStates(pull);
  if (states.verdict !== 'success')
    return 'no passing verdict covers its head yet';
  if (states.description === 'failure') return 'its description check fails';
}

// About to merge: up to date, its verdict passes or is still running, and no
// required check has failed.
export function aboutToMerge(pull) {
  if (['BEHIND', 'DIRTY', 'UNKNOWN'].includes(pull.mergeStateStatus))
    return false;
  return !Object.values(checkStates(pull)).includes('failure');
}

function client({ fetch, token }) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'justgo-update-behind-prs',
  };
  return async (method, path, body) => {
    const response = await fetch(`${api}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text };
    }
    return { status: response.status, json };
  };
}

async function openPulls(call, repo) {
  const [owner, name] = repo.split('/');
  const pulls = [];
  let after = null;
  for (;;) {
    const { status, json } = await call('POST', '/graphql', {
      query,
      variables: { owner, name, after },
    });
    if (status !== 200 || json.errors || !json.data?.repository)
      throw new Error(
        `listing open PRs failed with ${status}: ${JSON.stringify(json.errors ?? json.message ?? json)}`,
      );
    const page = json.data.repository.pullRequests;
    pulls.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return pulls;
    after = page.pageInfo.endCursor;
  }
}

// Updates the next armed PR on main in line. Returns the PRs it updated
// and skipped. Throws on a listing failure. An update failure other than
// GitHub's 422 refusal, and a refusal that persists while GitHub still
// reports the PR behind, go in `failed`, so the run goes red.
export async function updateBehindPulls({
  fetch,
  token,
  repo,
  log = (line) => process.stdout.write(`${line}\n`),
  timing = defaultTiming,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!token)
    throw new Error(
      `${tokenName} is not set. Add it as a repository secret (see the workflow header).`,
    );
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? ''))
    throw new Error(`GITHUB_REPOSITORY must be owner/name, got ${repo}`);
  const call = client({ fetch, token });
  const result = { updated: [], skipped: [], failed: [] };
  const skip = (number, reason) => {
    result.skipped.push({ number, reason });
    log(`#${number}: skipped, ${reason}.`);
  };

  // Read until GitHub has decided whether each armed PR is behind.
  let armed = new Map();
  for (let attempt = 1; attempt <= timing.attempts; attempt++) {
    if (attempt > 1) await sleep(timing.pollMs);
    armed = new Map();
    for (const pull of await openPulls(call, repo))
      if (decide(pull) !== 'ignore') armed.set(pull.number, pull);
    if (![...armed.values()].some((pull) => decide(pull) === 'wait')) break;
  }

  const inFlight = [...armed.values()].find(
    (pull) => !pull.isCrossRepository && aboutToMerge(pull),
  );
  const candidates = [];
  for (const pull of [...armed.values()].sort((a, b) => a.number - b.number)) {
    const action = decide(pull);
    if (typeof action === 'object') {
      if (pull !== inFlight) skip(pull.number, action.skip);
    } else if (notReady(pull)) skip(pull.number, notReady(pull));
    else if (inFlight)
      skip(
        pull.number,
        `#${inFlight.number} is up to date and about to merge; this waits its turn`,
      );
    else candidates.push(pull);
  }
  if (inFlight)
    log(
      `#${inFlight.number}: up to date with no failed required check; nothing else updates until it merges or fails.`,
    );

  // Update the first candidate GitHub accepts. A PR GitHub never decided
  // about is tried too, because update-branch refuses one level with main.
  const refused = [];
  for (const pull of candidates) {
    if (result.updated.length) {
      skip(
        pull.number,
        `#${result.updated[0]} goes first; this waits its turn`,
      );
      continue;
    }
    if (decide(pull) === 'wait')
      log(`#${pull.number}: GitHub still reports UNKNOWN; trying the update.`);
    const refusal = await update(pull);
    if (refusal === undefined) continue;
    refused.push(pull.number);
    log(
      `#${pull.number}: GitHub refused the update of head ${pull.headRefOid.slice(0, 7)}: ${refusal}; reading it again.`,
    );
  }
  const updatedOne = result.updated.length > 0;
  if (updatedOne)
    for (const number of refused)
      skip(number, `#${result.updated[0]} goes first; this waits its turn`);

  // A refusal usually means the head moved, often because an earlier run's
  // update landed after this run read the PR. When nothing was updated, read
  // the refused PRs once more and retry the first still behind on the head
  // GitHub reports now.
  if (refused.length && !updatedOne) {
    await sleep(timing.pollMs);
    const now = new Map(
      (await openPulls(call, repo)).map((pull) => [pull.number, pull]),
    );
    for (const number of refused) {
      const pull = now.get(number);
      const action = pull ? decide(pull) : 'ignore';
      if (action === 'ignore')
        skip(number, 'it is no longer an armed open PR on main');
      else if (typeof action === 'object') skip(number, action.skip);
      else if (result.updated.length)
        skip(number, `#${result.updated[0]} goes first; this waits its turn`);
      else {
        const refusal = await update(pull);
        if (refusal === undefined) continue;
        const head = pull.headRefOid.slice(0, 7);
        if (action === 'wait')
          skip(number, `GitHub refused the update of head ${head}: ${refusal}`);
        else {
          result.failed.push({ number, status: 422, message: refusal });
          log(
            `#${number}: GitHub refused the update again while it is still behind main, on head ${head}: ${refusal}. Check that ${tokenName} can update this branch.`,
          );
        }
      }
    }
  }
  log(
    `Updated ${result.updated.length}, skipped ${result.skipped.length}, failed ${result.failed.length}.`,
  );
  return result;

  // Returns GitHub's message when it refuses the update with 422.
  async function update(pull) {
    const { number, headRefOid } = pull;
    const { status, json } = await call(
      'PUT',
      `/repos/${repo}/pulls/${number}/update-branch`,
      { expected_head_sha: headRefOid },
    );
    if (status === 202) {
      result.updated.push(number);
      log(
        `#${number}: merging main into head ${headRefOid.slice(0, 7)}; checks, description and verdict rerun on the new head.`,
      );
    } else if (status === 422)
      // A moved head, a conflict, or nothing to merge.
      return json.message ?? 'no message';
    else {
      result.failed.push({ number, status, message: json.message });
      log(
        `#${number}: update failed with ${status}: ${json.message ?? 'no message'}.`,
      );
    }
  }
}

const isMain =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const result = await updateBehindPulls({
      fetch: globalThis.fetch,
      token: process.env[tokenName],
      repo: process.env.GITHUB_REPOSITORY,
    });
    if (result.failed.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`update-behind-prs: ${error.message}\n`);
    process.exitCode = 1;
  }
}
