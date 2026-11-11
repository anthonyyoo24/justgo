import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeTree } from './git.mjs';
import {
  agreementOf,
  byPriority,
  describe,
  fetchHeads,
  newestVerdictOf,
  openPulls,
} from './merge-order.mjs';
import { runVerdictPatch } from './verdict-status.mjs';

// The one way agents merge a PR. Before it calls `gh pr merge`, it squashes
// the PR head onto origin/main in memory with `git merge-tree` and merges
// every other open PR on main into that result. It refuses when that would
// make a PR conflict that merges cleanly today and that PR is ahead in the
// merge order (auto-merge armed, then the earliest PASS verdict, then the
// lowest number, as merge-order.mjs plans). Breaking a PR behind in the order
// is the planned order: that PR rebases after this one.
//
// --auto is checked when it is armed, and that is enough. GitHub merges the PR
// later, but every other merge also goes through this script, which ranks an
// armed PR first. So no later merge can break the armed PR, and the armed PR
// can only break PRs that come after it.
//
// The merge is pinned to --head with --match-head-commit, so GitHub refuses a
// head the check did not see. A gh, git or network failure stops the script
// before anything merges. .claude/hooks/merge-order-guard.mjs denies a raw
// `gh pr merge` so that agents come through here.
//
// Usage:
//   pnpm run merge:pr <n> --head <sha> [--auto] [--squash]
//   pnpm run merge:pr <n> --disable-auto

export const usage =
  'usage: pnpm run merge:pr <n> --head <sha> [--auto] [--squash]\n' +
  '       pnpm run merge:pr <n> --disable-auto';

export function parseArgs(argv) {
  const options = { auto: false, disable: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (/^#?\d+$/.test(arg) && options.number === undefined)
      options.number = Number(arg.replace('#', ''));
    else if (arg === '--head') options.head = argv[++i];
    else if (arg.startsWith('--head=')) options.head = arg.slice(7);
    else if (arg === '--auto') options.auto = true;
    else if (arg === '--squash') continue;
    else if (arg === '--disable-auto') options.disable = true;
    else throw new Error(`unknown argument ${arg}\n${usage}`);
  }
  if (options.number === undefined) throw new Error(`no PR number\n${usage}`);
  if (options.disable) {
    if (options.auto || options.head)
      throw new Error(`--disable-auto takes only a PR number\n${usage}`);
    return options;
  }
  if (!/^[0-9a-f]{40}$/.test(options.head ?? ''))
    throw new Error(`--head must be the full 40-character head SHA\n${usage}`);
  return options;
}

// Squashes the target onto main, then merges each other PR onto that result.
// Reports the PRs that merge cleanly onto main today but not after.
export function findBreaks({ main, target, others, cwd }) {
  const merged = mergeTree(main, target.head, cwd);
  if (!merged.clean) return [];
  const squashed = execFileSync(
    'git',
    ['commit-tree', merged.tree, '-p', main, '-m', 'merge-pr check'],
    {
      cwd,
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'merge-pr',
        GIT_AUTHOR_EMAIL: 'merge-pr@localhost',
        GIT_COMMITTER_NAME: 'merge-pr',
        GIT_COMMITTER_EMAIL: 'merge-pr@localhost',
      },
    },
  ).trim();
  const breaks = [];
  for (const other of others) {
    if (!mergeTree(main, other.head, cwd).clean) continue;
    const after = mergeTree(squashed, other.head, cwd);
    if (!after.clean) breaks.push({ pr: other, files: after.conflicts });
  }
  return breaks;
}

function why(pr) {
  if (pr.inFlight) return 'its auto-merge is armed';
  if (pr.agreedAt) return `its PASS verdict (${pr.agreedAt}) came first`;
  return 'neither has a PASS verdict and it has the lower number';
}

// The refusal, or undefined when no PR ahead in the order would break.
export function refusal(target, breaks) {
  const ahead = breaks.filter(({ pr }) => byPriority(pr, target) < 0);
  if (!ahead.length) return undefined;
  const lines = ahead.map(
    ({ pr, files }) =>
      `#${pr.number} (${pr.title}) would conflict in ${files.join(', ')}; it goes first because ${why(pr)}.`,
  );
  return (
    `merge-pr: merging #${target.number} now would make open PRs conflict that merge cleanly today. ` +
    `${lines.join(' ')} ` +
    'Merge those first, or disarm their auto-merge if they are stuck, then retry. ' +
    'An --auto arm waits the same way: arm it after those merge. ' +
    'Run `node scripts/quality/merge-order.mjs` for the whole order.'
  );
}

// Exit 0 means ancestor, exit 1 means not. Anything else is an error.
function isAncestor(ancestor, descendant, cwd) {
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', ancestor, descendant],
    { cwd, encoding: 'utf8', timeout: 10000 },
  );
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(
    `git merge-base --is-ancestor ${ancestor} ${descendant} failed: ${result.stderr || result.error}`,
  );
}

// Posting a verdict comment reruns the verdict check through
// verdict-recheck.yml, which takes a few seconds to start. Until then the
// newest verdict run is the one from before the comment.
function verdictPostedAt(comments) {
  const url = newestVerdictOf(comments)?.url;
  if (!url) return undefined;
  return comments.find((comment) => comment.url === url)?.createdAt;
}

// Checks the order and returns the gh arguments to run, a branch update to
// make first, or a refusal.
export function plan(options, cwd) {
  if (options.disable)
    return { gh: ['pr', 'merge', String(options.number), '--disable-auto'] };
  const pulls = openPulls(cwd);
  const pull = pulls.find((candidate) => candidate.number === options.number);
  if (!pull) return { refuse: `merge-pr: #${options.number} is not open.` };
  const gh = [
    'pr',
    'merge',
    String(options.number),
    '--squash',
    ...(options.auto ? ['--auto'] : []),
    '--match-head-commit',
    options.head,
  ];
  // A merge into another branch does not change main.
  if (pull.baseRefName !== 'main') return { gh };
  const onMain = pulls.filter((other) => other.baseRefName === 'main');
  const main = fetchHeads(
    [...new Set([options.head, ...onMain.map((other) => other.headRefOid)])],
    cwd,
  );
  const prs = onMain.map((other) => describe(other, []));
  const target = {
    ...prs.find((pr) => pr.number === options.number),
    head: options.head,
  };
  const others = prs.filter((pr) => pr.number !== options.number);
  const refuse = refusal(target, findBreaks({ main, target, others, cwd }));
  if (refuse) return { refuse };
  // GitHub refuses a direct merge while a required check runs, so a level PR
  // waits for them. An --auto arm lets GitHub wait instead.
  if (isAncestor(main, options.head, cwd))
    return options.auto
      ? { gh }
      : { gh, wait: { since: verdictPostedAt(pull.comments) } };
  if (!mergeTree(main, options.head, cwd).clean)
    return {
      refuse:
        `merge-pr: #${options.number} is behind main and conflicts with it. ` +
        'Rebase it onto origin/main, get a verdict that covers the new head, then retry.',
    };
  // A FAIL stops both kinds: --auto would otherwise update and arm a PR that
  // a verifier rejected.
  if (newestVerdictOf(pull.comments)?.verdict === 'FAIL')
    return {
      refuse:
        `merge-pr: #${options.number} is behind main and its newest verdict is FAIL. ` +
        'Nothing was updated. Fix the findings, get a fresh verdict, then retry.',
    };
  const verdict = agreementOf(pull.comments);
  if (!verdict && !options.auto)
    return {
      refuse:
        `merge-pr: #${options.number} has no PASS verdict, so it cannot merge. ` +
        'Nothing was updated. Get an independent verdict, then retry.',
    };
  return { update: { main, verdict } };
}

// The update and the waits below talk to GitHub through `gh api`, which fills
// in {owner}/{repo} from the checkout.
export const requiredChecks = ['checks', 'description', 'verdict'];
const checkList = `${requiredChecks.slice(0, -1).join(', ')} and ${requiredChecks.at(-1)}`;
export const maxRounds = 3;
const passing = new Set(['success', 'neutral', 'skipped']);

function ghText(args, cwd) {
  return execFileSync('gh', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
  }).trim();
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
  }).trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function until(what, timeoutMs, pollMs, probe) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = probe();
    if (result !== undefined) return result;
    if (Date.now() >= deadline)
      throw new Error(
        `timed out after ${timeoutMs / 1000}s waiting for ${what}`,
      );
    sleep(pollMs);
  }
}

// The newest run of each required check on one commit: 'pass', 'pending', or
// the failing check's conclusion and link. A verdict run that finished before
// the verdict comment posted at `since` is pending, since its rerun is coming.
export function checkState(runs, since) {
  const failed = [];
  let pending = false;
  for (const name of requiredChecks) {
    const latest = runs
      .filter((run) => run.name === name)
      .sort((a, b) => b.id - a.id)[0];
    const stale =
      name === 'verdict' &&
      since !== undefined &&
      Date.parse(latest?.completed_at) < Date.parse(since);
    if (!latest || latest.status !== 'completed' || stale) pending = true;
    else if (!passing.has(latest.conclusion))
      failed.push(`${name} ${latest.conclusion} (${latest.html_url})`);
  }
  if (failed.length) return { failed };
  return pending ? 'pending' : 'pass';
}

// Says why the verdict still covers the updated head. verdict-patch answers
// `carries` or `docs-tests-only`; anything else never reaches here.
export function carriedVerdict(verdictHead, next, result, changed) {
  if (result === 'carries')
    return `The verdict on head ${verdictHead} carries to ${next}: the PR's own change is the same.`;
  const files = changed.map((line) => line.trim()).join(', ');
  return (
    `The verdict on head ${verdictHead} still covers ${next}: only docs and tests changed (${files}). ` +
    'Those files still need a review.'
  );
}

// Merges main into the PR branch on GitHub and returns the new head, or a
// refusal. It never merges the PR itself.
export function updateBranch(options, { main, verdict }, cwd, timing) {
  const { number, head } = options;
  const log = (line) => process.stderr.write(`merge-pr: ${line}\n`);
  log(`#${number} is behind main ${main.slice(0, 7)}. Merging main into it.`);
  ghText(
    [
      'api',
      '-X',
      'PUT',
      `repos/{owner}/{repo}/pulls/${number}/update-branch`,
      '-f',
      `expected_head_sha=${head}`,
    ],
    cwd,
  );
  // GitHub answers 202 and moves the head a moment later.
  const next = until('the updated head', timing.updateMs, timing.pollMs, () => {
    const now = ghText(
      ['api', `repos/{owner}/{repo}/pulls/${number}`, '--jq', '.head.sha'],
      cwd,
    );
    return now === head ? undefined : now;
  });
  git(['fetch', '-q', 'origin', 'main', next], cwd);
  const parents = git(['rev-list', '--parents', '-n', '1', next], cwd)
    .split(' ')
    .slice(1);
  if (
    parents.length !== 2 ||
    parents[0] !== head ||
    !isAncestor(main, parents[1], cwd)
  )
    return {
      refuse:
        `merge-pr: the head of #${number} moved to ${next}, which is not GitHub's merge of main into ${head}. ` +
        'Nothing merged. Look at the branch, then retry with its new head.',
    };
  log(`#${number} now has head ${next}.`);
  if (verdict) {
    const full = [verdict.base, verdict.head].map((ref) =>
      ghText(
        ['api', `repos/{owner}/{repo}/commits/${ref}`, '--jq', '.sha'],
        cwd,
      ),
    );
    git(['fetch', '-q', 'origin', ...new Set(full)], cwd);
    const check = runVerdictPatch([...full, parents[1], next], cwd);
    const [result, ...changed] = check.stdout.trim().split('\n');
    if (check.status === 1 && result === 're-verify')
      return {
        refuse:
          `merge-pr: the PASS verdict on head ${verdict.head} does not cover the updated head ${next} of #${number}. ` +
          `These files changed: ${changed.map((line) => line.trim()).join(', ')}. ` +
          `Nothing merged. A fresh verifier must review head ${next}, then retry with --head ${next}.`,
      };
    if (check.status !== 0 || !['carries', 'docs-tests-only'].includes(result))
      throw new Error(
        `verdict-patch check failed: ${(check.stdout + check.stderr).trim()}`,
      );
    log(carriedVerdict(verdict.head, next, result, changed));
  }
  return { head: next };
}

// Waits until the required checks on the head finish. Returns a refusal when
// one fails, and undefined when all pass.
function waitForChecks({ number, head }, { since }, cwd, timing) {
  process.stderr.write(`merge-pr: Waiting for ${checkList} on ${head}.\n`);
  const state = until(
    `${checkList} on ${head}`,
    timing.checksMs,
    timing.pollMs,
    () => {
      const runs = JSON.parse(
        ghText(
          [
            'api',
            `repos/{owner}/{repo}/commits/${head}/check-runs?per_page=100`,
            '--jq',
            '.check_runs',
          ],
          cwd,
        ),
      );
      const now = checkState(runs, since);
      return now === 'pending' ? undefined : now;
    },
  );
  if (state === 'pass') return undefined;
  return {
    refuse:
      `merge-pr: #${number} failed against the latest main on head ${head}: ${state.failed.join('; ')}. ` +
      'Nothing merged. Fix the PR, get a verdict that covers the fix, then retry.',
  };
}

// Plans, updates the branch when it is behind, and waits for the checks once
// it is level. Each update or wait can see main move, so it plans again after
// each one, until a plan for a checked head says merge or the updates run out.
export function run(options, cwd, timing) {
  let current = options;
  let checked;
  let updates = 0;
  for (;;) {
    const result = plan(current, cwd);
    if (result.update) {
      if (updates === maxRounds)
        return {
          refuse:
            `merge-pr: main moved during each of ${maxRounds} updates of #${options.number}. ` +
            'Nothing merged. Retry when main is quiet.',
        };
      const updated = updateBranch(current, result.update, cwd, timing);
      if (updated.refuse) return updated;
      updates++;
      current = { ...current, head: updated.head };
    } else if (result.wait && checked !== current.head) {
      const failed = waitForChecks(current, result.wait, cwd, timing);
      if (failed) return failed;
      checked = current.head;
    } else return result;
  }
}

// The last line, from the PR as GitHub reports it after `gh pr merge`
// succeeded: merged, auto-merge armed, or auto-merge off.
export function outcome(options, view) {
  const { number } = options;
  const head = view.headRefOid;
  if (view.state === 'MERGED')
    return `Merged #${number} at head ${head} as ${view.mergeCommit?.oid}.`;
  if (options.disable)
    return view.autoMergeRequest
      ? `Auto-merge is still armed on #${number} at head ${head}.`
      : `Auto-merge is off on #${number}.`;
  if (view.autoMergeRequest)
    return `Auto-merge is armed on #${number} at head ${head}. GitHub merges it once ${checkList} pass.`;
  return `#${number} is ${view.state} at head ${head}, and GitHub reports neither a merge nor an armed auto-merge.`;
}

function readBack(options) {
  try {
    const view = JSON.parse(
      ghText(
        [
          'pr',
          'view',
          String(options.number),
          '--json',
          'state,headRefOid,mergeCommit,autoMergeRequest',
        ],
        process.cwd(),
      ),
    );
    return `merge-pr: ${outcome(options, view)}`;
  } catch (error) {
    return (
      `merge-pr: gh pr merge succeeded, but reading #${options.number} back failed: ` +
      String(error?.stderr || error?.message || error).trim()
    );
  }
}

const minute = 60000;
// A value that is not a positive number would make a wait never end.
export function timingFromEnv(env) {
  const number = (name, fallback) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isFinite(value) || value <= 0)
      throw new Error(
        `${name} must be a positive number of milliseconds, not ${JSON.stringify(env[name])}`,
      );
    return value;
  };
  return {
    pollMs: number('MERGE_PR_POLL_MS', 15000),
    updateMs: number('MERGE_PR_UPDATE_MS', 2 * minute),
    checksMs: number('MERGE_PR_CHECKS_MS', 45 * minute),
  };
}

function main() {
  let options;
  let result;
  try {
    options = parseArgs(process.argv.slice(2));
    result = run(options, process.cwd(), timingFromEnv(process.env));
  } catch (error) {
    process.stderr.write(
      `merge-pr: nothing merged. ${String(error?.stderr || error?.message || error).trim()}\n`,
    );
    process.exit(2);
  }
  if (result.refuse) {
    process.stderr.write(`${result.refuse}\n`);
    process.exit(1);
  }
  const gh = spawnSync('gh', result.gh, { stdio: 'inherit' });
  // The read-back only reports. A merge that succeeded still exits 0.
  if (gh.status === 0) process.stderr.write(`${readBack(options)}\n`);
  process.exit(gh.status ?? 1);
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
