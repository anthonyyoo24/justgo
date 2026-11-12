import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PreToolUse hook on Agent. Verifiers run on Opus, except two cases that run
// on Sonnet: a verifier whose PRs are all small by the verify-batch.mjs rule
// (no sensitive or boundary file, few counted lines), at most 4 of them, and
// a re-check of a docs- or tests-only, non-sensitive PR. Any doubt
// keeps Opus, including a brief that mentions a PR or issue number the hook
// did not check.
// Decision-trail reviews run on Sonnet. An audit runs on Sonnet unless its
// brief says `Sensitive: yes` or names a PR that touches a sensitive path.
// Any other Agent call that picks a non-Opus model keeps it only when its
// description starts with a routine-helper kind or a pstack Sonnet role.
// Otherwise the hook rewrites it to Opus, which beats blocking the work.
// settings.json sets onFailure "block", so a hook that cannot start, crashes or
// times out stops the Agent call instead of letting a requested Sonnet through.

// A verifier is named as one in the description, or asked for a verdict line.
const verifierName =
  /^\s*(?:independent\s+|fresh\s+)?(?:re-?verif\w*|verif(?:y|ies|ying|ied|iers?|ication)\b|re-?check(?:s|ing|ed)?\b)/i;
const verdictAsk = /Verifier verdict:/i;
const recheckName =
  /^\s*(?:fresh\s+)?(?:re-?verif\w*|re-?check(?:s|ing|ed)?\b)/i;
// Routine reviews, named by how the description starts.
// A trail review starts with "review" (optionally "final" or "close out the")
// and names the trail as a word, not as part of a name such as
// require-trail-review. Or it starts with "trail review", optionally after
// "close out the". A verdict is never
// a trail review.
const trailWord = String.raw`(?<![\w-])trail(?![\w-])`;
const trailName = new RegExp(
  String.raw`^\s*(?:(?:(?:final|close\s+out\s+the)\s+)?review\b.*${trailWord}|(?:close\s+out\s+the\s+)?(?:decision[\s-]+)?trail\s+review\b)`,
  'i',
);
const verdictWord = /\bverdict\b/i;
// An optional task id before "audit" must contain a digit, as in P15-4.
const auditName = /^\s*(?:(?=\S*\d)[\w.-]+\s+)?audit\b/i;
// The routine-helper kinds AGENTS.md lists, as description prefixes. The list
// is complete: anything else that asks for a cheaper model runs on Opus.
export const routinePrefixes = [
  'Research',
  'Inventory',
  'Docs pass',
  'Docs-only',
  'Lint fix',
  'Format',
  'Formatting fix',
];
// The pstack roles that ~/.claude/rules/pstack-models.md puts on Sonnet.
// pstack names no description for them, so a helper for one starts with its
// role name. The prefixes are plain words, so they join into one pattern.
export const pstackRolePrefixes = [
  'How explorer',
  'How explainer',
  'Why investigator',
  'Reflect',
  'Hillclimb',
  'Arena cross-judge',
];
const sonnetName = new RegExp(
  String.raw`^\s*(?:${[...routinePrefixes, ...pstackRolePrefixes].join('|')})s?(?![\w-])`,
  'i',
);
export const thisRepo = 'anthonyyoo24/justgo';
const prReference =
  /(?:\bPR\s*#|github\.com\/([\w.-]+\/[\w.-]+)\/pull\/)(\d+)\b/gi;
// Each PR a text names, as lowercase `owner/repo#N`. A link names its
// repository. `PR #N` means this one. review-rounds-guard.mjs reads links the
// same way and also reads lists such as `PRs #7, #8`.
const prKeysIn = (text) =>
  [...(text ?? '').matchAll(prReference)].map(
    ([, repo = thisRepo, number]) => `${repo.toLowerCase()}#${number}`,
  );
// Each JustGO PR number a text names, also in lists such as `PRs #7, #8 and
// #9`, as review-rounds-guard.mjs reads them. A link to another repository
// makes the set unknown, so the hook keeps Opus.
const prListReference =
  /(?:\bPRs?\s*#|github\.com\/([\w.-]+\/[\w.-]+)\/pull\/)\d+\b(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)#\d+\b)*/gi;
// Every number a text marks as a PR or issue: `#N`, `owner/repo#N`, or a
// GitHub pull or issue link. `&#N` is an HTML entity, not a reference.
const anyReference =
  /(?:github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull|issues)\/|\b([\w.-]+\/[\w.-]+)#|(?<!&)#)(\d+)\b/gi;
// GitHub lists at most 3000 files of a PR, so a list that long may be cut.
export const maxFiles = 3000;
// A verifier with more PRs than a batch holds stays on Opus.
export const maxSmallPulls = 4;

export function isVerifier(input) {
  return (
    verifierName.test(input.description ?? '') ||
    verdictAsk.test(input.prompt ?? '')
  );
}

export function kindOf(input) {
  if (isVerifier(input)) return 'verifier';
  const description = input.description ?? '';
  if (trailName.test(description) && !verdictWord.test(description))
    return 'trail';
  if (auditName.test(description)) return 'audit';
  if (input.model !== undefined && !/opus/i.test(input.model)) return 'helper';
  return undefined;
}

// The PR the brief names. Without exactly one, the hook cannot know the diff.
export function prOf(input) {
  const prs = new Set(
    prKeysIn(`${input.description ?? ''}\n${input.prompt ?? ''}`),
  );
  const [only] = prs;
  return prs.size === 1 && only.startsWith(`${thisRepo}#`)
    ? only.slice(thisRepo.length + 1)
    : undefined;
}

// The first reference in a text to a number outside `numbers`, or to another
// repository, or undefined when there is none.
export function strayReference(text, numbers) {
  for (const [found, link, short, number] of text.matchAll(anyReference)) {
    const repo = (link ?? short ?? thisRepo).toLowerCase();
    if (repo !== thisRepo || !numbers.has(number)) return found;
  }
  return undefined;
}

// The PRs a verifier brief names, or undefined when it names none, more than a
// batch holds, or one in another repository. A brief that also mentions a
// number the lists do not cover, as in `PRs #7 #8`, `#7–#9` or a stray issue,
// is unknown too, so a PR the hook did not size never reaches Sonnet.
export function prsOf(input) {
  const text = `${input.description ?? ''}\n${input.prompt ?? ''}`;
  const numbers = new Set();
  for (const [list, repo = thisRepo] of text.matchAll(prListReference)) {
    if (repo.toLowerCase() !== thisRepo) return undefined;
    for (const number of list.match(/(?<=#|\/pull\/)\d+/g)) numbers.add(number);
  }
  if (strayReference(text, numbers)) return undefined;
  return numbers.size > 0 && numbers.size <= maxSmallPulls
    ? [...numbers]
    : undefined;
}

// A PR's files with their line counts, in the shape verify-batch.mjs reads. A
// rename also lists its old path with no lines, so a sensitive or boundary
// path cannot hide behind a new name. A list that may be cut is unknown.
export function sizedFilesOf(entries) {
  if (!entries.length || entries.length >= maxFiles) return undefined;
  return entries.flatMap(
    ({ filename, previous_filename, additions = 0, deletions = 0 }) => [
      { path: filename, additions, deletions },
      ...(previous_filename
        ? [{ path: previous_filename, additions: 0, deletions: 0 }]
        : []),
    ],
  );
}

// The paths a verifier reviews, from GitHub's list of a PR's files. A rename
// counts its old path too, so a code or sensitive path cannot hide behind a
// docs or test name. A list that may be cut short counts as unknown.
export function filesOf(entries) {
  if (!entries.length || entries.length >= maxFiles) return undefined;
  return entries.flatMap(({ filename, previous_filename }) =>
    previous_filename ? [filename, previous_filename] : [filename],
  );
}

// `changed` holds the paths of the one PR the brief names. `pulls` holds the
// sized files of every PR the brief names, or undefined when any is unknown.
export function decide(
  input,
  changed,
  { isReviewOnly, isSensitivePath, sensitiveFlag, sizeExclusion },
  pulls,
) {
  const kind = kindOf(input);
  if (kind === 'trail')
    return { model: 'sonnet', reason: 'decision-trail review' };
  if (kind === 'audit')
    return sensitiveFlag.test(input.prompt ?? '') ||
      (changed ?? []).some((file) => isSensitivePath(file))
      ? { model: 'opus', reason: 'audit of sensitive work' }
      : { model: 'sonnet', reason: 'audit of non-sensitive work' };
  if (kind === 'helper')
    return /sonnet/i.test(input.model) &&
      sonnetName.test(input.description ?? '')
      ? undefined
      : {
          model: 'opus',
          reason: `only helpers whose description starts with ${routinePrefixes.join(', ')} or a pstack Sonnet role (${pstackRolePrefixes.join(', ')}) may pick Sonnet`,
        };
  if (kind !== 'verifier') return undefined;
  if (
    !sensitiveFlag.test(input.prompt ?? '') &&
    Array.isArray(pulls) &&
    pulls.length > 0 &&
    pulls.every((files) => files && !sizeExclusion(files))
  )
    return { model: 'sonnet', reason: 'every PR is small and not sensitive' };
  const sonnet =
    recheckName.test(input.description ?? '') &&
    !sensitiveFlag.test(input.prompt ?? '') &&
    Array.isArray(changed) &&
    changed.length > 0 &&
    changed.every((file) => isReviewOnly(file) && !isSensitivePath(file));
  return sonnet
    ? { model: 'sonnet', reason: 'docs- or tests-only, non-sensitive re-check' }
    : {
        model: 'opus',
        reason:
          changed === undefined
            ? 'no single PR named, or its files could not be read'
            : 'a PR is not small, or code or sensitive files changed',
      };
}

export function output(input, decision) {
  if (!decision || input.model === decision.model) return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `agent-model: ${decision.model} (${decision.reason})`,
      updatedInput: { ...input, model: decision.model },
    },
  };
}

// The files of a PR the brief names, read from GitHub, not from the spawning
// session's checkout. Undefined when GitHub cannot be read.
function prEntries(number) {
  try {
    const pages = JSON.parse(
      execFileSync(
        'gh',
        [
          'api',
          '--paginate',
          '--slurp',
          `repos/${thisRepo}/pulls/${number}/files?per_page=100`,
        ],
        { encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 * 1024 },
      ),
    );
    return pages.flat();
  } catch {
    return undefined;
  }
}

async function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Agent') return;
  const input = event.tool_input ?? {};
  const kind = kindOf(input);
  if (!kind) return;
  let result;
  try {
    const rules = {
      ...(await import('../../scripts/quality/sensitive-paths.mjs')),
      ...(await import('../../scripts/quality/verdict-patch.mjs')),
      ...(await import('../../scripts/quality/verify-batch.mjs')),
    };
    let files;
    let pulls;
    if (kind === 'audit') {
      const one = prOf(input);
      const entries = one && prEntries(one);
      files = entries && filesOf(entries);
    } else if (kind === 'verifier') {
      const numbers = prsOf(input) ?? [];
      const entries = new Map(numbers.map((n) => [n, prEntries(n)]));
      if (numbers.length > 0)
        pulls = numbers.map((n) => {
          const list = entries.get(n);
          return list ? sizedFilesOf(list) : undefined;
        });
      const list = numbers.length === 1 ? entries.get(numbers[0]) : undefined;
      files = list && filesOf(list);
    }
    result = output(input, decide(input, files, rules, pulls));
  } catch {
    result = output(input, { model: 'opus', reason: 'hook error' });
  }
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  await main();
