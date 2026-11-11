import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestVerdictOf } from '../../scripts/quality/merge-order.mjs';
import { isReviewOnly } from '../../scripts/quality/verdict-patch.mjs';
import { runVerdictPatch } from '../../scripts/quality/verdict-status.mjs';

// PreToolUse hook on Bash. After a PASS, extra work goes in a follow-up PR,
// because a push that changes code needs a fresh Opus verifier. The hook
// denies a `git push` to an open PR's branch when the newest owner verdict is a
// PASS that covers the PR's current head and verdict-patch says the pushed
// commit needs `re-verify`. A push passes when verdict-patch says it keeps the
// verdict (`carries` or `docs-tests-only`), which covers docs- and tests-only
// pushes and most rebases and merges from main. So does any push to a PR with
// no PASS on its head, since it needs a verifier anyway.
//
// A push in the same command as a commit, merge, rebase or other step that
// makes commits cannot be checked before those commits exist. When the PR has
// a PASS on its head, the hook denies that command and asks for the steps to
// run as separate commands.
//
// When the push cannot wait (Anthony asked for it, or hosted CI failed after
// the PASS), disarm auto-merge with `pnpm run merge:pr <n> --disable-auto`
// and prefix the push with PUSH_AFTER_PASS=1.
//
// The hook reads shell text. It treats heredoc bodies and quoted strings as
// data, and tracks `cd`, `git -C` and branch switches, but does not parse every
// shell form. A push it cannot read, and any git, gh or network failure, lets
// the push through: this guard saves review rounds and protects no data.

const mentionsPush = /\bgit\b[\s\S]*\bpush\b/;
const skippedFlags = new Set([
  '-n',
  '--dry-run',
  '-d',
  '--delete',
  '--tags',
  '--mirror',
  '--all',
  '--prune',
]);
const valueFlags = new Set(['-o', '--push-option', '--repo', '--receive-pack']);
// git subcommands that can make or move commits before a later push.
const commitMakers = new Set([
  'commit',
  'merge',
  'cherry-pick',
  'revert',
  'am',
  'rebase',
  'pull',
  'reset',
]);
const newBranchFlags = new Set(['-b', '-B', '-c', '-C']);

// A character that ends an unquoted shell word.
const wordEnd = /[\s;&|()<>]/;
const plainWord = /^[\w./:@~+^-]+$/;

// The index of the double quote that closes the one at `start`, or -1.
function doubleQuoteEnd(text, start) {
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '"') return i;
  }
  return -1;
}

// The index just past the `))` that closes the `((` at `start`, or -1.
function arithmeticEnd(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && --depth === 0) return i + 1;
  }
  return -1;
}

// A heredoc delimiter word after `<<` or `<<-`: its text after quote removal
// and the index just past it. A quote that does not close on the same line
// makes it no delimiter.
function delimiterAt(text, start) {
  let tag = '';
  let i = start;
  while (i < text.length && !wordEnd.test(text[i])) {
    const end =
      text[i] === "'"
        ? text.indexOf("'", i + 1)
        : text[i] === '"'
          ? doubleQuoteEnd(text, i)
          : i + (text[i] === '\\' ? 1 : 0);
    if (end === -1 || text.slice(i, end).includes('\n')) return undefined;
    const part = text.slice(i, end + 1);
    tag +=
      part.length === 1
        ? part
        : part[0] === '\\'
          ? part[1]
          : part[0] === "'"
            ? part.slice(1, -1)
            : part.slice(1, -1).replace(/\\([$`"\\])/g, '$1');
    i = end + 1;
  }
  return tag ? { tag, end: i } : undefined;
}

// Each line's end, and the lines that hold each possible tag: exactly, and
// with leading tabs stripped for `<<-`.
function tagLinesOf(text) {
  const ends = [];
  const exact = new Map();
  const tabbed = new Map();
  let offset = 0;
  text.split('\n').forEach((line, n) => {
    offset += line.length;
    ends.push(offset);
    offset += 1;
    for (const [lines, key] of [
      [exact, line],
      [tabbed, line.replace(/^\t+/, '')],
    ]) {
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push(n);
    }
  });
  return { ends, exact, tabbed };
}

// The index of the first number in a sorted list above `after`, or the
// list's length when there is none.
function firstAbove(list, after) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (list[middle] > after) high = middle;
    else low = middle + 1;
  }
  return low;
}

// Heredoc bodies and quoted strings are data, so separators and words inside
// them never start a command. A quoted plain word, such as "fix", keeps its
// text, and any other quoted string reads `__quoted__`.
//
// Heredocs are read as bash reads them (#424). An opener counts only outside
// quotes, comments and `((...))`, and `<<<` is a here-string. At the end of the
// opener's line, each heredoc on it takes the lines up to one that is exactly
// its tag, in order, and leading tabs are stripped only for `<<-`. That line
// can be the next one, which leaves the body empty (#421). Bash reads a
// heredoc with no closing line to the end of the text, but here the text after
// the bodies that did close stays text, so the guards still read it. Each
// closing line is found by a binary search over an index built in one pass,
// so the time stays near linear (#405).
export function shellText(command) {
  const text = command.replace(/\\\r?\n/g, ' ');
  const pieces = [];
  let pending = [];
  let lines;
  // After a quote or `((` that never closes, later ones are read as text, so
  // no search runs to the end of the text twice.
  let doubleOpen = true;
  let arithmeticOpen = true;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '\\') {
      pieces.push(text.slice(i, i + 2));
      i += 2;
    } else if (char === "'" || (char === '"' && doubleOpen)) {
      const end =
        char === "'" ? text.indexOf("'", i + 1) : doubleQuoteEnd(text, i);
      if (end === -1) {
        if (char === '"') doubleOpen = false;
        pieces.push(char);
        i += 1;
      } else {
        const inner = text.slice(i + 1, end);
        pieces.push(plainWord.test(inner) ? inner : '__quoted__');
        i = end + 1;
      }
    } else if (char === '#' && (i === 0 || wordEnd.test(text[i - 1]))) {
      const end = text.indexOf('\n', i);
      pieces.push(text.slice(i, end === -1 ? text.length : end));
      i = end === -1 ? text.length : end;
    } else if (text.startsWith('((', i) && arithmeticOpen) {
      const end = arithmeticEnd(text, i);
      if (end === -1) arithmeticOpen = false;
      else {
        pieces.push(text.slice(i, end));
        i = end;
      }
    } else if (text.startsWith('<<', i)) {
      // In a here-string, `<<<`, the third `<` ends the word, so it has no
      // delimiter and opens nothing.
      const dash = text[i + 2] === '-';
      let start = i + (dash ? 3 : 2);
      while (text[start] === ' ' || text[start] === '\t') start += 1;
      const delimiter = delimiterAt(text, start);
      const end = delimiter?.end ?? i + 2;
      pieces.push(text.slice(i, end));
      if (delimiter)
        pending.push({ tag: delimiter.tag, dash, piece: pieces.length - 1 });
      i = end;
    } else if (char === '\n' && pending.length) {
      lines ??= tagLinesOf(text);
      const line = firstAbove(lines.ends, i - 1);
      let last = line;
      for (const { tag, dash, piece } of pending) {
        const tagLines = (dash ? lines.tabbed : lines.exact).get(tag) ?? [];
        const closing = tagLines[firstAbove(tagLines, last)];
        if (closing === undefined) break;
        pieces[piece] = ' ';
        last = closing;
      }
      pending = [];
      if (last === line) {
        pieces.push(char);
        i += 1;
      } else i = lines.ends[last];
    } else {
      pieces.push(char);
      i += 1;
    }
  }
  return pieces.join('');
}

function resolveDir(base, target) {
  if (target === '~') return homedir();
  if (target.startsWith('~/')) return resolve(homedir(), target.slice(2));
  return resolve(base, target);
}

// The pushes in a command. Each has the directory it runs in, its refspecs,
// whether it carries the PUSH_AFTER_PASS=1 acknowledgement, the branch an
// earlier `git checkout` or `git switch` moved to, and whether an earlier step
// can make commits it would send.
export function pushesIn(command, cwd) {
  if (!mentionsPush.test(command)) return [];
  const pushes = [];
  let dir = cwd;
  let branch;
  let afterChange = false;
  for (const part of shellText(command).split(/&&|\|\||[;|&\n]/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    const env = [];
    while (words.length && /^[A-Za-z_]\w*=/.test(words[0]))
      env.push(words.shift());
    if (words[0] === 'cd' && words[1]) {
      dir = resolveDir(dir, words[1]);
      branch = undefined;
      continue;
    }
    if (words[0] !== 'git') continue;
    let at = 1;
    let gitDir = dir;
    while (at < words.length && words[at].startsWith('-')) {
      if (words[at] === '-C') {
        gitDir = resolveDir(gitDir, words[at + 1] ?? '.');
        at += 2;
      } else at += words[at] === '-c' ? 2 : 1;
    }
    const sub = words[at];
    const args = words.slice(at + 1);
    if (commitMakers.has(sub)) {
      afterChange = true;
      continue;
    }
    if (sub === 'checkout' || sub === 'switch') {
      const flag = args.findIndex((arg) => newBranchFlags.has(arg));
      const named =
        flag >= 0
          ? args[flag + 1]
          : args.length === 1 && !args[0].startsWith('-')
            ? args[0]
            : undefined;
      if (named) branch = named;
      continue;
    }
    if (sub !== 'push') continue;
    const positional = [];
    let skip = false;
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (skippedFlags.has(arg)) skip = true;
      else if (valueFlags.has(arg)) i += 1;
      else if (!arg.startsWith('-')) positional.push(arg);
    }
    if (skip) continue;
    pushes.push({
      cwd: gitDir,
      refspecs: positional.slice(1),
      acknowledged: env.includes('PUSH_AFTER_PASS=1'),
      branch,
      afterChange,
    });
  }
  return pushes;
}

// Each refspec as the local commit it sends and the branch it updates. With no
// refspec, git pushes the current branch.
export function targetsOf(refspecs, currentBranch) {
  const specs = refspecs.length ? refspecs : ['HEAD'];
  const targets = [];
  for (const raw of specs) {
    const spec = raw.replace(/^\+/, '');
    const [source, destination = source] = spec.includes(':')
      ? spec.split(':')
      : [spec];
    if (!source) continue;
    const branch = destination.replace(/^refs\/heads\//, '');
    const named = branch === 'HEAD' ? currentBranch : branch;
    if (named)
      targets.push({
        source: source === 'HEAD' && currentBranch ? currentBranch : source,
        branch: named,
      });
  }
  return targets;
}

const covers = (check) =>
  check.status === 0 && ['carries', 'docs-tests-only'].includes(check.result);

const wayOut = (number) =>
  'If it cannot wait (Anthony asked for it, or CI failed after the PASS), run ' +
  `\`pnpm run merge:pr ${number} --disable-auto\`, then rerun the push as ` +
  '`PUSH_AFTER_PASS=1 git push …` and get a fresh verdict before you re-arm.';

// The files that make this push need a verifier: code files whose patch the
// verdict did not cover and the remote head did not already change.
export function newCodeFiles(remote, pushed) {
  const code = pushed.changed.filter((file) => !isReviewOnly(file));
  const fresh = code.filter((file) => !remote.changed.includes(file));
  return fresh.length ? fresh : code.length ? code : pushed.changed;
}

export function decide({
  pr,
  verdict,
  remote,
  pushed,
  acknowledged,
  afterChange,
}) {
  if (!verdict || verdict.unreadable || verdict.verdict === 'FAIL')
    return undefined;
  if (!covers(remote) || acknowledged) return undefined;
  if (afterChange)
    return {
      permissionDecision: 'deny',
      reason:
        `push-after-pass-guard: PR #${pr.number} has a ${verdict.verdict} verdict on its head, ` +
        'and this command makes commits before it pushes, so the hook cannot check what the push sends. ' +
        'Run the commit, merge or rebase as its own command, then push in a separate command. ' +
        'Code changes after a PASS go in a follow-up PR from main, or an issue. ' +
        wayOut(pr.number),
    };
  if (pushed?.status !== 1 || pushed.result !== 're-verify') return undefined;
  return {
    permissionDecision: 'deny',
    reason:
      `push-after-pass-guard: PR #${pr.number} has a ${verdict.verdict} verdict on its head, ` +
      `and this push changes ${newCodeFiles(remote, pushed).join(', ')}, so it would need a fresh verifier. ` +
      'Put the change in a follow-up PR from main, or file an issue. ' +
      wayOut(pr.number),
  };
}

function parseCheck({ status, stdout }) {
  const [result = '', ...changed] = stdout.trim().split('\n');
  return {
    status,
    result: result.trim(),
    changed: changed.map((line) => line.trim()).filter(Boolean),
  };
}

function tryGit(io, args, cwd) {
  try {
    return io.git(args, cwd).trim();
  } catch {
    return undefined;
  }
}

// Reads git and GitHub through `io` so tests can fake both.
export function evaluate(command, cwd, io) {
  for (const push of pushesIn(command, cwd)) {
    const current =
      push.branch ?? tryGit(io, ['symbolic-ref', '--short', 'HEAD'], push.cwd);
    for (const target of targetsOf(push.refspecs, current)) {
      const [pr] = JSON.parse(
        io.gh(
          [
            'pr',
            'list',
            '--head',
            target.branch,
            '--state',
            'open',
            '--json',
            'number,headRefOid,baseRefName,comments',
          ],
          push.cwd,
        ),
      );
      if (!pr) continue;
      const verdict = newestVerdictOf(pr.comments);
      if (!verdict || verdict.unreadable || verdict.verdict === 'FAIL')
        continue;
      const sha = push.afterChange
        ? undefined
        : tryGit(
            io,
            ['rev-parse', '--verify', `${target.source}^{commit}`],
            push.cwd,
          );
      if (!push.afterChange && (!sha || sha === pr.headRefOid)) continue;
      const full = [verdict.base, verdict.head].map((ref) =>
        io
          .gh(
            ['api', `repos/{owner}/{repo}/commits/${ref}`, '--jq', '.sha'],
            push.cwd,
          )
          .trim(),
      );
      io.git(
        [
          'fetch',
          '-q',
          '--no-tags',
          'origin',
          pr.baseRefName,
          pr.headRefOid,
          ...new Set(full),
        ],
        push.cwd,
      );
      const base = `origin/${pr.baseRefName}`;
      const remote = parseCheck(
        io.check([...full, base, pr.headRefOid], push.cwd),
      );
      const pushed = sha
        ? parseCheck(io.check([...full, base, sha], push.cwd))
        : undefined;
      const decision = decide({
        pr,
        verdict,
        remote,
        pushed,
        acknowledged: push.acknowledged,
        afterChange: push.afterChange,
      });
      if (decision) return decision;
    }
  }
  return undefined;
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

const run = (file) => (args, cwd) =>
  execFileSync(file, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
  });

function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Bash') return;
  let result;
  try {
    result = output(
      evaluate(
        String(event.tool_input?.command ?? ''),
        event.cwd ?? process.cwd(),
        { git: run('git'), gh: run('gh'), check: runVerdictPatch },
      ),
    );
  } catch {
    result = undefined;
  }
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
