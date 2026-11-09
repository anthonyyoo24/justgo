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
// A merge into a branch other than main, of a PR that is not open, of another
// repository, or one that conflicts with main itself, is left to GitHub.
//
// It does not parse shell. It looks for `gh … pr merge` anywhere in the
// command, so loops, `$(…)`, `bash -c`, prefixes such as `env` and absolute
// paths count. Only full-line comments and the bodies of heredocs that do not
// feed a shell, eval or source are skipped, since those hold prose such as PR
// bodies. Inside a quoted string the command ends with the string, so a quoted
// mention with no PR (`grep 'gh pr merge'`) is not a merge. A word that gh
// finds no PR for, such as the next word of a commit subject, merges nothing.
// A selector it cannot read (`$n`, `$(…)`, xargs input) is denied with a
// request for a literal number, which also keeps batch merges to one per
// command. A `<n>` placeholder is not a merge.
//
// When gh, git or the network fails, the hook denies with the error, as
// verifier-model.mjs and session-model-guard.mjs fail closed. The merge needs
// gh and the network too, so failing closed costs a retry. settings.json sets
// onFailure "block", so a hook that cannot start, crashes or times out also
// stops the call. The gh and git calls run once per command and time out
// before the hook's own limit, so a slow network ends in a denial that says
// why.

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

// A heredoc on a line that also runs a shell, eval or source may hold commands.
const shellWord =
  /(?:^|[\s;&|(/])(?:(?:ba|z|da|k)?sh|eval|source)(?=$|[\s;&|)])/;
const heredocStart =
  /(?<![<\w$)])<<(?!<)(-?)[ \t]*\\?(['"]?)([A-Za-z_][\w.-]*)\2/g;

// The command text with line continuations joined, full-line comments
// dropped, and the bodies of heredocs that do not feed a shell dropped. A
// heredoc with no closing line is kept, so nothing after it is lost.
export function visibleText(command) {
  const lines = command.replace(/\\\r?\n/g, ' ').split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;
    kept.push(line);
    for (const match of line.matchAll(heredocStart)) {
      const [, strip, , end] = match;
      let close = i + 1;
      while (
        close < lines.length &&
        (strip ? lines[close].replace(/^\t+/, '') : lines[close]) !== end
      )
        close++;
      if (close >= lines.length) break;
      if (shellWord.test(line)) kept.push(...lines.slice(i + 1, close));
      i = close;
    }
  }
  return kept.join('\n');
}

// The words of one command, up to the first unquoted separator.
export function argsOf(text) {
  const words = [];
  let word = '';
  let started = false;
  let quote;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else if (ch === '\\' && quote === '"' && i + 1 < text.length)
        word += text[++i];
      else word += ch;
      continue;
    }
    if (/[;&|\n)`]/.test(ch)) break;
    // A redirection ends the arguments. A `<n>` placeholder is kept as a word.
    if (!started && (ch === '<' || ch === '>')) {
      const placeholder = /^<[\w-]*>/.exec(text.slice(i))?.[0];
      if (!placeholder) break;
      words.push(placeholder);
      i += placeholder.length - 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      if (ch === '\\' && i + 1 < text.length) word += text[++i];
      else word += ch;
      started = true;
    }
  }
  if (started) words.push(word);
  return words;
}

const ghMerge =
  /(?:^|[\s;&|(){}`'"=/])gh(?:\s+(?:-R|--repo)(?:\s+|=)(\S+))?\s+pr\s+merge(?=$|[\s;&|)`'"])/g;

// Each `gh pr merge` in the command: its selector (number, URL or branch;
// undefined means the current branch's PR), any repository it names, and
// whether the selector is computed (`$n`, `$(…)`) and so cannot be checked.
// --disable-auto merges nothing, so it is skipped, and so is a `<n>`
// placeholder.
export function mergeTargets(command) {
  if (!/\bgh\b/.test(command) || !/\bmerge\b/.test(command)) return [];
  const text = visibleText(command);
  const targets = [];
  for (const match of text.matchAll(ghMerge)) {
    let rest = text.slice(match.index + match[0].length);
    // Inside a quoted string, as in `bash -c '…'` or `grep "gh pr merge"`,
    // the command ends where the string ends.
    const quote = /^['"]/.exec(match[0])?.[0];
    if (quote)
      rest = rest.slice(0, rest.search(quote === "'" ? /'/ : /(?<!\\)"/) >>> 0);
    const args = argsOf(rest);
    const before = text
      .slice(0, match.index + 1)
      .split(/[;&|\n(]/)
      .at(-1);
    if (args.includes('--disable-auto')) continue;
    let selector;
    let repo = match[1];
    args.forEach((arg, i) => {
      if (arg === '-R' || arg === '--repo') repo = args[i + 1];
      else if (arg.startsWith('--repo=')) repo = arg.slice(7);
    });
    for (let i = 0; i < args.length; i++) {
      if (valueFlags.has(args[i])) i++;
      else if (!args[i].startsWith('-')) {
        selector = args[i];
        break;
      }
    }
    if (selector?.startsWith('<')) continue;
    // A quoted mention with no PR, such as `grep 'gh pr merge'`, runs nothing.
    if (quote && selector === undefined) continue;
    // xargs or parallel supply the PR from input the guard cannot see.
    if (/\b(?:xargs|parallel)\b/.test(before)) selector ??= '<from input>';
    const computed =
      /[$`]/.test(selector ?? '') || /\b(?:xargs|parallel)\b/.test(before);
    repo ??= /github\.com\/([^/\s]+\/[^/\s]+)\/pull\//.exec(
      selector ?? '',
    )?.[1];
    targets.push({ selector, repo, computed });
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
      timeout: 10000,
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

function deny(reason) {
  return { permissionDecision: 'deny', reason };
}

function sameRepo(repo, cwd) {
  const origin = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd,
    encoding: 'utf8',
  });
  const name = (value) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\.git$/, '')
      .replace(/^.*github\.com[:/]/, '');
  return name(origin) === name(repo);
}

// The PR a selector names. A name gh finds no PR for, such as a word after a
// mention in prose, merges nothing, so it is undefined. Any other gh failure
// throws, and the hook fails closed.
function numberFor(selector, cwd) {
  const number = numberOf(selector);
  if (number) return number;
  // Git refuses these characters in a branch name.
  if (selector !== undefined && /[\s~^:?*[\\]|\.\.|^-/.test(selector))
    return undefined;
  try {
    return JSON.parse(
      execFileSync(
        'gh',
        ['pr', 'view', ...(selector ? [selector] : []), '--json', 'number'],
        {
          cwd,
          encoding: 'utf8',
          timeout: 10000,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    ).number;
  } catch (error) {
    if (/no pull requests found/i.test(String(error?.stderr ?? '')))
      return undefined;
    throw error;
  }
}

export async function check(targets, cwd) {
  const computed = targets.find((target) => target.computed);
  if (computed)
    return deny(
      `merge-order-guard: \`gh pr merge ${computed.selector}\` names its PR through a variable or substitution, which the guard cannot check. ` +
        'Merge one PR per command with its number written out, in the order `node scripts/quality/merge-order.mjs` gives.',
    );
  const here = targets.filter(
    (target) => !target.repo || sameRepo(target.repo, cwd),
  );
  if (!here.length) return undefined;
  const order = await import('../../scripts/quality/merge-order.mjs');
  const git = await import('../../scripts/quality/git.mjs');
  const numbers = here
    .map(({ selector }) => numberFor(selector, cwd))
    .filter(Boolean);
  if (!numbers.length) return undefined;
  const pulls = order.openPulls(cwd);
  const onMain = pulls.filter((pull) => pull.baseRefName === 'main');
  // gh refuses a PR that is not open, and a merge into another branch does
  // not change main, so neither has an order to keep.
  const merging = numbers.filter((number) =>
    onMain.some((pull) => pull.number === number),
  );
  if (!merging.length) return undefined;
  const main = order.fetchHeads(
    onMain.map((pull) => pull.headRefOid),
    cwd,
  );
  const prs = onMain.map((pull) => order.describe(pull, []));
  for (const number of merging) {
    const target = prs.find((pr) => pr.number === number);
    const others = prs.filter((pr) => pr.number !== number);
    const decision = decide(
      target,
      findBreaks({ main, target, others, cwd, git }),
      order.byPriority,
    );
    if (decision) return decision;
  }
  return undefined;
}

async function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Bash') return;
  const targets = mergeTargets(event.tool_input?.command ?? '');
  if (!targets.length) return;
  let decision;
  try {
    decision = await check(targets, event.cwd ?? process.cwd());
  } catch (error) {
    const message = String(error?.stderr || error?.message || error).trim();
    decision = deny(
      `merge-order-guard could not check the merge order (${message}). ` +
        'Retry once gh and the network work. Anthony can merge in GitHub himself.',
    );
  }
  const result = output(decision);
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  await main();
