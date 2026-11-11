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

const heredocOpener = /<<-?[ \t]*(['"]?)(\w+)\1/g;

// Each heredoc becomes the rest of its opener line, so its body is gone. A
// body ends at the first later line that holds only its whole tag, as in the
// shell. An opener with no closing line stays text. One pass lists the tag
// lines and each tag's list is read forward, so the time is linear (#405).
function withoutHeredocs(text) {
  const tagLines = new Map();
  for (let start = text.indexOf('\n'); start !== -1;) {
    const next = text.indexOf('\n', start + 1);
    const end = next === -1 ? text.length : next;
    const tag = /^[ \t]*(\w+)[ \t]*$/.exec(text.slice(start + 1, end))?.[1];
    if (tag) {
      if (!tagLines.has(tag)) tagLines.set(tag, { lines: [], next: 0 });
      tagLines.get(tag).lines.push({ start, end });
    }
    start = next;
  }
  let out = '';
  let kept = 0;
  let newline = -1;
  heredocOpener.lastIndex = 0;
  for (let match; (match = heredocOpener.exec(text));) {
    // Openers come in order, so the newline after the last one is reused
    // until an opener passes it. With no newline left, no body can start.
    if (newline < match.index) newline = text.indexOf('\n', match.index);
    if (newline === -1) break;
    const closings = tagLines.get(match[2]);
    while (closings?.lines[closings.next]?.start <= newline) closings.next += 1;
    const closing = closings?.lines[closings.next];
    if (!closing) {
      heredocOpener.lastIndex = match.index + 1;
      continue;
    }
    out += `${text.slice(kept, match.index)} ${text.slice(heredocOpener.lastIndex, newline)}`;
    kept = closing.end;
    heredocOpener.lastIndex = closing.end;
  }
  return out + text.slice(kept);
}

// Heredoc bodies and quoted strings are data, so separators and words inside
// them never start a command. A quoted plain word, such as "fix", keeps its
// text.
export function shellText(command) {
  return withoutHeredocs(command.replace(/\\\r?\n/g, ' ')).replace(
    /'[^']*'|"(?:[^"\\]|\\.)*"/g,
    (match) => {
      const inner = match.slice(1, -1);
      return /^[\w./:@~+^-]+$/.test(inner) ? inner : '__quoted__';
    },
  );
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
