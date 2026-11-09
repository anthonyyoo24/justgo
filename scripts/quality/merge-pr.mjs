import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeTree } from './git.mjs';
import { byPriority, describe, fetchHeads, openPulls } from './merge-order.mjs';

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
//   npm run merge:pr -- <n> --head <sha> [--auto] [--squash]
//   npm run merge:pr -- <n> --disable-auto

export const usage =
  'usage: npm run merge:pr -- <n> --head <sha> [--auto] [--squash]\n' +
  '       npm run merge:pr -- <n> --disable-auto';

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

// Checks the order and returns the gh arguments to run, or a refusal.
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
  return refuse ? { refuse } : { gh };
}

function main() {
  let result;
  try {
    result = plan(parseArgs(process.argv.slice(2)), process.cwd());
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
  process.exit(gh.status ?? 1);
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
