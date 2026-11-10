import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestVerdictOf } from '../../scripts/quality/merge-order.mjs';
import { runVerdictPatch } from '../../scripts/quality/verdict-status.mjs';

// PreToolUse hook on Bash. After a PASS, extra work goes in a follow-up PR,
// because a push that changes code needs a fresh Opus verifier. The hook
// denies a `git push` to an open PR's branch when the newest owner verdict is a
// PASS that covers the PR's current head and verdict-patch says the pushed
// commit needs `re-verify`. Docs- and tests-only pushes, rebases and merges
// from main keep the verdict and pass. So does any push to a PR with no PASS on
// its head, since it needs a verifier anyway.
//
// When the push cannot wait (Anthony asked for it, or hosted CI failed after
// the PASS), disarm auto-merge with `npm run merge:pr -- <n> --disable-auto`
// and prefix the push with PUSH_AFTER_PASS=1.
//
// The hook reads shell text and tracks `cd` and `git -C`, but does not parse
// every shell form. A push it cannot read, and any git, gh or network failure,
// lets the push through: this guard saves review rounds and protects no data.

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

const unquote = (word) => word.replace(/^(['"])(.*)\1$/, '$2');

function resolveDir(base, path) {
  const target = unquote(path);
  if (target === '~') return homedir();
  if (target.startsWith('~/')) return resolve(homedir(), target.slice(2));
  return resolve(base, target);
}

// The pushes in a command, each with the directory it runs in, its refspecs
// and whether it carries the PUSH_AFTER_PASS=1 acknowledgement.
export function pushesIn(command, cwd) {
  if (!mentionsPush.test(command)) return [];
  const pushes = [];
  let dir = cwd;
  for (const part of command.replace(/\\\r?\n/g, ' ').split(/&&|\|\||[;|\n]/)) {
    const words = part.trim().split(/\s+/).filter(Boolean).map(unquote);
    const env = [];
    while (words.length && /^[A-Za-z_]\w*=/.test(words[0]))
      env.push(words.shift());
    if (words[0] === 'cd' && words[1]) {
      dir = resolveDir(dir, words[1]);
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
    if (words[at] !== 'push') continue;
    const positional = [];
    let skip = false;
    const args = words.slice(at + 1);
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
    if (named) targets.push({ source, branch: named });
  }
  return targets;
}

const covers = (check) =>
  check.status === 0 && ['carries', 'docs-tests-only'].includes(check.result);

export function decide({ pr, verdict, remote, pushed, acknowledged }) {
  if (!verdict || verdict.unreadable || verdict.verdict === 'FAIL')
    return undefined;
  if (!covers(remote)) return undefined;
  if (pushed.status !== 1 || pushed.result !== 're-verify') return undefined;
  if (acknowledged) return undefined;
  return {
    permissionDecision: 'deny',
    reason:
      `push-after-pass-guard: PR #${pr.number} has a ${verdict.verdict} verdict on its head, ` +
      `and this push changes ${pushed.changed.join(', ')}, so it would need a fresh verifier. ` +
      'Put the change in a follow-up PR from main, or file an issue. ' +
      'If it cannot wait (Anthony asked for it, or CI failed after the PASS), run ' +
      `\`npm run merge:pr -- ${pr.number} --disable-auto\`, then rerun the push as ` +
      '`PUSH_AFTER_PASS=1 git push …` and get a fresh verdict before you re-arm.',
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

// Reads git and GitHub through `io` so tests can fake both.
export function evaluate(command, cwd, io) {
  for (const push of pushesIn(command, cwd)) {
    let current;
    try {
      current = io.git(['symbolic-ref', '--short', 'HEAD'], push.cwd).trim();
    } catch {
      current = undefined;
    }
    for (const target of targetsOf(push.refspecs, current)) {
      const sha = io
        .git(['rev-parse', '--verify', `${target.source}^{commit}`], push.cwd)
        .trim();
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
      if (!pr || pr.headRefOid === sha) continue;
      const verdict = newestVerdictOf(pr.comments);
      if (!verdict || verdict.unreadable || verdict.verdict === 'FAIL')
        continue;
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
      const pushed = parseCheck(io.check([...full, base, sha], push.cwd));
      const decision = decide({
        pr,
        verdict,
        remote,
        pushed,
        acknowledged: push.acknowledged,
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
