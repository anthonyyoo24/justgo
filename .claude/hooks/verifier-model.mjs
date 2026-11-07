import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PreToolUse hook on Agent. Verifiers run on Opus. A re-check of a docs- or
// tests-only, non-sensitive PR runs on Sonnet. Any doubt keeps Opus.
// settings.json sets onFailure "block", so a hook that cannot start, crashes or
// times out stops the Agent call instead of letting a requested Sonnet through.

// A verifier is named as one in the description, or asked for a verdict line.
const verifierName =
  /^\s*(?:independent\s+|fresh\s+)?(?:re-?verif\w*|verif(?:y|ier|ication)\b|re-?check\b)/i;
const verdictAsk = /Verifier verdict:/;
const recheckName = /^\s*(?:fresh\s+)?(?:re-?verif\w*|re-?check\b)/i;
// The PR the brief names. Without exactly one, the hook cannot know the diff.
const prReference = /(?:\bPR\s*#|\/pull\/)(\d+)\b/gi;

export function isVerifier(input) {
  return (
    verifierName.test(input.description ?? '') ||
    verdictAsk.test(input.prompt ?? '')
  );
}

export function prOf(input) {
  const numbers = new Set(
    [
      ...`${input.description ?? ''}\n${input.prompt ?? ''}`.matchAll(
        prReference,
      ),
    ].map(([, number]) => number),
  );
  return numbers.size === 1 ? [...numbers][0] : undefined;
}

export function decide(
  input,
  changed,
  { isReviewOnly, isSensitivePath, sensitiveFlag },
) {
  if (!isVerifier(input)) return undefined;
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
            : 'first verifier, or code or sensitive files changed',
      };
}

export function output(input, decision) {
  if (!decision || input.model === decision.model) return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `verifier-model: ${decision.model} (${decision.reason})`,
      updatedInput: { ...input, model: decision.model },
    },
  };
}

// The files of the PR the brief names, read from GitHub, not from the
// spawning session's checkout.
function prFiles(number) {
  if (!number) return undefined;
  try {
    const files = execFileSync(
      'gh',
      ['pr', 'view', number, '--json', 'files', '--jq', '.files[].path'],
      { encoding: 'utf8', timeout: 8000 },
    )
      .split('\n')
      .filter(Boolean);
    return files.length ? files : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Agent') return;
  const input = event.tool_input ?? {};
  if (!isVerifier(input)) return;
  let result;
  try {
    const rules = {
      ...(await import('../../scripts/quality/sensitive-paths.mjs')),
      ...(await import('../../scripts/quality/verdict-patch.mjs')),
    };
    result = output(input, decide(input, prFiles(prOf(input)), rules));
  } catch {
    result = output(input, { model: 'opus', reason: 'hook error' });
  }
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  await main();
