import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newestVerdictOf } from '../../scripts/quality/merge-order.mjs';
import { runVerdictPatch } from '../../scripts/quality/verdict-status.mjs';
import { isVerifier } from './verifier-model.mjs';

// PreToolUse hook on Agent. It stops review loops, as AGENTS.md "Review
// rounds" says. It denies a verifier on an open PR in two cases:
//
// - The newest owner verdict is PASS or PASS+NOTES and still covers the PR
//   head: the head matches, or verdict-patch says `carries` or
//   `docs-tests-only`. Notes go to an issue or a follow-up PR, not another round.
// - The PR already has 3 FAIL verdicts: the first review and two fix rounds.
//   The PR goes to Anthony.
//
// A brief with a line `Another round: <Anthony's words>` passes, for when
// Anthony asks for one. Any git or GitHub failure lets the call through: this
// guard saves review rounds and protects no data.

const prReference = /(?:\bPR\s*#|\/pull\/)(\d+)\b/gi;
const anotherRound = /^[ \t]*\**Another round:\**[ \t]*\S/im;
const maxFails = 3;

const numbersIn = (text) => [
  ...new Set([...(text ?? '').matchAll(prReference)].map(([, n]) => n)),
];

// The PRs under review: those the description names, or else those the
// prompt names, as for a batch verifier. A prompt that only mentions a PR,
// such as a stacked parent, never blocks a verifier of another PR.
export function prsOf(input) {
  const named = numbersIn(input.description);
  return named.length ? named : numbersIn(input.prompt);
}

function passCovers(number, pr, verdict, cwd, io) {
  if (pr.headRefOid.startsWith(verdict.head)) return true;
  const full = [verdict.base, verdict.head].map((ref) =>
    io
      .gh(['api', `repos/{owner}/{repo}/commits/${ref}`, '--jq', '.sha'], cwd)
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
    cwd,
  );
  const { status, stdout } = io.check(
    [...full, `origin/${pr.baseRefName}`, pr.headRefOid],
    cwd,
  );
  const result = (stdout ?? '').split('\n')[0];
  return status === 0 && ['carries', 'docs-tests-only'].includes(result);
}

function checkPr(number, cwd, io) {
  const pr = JSON.parse(
    io.gh(
      ['pr', 'view', number, '--json', 'state,headRefOid,baseRefName,comments'],
      cwd,
    ),
  );
  if (pr.state !== 'OPEN') return undefined;
  const fails = (pr.comments ?? []).filter(
    (comment) => newestVerdictOf([comment])?.verdict === 'FAIL',
  ).length;
  if (fails >= maxFails)
    return `PR #${number} has ${fails} FAIL verdicts, and the limit is ${maxFails}: the first review and two fix rounds. Stop and bring it to Anthony with what still fails.`;
  const verdict = newestVerdictOf(pr.comments);
  if (
    verdict &&
    !verdict.unreadable &&
    verdict.verdict !== 'FAIL' &&
    passCovers(number, pr, verdict, cwd, io)
  )
    return `PR #${number} already has a passing verdict (${verdict.verdict}) that covers its head, so it needs no other round. Merge it, and put each note in an issue or a follow-up PR.`;
  return undefined;
}

// Reads git and GitHub through `io` so tests can fake both.
export function evaluate(input, cwd, io) {
  if (!isVerifier(input) || anotherRound.test(input.prompt ?? ''))
    return undefined;
  const reasons = [];
  for (const number of prsOf(input)) {
    try {
      const reason = checkPr(number, cwd, io);
      if (reason) reasons.push(reason);
    } catch {
      // Fail open for this PR.
    }
  }
  if (!reasons.length) return undefined;
  return {
    permissionDecision: 'deny',
    reason: `${reasons.join(' ')} If Anthony asked for another round, add a line \`Another round: <his words>\` to the brief.`,
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

const run = (file) => (args, cwd) =>
  execFileSync(file, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
  });

function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Agent') return;
  let result;
  try {
    result = output(
      evaluate(event.tool_input ?? {}, event.cwd ?? process.cwd(), {
        git: run('git'),
        gh: run('gh'),
        check: runVerdictPatch,
      }),
    );
  } catch {
    result = undefined;
  }
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
