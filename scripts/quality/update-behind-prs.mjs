import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Branch protection on main requires up-to-date branches, and GitHub never
// updates a PR with auto-merge armed when main moves, so that PR sits BEHIND.
// .github/workflows/update-behind-prs.yml runs this on each push to main. It
// merges main into every open PR on main that has auto-merge armed and is
// behind, through the same update-branch call as merge-pr.mjs, pinned to the
// head it read. GitHub then reruns checks, description and verdict and merges the PR once
// they pass. It skips a PR that conflicts, and says why.
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

// Updates every armed PR on main that is behind. Returns the PRs it updated
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

  const refused = new Set();
  const tryUpdate = async (pull) => {
    const refusal = await update(pull);
    if (refusal === undefined) return;
    refused.add(pull.number);
    log(
      `#${pull.number}: GitHub refused the update of head ${pull.headRefOid.slice(0, 7)}: ${refusal}; reading it again.`,
    );
  };

  let pending = new Map();
  for (let attempt = 1; attempt <= timing.attempts; attempt++) {
    if (attempt > 1) await sleep(timing.pollMs);
    const pulls = await openPulls(call, repo);
    const waiting = new Map();
    for (const pull of pulls) {
      if (attempt > 1 && !pending.has(pull.number)) continue;
      const action = decide(pull);
      if (action === 'ignore') continue;
      if (action === 'wait') waiting.set(pull.number, pull);
      else if (action === 'update') await tryUpdate(pull);
      else skip(pull.number, action.skip);
    }
    pending = waiting;
    if (!pending.size) break;
  }
  // GitHub never said whether these are behind. update-branch refuses a PR
  // that is level with main, so try it rather than leave one stuck.
  for (const pull of pending.values()) {
    log(`#${pull.number}: GitHub still reports UNKNOWN; trying the update.`);
    await tryUpdate(pull);
  }

  // A refusal usually means the head moved, often because an earlier run's
  // update landed after this run read the PR. Read the refused PRs once more
  // and retry those still behind on the head GitHub reports now.
  if (refused.size) {
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
