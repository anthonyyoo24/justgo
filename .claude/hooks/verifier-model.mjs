import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { changedPaths } from '../../scripts/quality/git.mjs';
import {
  isSensitivePath,
  sensitiveFlag,
} from '../../scripts/quality/sensitive-paths.mjs';
import { isReviewOnly } from '../../scripts/quality/verdict-patch.mjs';

// PreToolUse hook on Agent. Verifiers run on Opus. A re-check of a docs- or
// tests-only, non-sensitive change runs on Sonnet. Any doubt keeps Opus.
const verifier = /\bverif(?:y|ier|ication)\b|\bverdict\b/i;
const recheck = /\bre-?(?:verif\w*|check\w*)\b/i;

const textOf = (input) => `${input.description ?? ''}\n${input.prompt ?? ''}`;
export const isVerifier = (input) =>
  verifier.test(textOf(input)) || recheck.test(textOf(input));

export function decide(input, changed) {
  const text = textOf(input);
  if (!isVerifier(input)) return undefined;
  const sonnet =
    recheck.test(text) &&
    !sensitiveFlag.test(text) &&
    Array.isArray(changed) &&
    changed.length > 0 &&
    changed.every((file) => isReviewOnly(file) && !isSensitivePath(file));
  return sonnet
    ? {
        model: 'sonnet',
        reason: 'docs- or tests-only, non-sensitive re-check',
      }
    : {
        model: 'opus',
        reason:
          changed === undefined
            ? 'could not read the PR diff'
            : 'verifier default, or code or sensitive files changed',
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

function prDiff(cwd) {
  try {
    const base = process.env.JUSTGO_VERIFY_BASE ?? 'origin/main';
    return changedPaths(`${base}...HEAD`, cwd);
  } catch {
    return undefined;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let input = {};
  try {
    const event = JSON.parse(readFileSync(0, 'utf8'));
    if (event.tool_name !== 'Agent') process.exit(0);
    input = event.tool_input ?? {};
    const result = output(
      input,
      decide(input, prDiff(event.cwd ?? process.env.CLAUDE_PROJECT_DIR)),
    );
    if (result) process.stdout.write(JSON.stringify(result));
  } catch {
    // A broken hook must not hand a verifier to a smaller model. Forcing Opus
    // only applies when the input names a verifier; otherwise the parent
    // model, Opus here, stays in place.
    const result = isVerifier(input)
      ? output(input, { model: 'opus', reason: 'hook error' })
      : undefined;
    if (result) process.stdout.write(JSON.stringify(result));
  }
}
