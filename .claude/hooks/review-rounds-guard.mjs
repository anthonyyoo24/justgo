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
// - The PR already has 3 FAIL verdicts that show a failure: the first review
//   and two fix rounds. The PR goes to Anthony. A FAIL with no `Failure shown:`
//   line shows no defect, as verdict-status.mjs says, so it uses up no round.
//
// A brief with a line `Another round: <Anthony's words>` passes, for when
// Anthony asks for one. Any git or GitHub failure lets the call through: this
// guard saves review rounds and protects no data. So does running out of
// time: every git, GitHub and verdict-patch call shares one budget that ends
// well before the hook timeout in settings.json.

// A reference is one PR (`PR #7`, a `/pull/7` link) or a list (`PRs #7, #8
// and #9`). Each listed number keeps its `#`, so `PR #7, 2 files` names one PR.
const prReference =
  /(?:\bPRs?\s*#|\/pull\/)\d+\b(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)#\d+\b)*/gi;
const anotherRound = /^[ \t]*\**Another round:\**[ \t]*\S/im;
const maxFails = 3;
export const budgetMs = 45000;
const callMs = 15000;

const numbersIn = (text) => [
  ...new Set(
    [...(text ?? '').matchAll(prReference)].flatMap(([list]) =>
      list.match(/\d+/g),
    ),
  ),
];

// The PRs under review: those the description names, or else those the
// prompt names, as for a batch verifier whose description names none. A
// prompt that only mentions a PR, such as a stacked parent, never blocks a
// verifier whose description names its PRs.
export function prsOf(input) {
  const named = numbersIn(input.description);
  return named.length
    ? { numbers: named, from: 'description' }
    : { numbers: numbersIn(input.prompt), from: 'prompt' };
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
    (comment) => newestVerdictOf([comment])?.failureShown,
  ).length;
  if (fails >= maxFails)
    return `PR #${number} has ${fails} FAIL verdicts that show a failure, and the limit is ${maxFails}: the first review and two fix rounds. Stop and bring it to Anthony with what still fails.`;
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
  const { numbers, from } = prsOf(input);
  for (const number of numbers) {
    try {
      const reason = checkPr(number, cwd, io);
      if (reason) reasons.push(reason);
    } catch {
      // Fail open for this PR.
    }
  }
  if (!reasons.length) return undefined;
  const scope =
    from === 'prompt'
      ? ' The description names no PR, so every PR the prompt mentions was checked. If the prompt only mentions one of these, name the PRs under review in the description, as in `Verify PRs #7, #8`.'
      : '';
  return {
    permissionDecision: 'deny',
    reason: `${reasons.join(' ')}${scope} If Anthony asked for another round, add a line \`Another round: <his words>\` to the brief.`,
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

// The time left for the next call, capped per call. It throws once the
// budget is spent, so the PR being checked fails open.
export function timeLeft(deadline, now = Date.now) {
  const left = Math.min(callMs, deadline - now());
  if (left <= 0) throw new Error('review-rounds-guard: time budget spent');
  return left;
}

export function processIo(deadline) {
  const run = (file) => (args, cwd) =>
    execFileSync(file, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeLeft(deadline),
    });
  return {
    git: run('git'),
    gh: run('gh'),
    check: (refs, cwd) => runVerdictPatch(refs, cwd, timeLeft(deadline)),
  };
}

function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Agent') return;
  let result;
  try {
    result = output(
      evaluate(
        event.tool_input ?? {},
        event.cwd ?? process.cwd(),
        processIo(Date.now() + budgetMs),
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
