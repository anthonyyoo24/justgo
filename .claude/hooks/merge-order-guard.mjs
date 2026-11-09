import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PreToolUse hook on Bash. Before `gh pr merge <n>` (direct or --auto) it
// squashes the PR onto origin/main in memory with `git merge-tree` and merges
// every other open PR against main into that result. When the merge would make
// a PR conflict that merges cleanly today, and that PR is ahead in the merge
// order (auto-merge armed, then the earliest PASS verdict, then the lowest
// number, as scripts/quality/merge-order.mjs plans), the hook denies the merge
// and names the PR and files. Breaking a PR that is behind in the order is
// allowed: that PR rebases after this one, which is the planned order.
// A merge into a branch other than main, or one that conflicts with main
// itself, is left to GitHub.
// When gh, git or the network fails, the hook denies with the error, as
// verifier-model.mjs and session-model-guard.mjs fail closed. The merge needs
// gh and the network too, so failing closed costs a retry. settings.json sets
// onFailure "block", so a hook that cannot start, crashes or times out also
// stops the call. The gh and git calls time out before the hook's own limit,
// so a slow network ends in a denial that says why.

const valueFlags = new Set([
  '-R',
  '--repo',
  '--match-head-commit',
  '-t',
  '--subject',
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-A',
  '--author-email',
]);

// Splits a shell command into words per simple command, honoring quotes,
// `#` comments and heredoc bodies, which hold text, not commands.
// Good enough to find `gh pr merge` and its arguments, not a shell parser.
export function commands(line) {
  const result = [];
  let words = [];
  let word = '';
  let quote;
  let started = false;
  const heredocs = [];
  const endWord = () => {
    if (started) words.push(word);
    word = '';
    started = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) result.push(words);
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else if (ch === '\\' && quote === '"' && i + 1 < line.length)
        word += line[++i];
      else word += ch;
      continue;
    }
    const heredoc =
      ch === '<' &&
      line[i + 1] === '<' &&
      line[i + 2] !== '<' &&
      /^<<(-?)[ \t]*(['"]?)([^\s'"<>;&|()]+)\2/.exec(line.slice(i));
    if (heredoc) {
      endWord();
      heredocs.push({ strip: heredoc[1] === '-', end: heredoc[3] });
      i += heredoc[0].length - 1;
    } else if (ch === '\n') {
      endCommand();
      // Skip each pending heredoc body, up to its closing line.
      for (const { strip, end } of heredocs.splice(0)) {
        while (i < line.length) {
          const next = line.indexOf('\n', i + 1);
          const stop = next < 0 ? line.length : next;
          const body = line.slice(i + 1, stop);
          i = stop;
          if ((strip ? body.replace(/^\t+/, '') : body) === end) break;
        }
      }
    } else if (ch === '#' && !started) {
      const next = line.indexOf('\n', i);
      i = (next < 0 ? line.length : next) - 1;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (ch === '\\' && i + 1 < line.length) {
      word += line[++i];
      started = true;
    } else if (/[;&|()]/.test(ch)) endCommand();
    else if (/\s/.test(ch)) endWord();
    else {
      word += ch;
      started = true;
    }
  }
  endCommand();
  return result;
}

// Each `gh pr merge` that starts a command (after any VAR=value words), with
// its PR selector (number, URL or branch; undefined means the current
// branch's PR). --disable-auto merges nothing, so it is skipped.
export function mergeTargets(line) {
  if (!/\bgh\b/.test(line) || !/\bmerge\b/.test(line)) return [];
  const targets = [];
  for (const words of commands(line)) {
    let at = 0;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at] ?? '')) at++;
    if (
      words[at] !== 'gh' ||
      words[at + 1] !== 'pr' ||
      words[at + 2] !== 'merge'
    )
      continue;
    const args = words.slice(at + 3);
    if (args.includes('--disable-auto')) continue;
    let selector;
    for (let i = 0; i < args.length; i++) {
      if (valueFlags.has(args[i])) i++;
      else if (!args[i].startsWith('-')) {
        selector = args[i];
        break;
      }
    }
    targets.push({ selector });
  }
  return targets;
}

export function numberOf(selector) {
  if (selector === undefined) return undefined;
  const match = /^#?(\d+)$/.exec(selector) ?? /\/pull\/(\d+)\b/.exec(selector);
  return match ? Number(match[1]) : undefined;
}

// Merges the target onto main as a squash would, then each other PR onto that
// result. Reports the PRs that merge cleanly onto main today but not after.
export function findBreaks({ main, target, others, cwd, git }) {
  const merged = git.mergeTree(main, target.head, cwd);
  if (!merged.clean) return [];
  const squashed = execFileSync(
    'git',
    ['commit-tree', merged.tree, '-p', main, '-m', 'merge-order-guard'],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'merge-order-guard',
        GIT_AUTHOR_EMAIL: 'merge-order-guard@localhost',
        GIT_COMMITTER_NAME: 'merge-order-guard',
        GIT_COMMITTER_EMAIL: 'merge-order-guard@localhost',
      },
    },
  ).trim();
  const breaks = [];
  for (const other of others) {
    if (!git.mergeTree(main, other.head, cwd).clean) continue;
    const after = git.mergeTree(squashed, other.head, cwd);
    if (!after.clean) breaks.push({ pr: other, files: after.conflicts });
  }
  return breaks;
}

function why(pr) {
  if (pr.inFlight) return 'its auto-merge is armed';
  if (pr.agreedAt) return `its PASS verdict (${pr.agreedAt}) came first`;
  return 'neither has a PASS verdict and it has the lower number';
}

export function decide(target, breaks, byPriority) {
  const ahead = breaks.filter(({ pr }) => byPriority(pr, target) < 0);
  if (!ahead.length) return undefined;
  const lines = ahead.map(
    ({ pr, files }) =>
      `#${pr.number} (${pr.title}) would conflict in ${files.join(', ')}; it goes first because ${why(pr)}.`,
  );
  return {
    permissionDecision: 'deny',
    reason:
      `merge-order-guard: merging #${target.number} now would make open PRs conflict that merge cleanly today. ` +
      `${lines.join(' ')} ` +
      'Merge those first, or disarm their auto-merge if they are stuck, then retry. ' +
      'A denied --auto arm waits the same way: arm it after those merge. ' +
      'Run `node scripts/quality/merge-order.mjs` for the whole order.',
  };
}

export function output(decision) {
  if (!decision) return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision.permissionDecision,
      permissionDecisionReason: decision.reason,
    },
  };
}

async function check(selector, cwd) {
  const order = await import('../../scripts/quality/merge-order.mjs');
  const git = await import('../../scripts/quality/git.mjs');
  const number =
    numberOf(selector) ??
    JSON.parse(
      execFileSync(
        'gh',
        ['pr', 'view', ...(selector ? [selector] : []), '--json', 'number'],
        { cwd, encoding: 'utf8', timeout: 10000 },
      ),
    ).number;
  if (!number) throw new Error(`cannot resolve the PR for ${selector}`);
  const pulls = order.openPulls(cwd);
  const pull = pulls.find((candidate) => candidate.number === number);
  // gh refuses a PR that is not open, so there is nothing to order.
  if (!pull) return undefined;
  if (pull.baseRefName !== 'main') return undefined;
  const onMain = pulls.filter((other) => other.baseRefName === 'main');
  const main = order.fetchHeads(
    onMain.map((other) => other.headRefOid),
    cwd,
  );
  const prs = onMain.map((other) => order.describe(other, []));
  const target = prs.find((pr) => pr.number === number);
  const others = prs.filter((pr) => pr.number !== number);
  const breaks = findBreaks({ main, target, others, cwd, git });
  return decide(target, breaks, order.byPriority);
}

async function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Bash') return;
  const targets = mergeTargets(event.tool_input?.command ?? '');
  if (!targets.length) return;
  const cwd = event.cwd ?? process.cwd();
  let decision;
  for (const { selector } of targets) {
    try {
      decision = await check(selector, cwd);
    } catch (error) {
      const message = String(error?.stderr || error?.message || error).trim();
      decision = {
        permissionDecision: 'deny',
        reason:
          `merge-order-guard could not check the merge order (${message}). ` +
          'Retry once gh and the network work. Anthony can merge in GitHub himself.',
      };
    }
    if (decision) break;
  }
  const result = output(decision);
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  await main();
